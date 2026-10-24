"""AutoAVSR visual-only LRS3 model (LRS3_V_WER19.1) + LRS3 subword LM, decoded to an N-best list."""

import logging
import time
from dataclasses import dataclass

import numpy as np
import torch

from .paths import LM_CONF, LM_PATH, MODEL_CONF, MODEL_PATH, SPM_MODEL, add_vsr_to_path

add_vsr_to_path()
from espnet.asr.asr_utils import parse_hypothesis  # noqa: E402
from espnet.nets.batch_beam_search import BatchBeamSearch  # noqa: E402
from espnet.nets.scorer_interface import BatchScorerInterface  # noqa: E402
from pipelines.data.transforms import VideoTransform  # noqa: E402
from pipelines.model import AVSR  # noqa: E402

log = logging.getLogger(__name__)


@dataclass(frozen=True)
class DecodeConfig:
    beam: int = 40
    ctc_weight: float = 0.1
    lm_weight: float = 0.2  # 0 disables the LM; 0.2 won the sweep (docs/RESULTS.md)
    nbest: int = 10
    name_bias: float = 2.0  # log-prob bonus per subword piece that spells a vocab word (TODO(hackathon): tune)


class NameBias(BatchScorerInterface):
    """Contextual biasing: a bonus for every token that continues spelling a vocab word, taken back if the
    word is abandoned half-way (or the sentence ends there), so only finished words keep it. Words are a
    trie of the checkpoint's subword pieces, with a few alternative segmentations each.

    Stateless: the partial word is recomputed from the prefix every step, so beam reordering can't desync it.
    """

    def __init__(self, token_list: list[str], bonus: float):
        self.n_vocab = len(token_list)
        self.eos = self.n_vocab - 1
        self.bonus = bonus
        self.word_start = [t.startswith("▁") for t in token_list]
        self.index = {t: i for i, t in enumerate(token_list)}
        self._sp = None
        self.set_words([])

    def set_words(self, words: list[str]) -> list[str]:
        """Rebuild the trie. Returns the words that could be spelled (no <unk> pieces)."""
        self.children: list[dict[int, int]] = [{}]  # node -> {token: child node}; node 0 is the root
        self.depth, self.terminal, self._rows = [0], [False], {}
        self.max_len, used = 0, []
        for w in words:
            segs = self._segmentations(w)
            if not segs:
                continue
            used.append(w)
            for seg in segs:
                node = 0
                for tok in seg:
                    nxt = self.children[node].get(tok)
                    if nxt is None:
                        nxt = len(self.children)
                        self.children[node][tok] = nxt
                        self.children.append({})
                        self.depth.append(self.depth[node] + 1)
                        self.terminal.append(False)
                    node = nxt
                self.terminal[node] = True
                self.max_len = max(self.max_len, len(seg))
        return used

    def _segmentations(self, word: str, n: int = 4) -> list[list[int]]:
        if self._sp is None:
            import sentencepiece as spm

            self._sp = spm.SentencePieceProcessor(model_file=str(SPM_MODEL))
        text = word.upper().replace("’", "'")
        out = []
        for pieces in [self._sp.encode(text, out_type=str)] + self._sp.nbest_encode_as_pieces(text, n):
            ids = [self.index.get(p) for p in pieces]
            if ids and None not in ids and ids not in out:
                out.append(ids)
        return out

    def _node(self, ys: list[int]) -> int:
        """Trie node of the longest suffix of ys that starts at a word start and spells a vocab prefix."""
        for start in range(max(1, len(ys) - self.max_len), len(ys)):  # earliest start = longest match
            if not self.word_start[ys[start]]:
                continue
            node = 0
            for tok in ys[start:]:
                node = self.children[node].get(tok, -1)
                if node < 0:
                    break
            if node > 0:
                return node
        return 0

    def _row(self, node: int, device, dtype) -> torch.Tensor:
        key = (node, device, dtype)
        row = self._rows.get(key)
        if row is None:
            d = self.depth[node]
            # leaving a half-spelled word (any token that doesn't continue it, <eos> included) gives the bonus back
            base = -self.bonus * d if d and not self.terminal[node] else 0.0
            row = torch.full((self.n_vocab,), base, dtype=dtype)
            for tok in self.children[0]:  # starting a new vocab word
                row[tok] = base + self.bonus
            for tok in self.children[node]:  # continuing this one
                row[tok] = self.bonus
            row = self._rows[key] = row.to(device)
        return row

    def score(self, y, state, x):
        return self._row(self._node(y.tolist()), x.device, x.dtype), None

    def batch_score(self, ys, states, xs):
        if len(self.children) == 1:
            return torch.zeros(ys.shape[0], self.n_vocab, device=xs.device, dtype=xs.dtype), None
        return torch.stack([self._row(self._node(y), xs.device, xs.dtype) for y in ys.tolist()]), None


def load(cfg: DecodeConfig, device: str) -> AVSR:
    use_lm = cfg.lm_weight > 0
    avsr = AVSR("video", str(MODEL_PATH), str(MODEL_CONF), str(LM_PATH) if use_lm else None, str(LM_CONF),
                penalty=0.0, ctc_weight=cfg.ctc_weight, lm_weight=cfg.lm_weight, beam_size=cfg.beam,
                device=device)
    # A second beam search over the same modules (no extra GPU memory), used only when there's a vocab, so
    # decoding without one is unchanged. Its pre-beam ranks tokens by the full score, bias included: with the
    # default decoder-only pre-beam a rare first piece like "▁SAR" never makes the top 60, and CTC then
    # scores it as impossible.
    bs = avsr.beam_search
    avsr.names = NameBias(avsr.token_list, cfg.name_bias)
    avsr.biased_search = BatchBeamSearch(
        beam_size=bs.beam_size, vocab_size=bs.n_vocab, weights={**bs.weights, "names": 1.0},
        scorers={**bs.scorers, "names": avsr.names}, sos=bs.sos, eos=bs.eos, token_list=bs.token_list,
        pre_beam_score_key="full").eval()
    return avsr


_transform = VideoTransform(speed_rate=1)  # /255, centre crop 88, normalize (inference only)


def to_input(crop: np.ndarray) -> torch.Tensor:
    """(T, 96, 96) uint8 -> (1, T, 88, 88) float, the model's input."""
    return _transform(torch.from_numpy(np.ascontiguousarray(crop)))


@torch.no_grad()
def decode(avsr: AVSR, crop: np.ndarray, nbest: int = 10,
           vocab: list[str] | None = None) -> tuple[list[tuple[str, float, int]], dict]:
    """Returns ([(text, log_prob, n_tokens)], timings_ms), best first, distinct texts, lowercase.
    With a vocab the beam is biased toward those words, and log_prob includes the bonus."""
    search = avsr.beam_search
    if vocab:
        used = avsr.names.set_words(vocab)
        if len(used) < len(vocab):
            log.info("vocab: can't spell %s with the model's pieces", sorted(set(vocab) - set(used)))
        search = avsr.biased_search
    t0 = time.perf_counter()
    x = to_input(crop).to(avsr.device)
    enc = avsr.model.encode(x)
    if x.is_cuda:
        torch.cuda.synchronize()
    t1 = time.perf_counter()
    hyps = search(enc)
    t2 = time.perf_counter()
    seen, out = set(), []
    for h in hyps:
        text = parse_hypothesis(h.asdict(), avsr.token_list)[0]
        text = " ".join(text.replace("▁", " ").replace("<eos>", "").split()).lower()
        if text and text not in seen:
            seen.add(text)
            out.append((text, float(h.score), len(h.yseq) - 1))
        if len(out) >= nbest:
            break
    return out, {"encode_ms": (t1 - t0) * 1000, "beam_ms": (t2 - t1) * 1000}
