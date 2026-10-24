"""AutoAVSR visual-only LRS3 model (LRS3_V_WER19.1) + LRS3 subword LM, decoded to an N-best list."""

import time
from dataclasses import dataclass

import numpy as np
import torch

from .paths import LM_CONF, LM_PATH, MODEL_CONF, MODEL_PATH, add_vsr_to_path

add_vsr_to_path()
from espnet.asr.asr_utils import parse_hypothesis  # noqa: E402
from pipelines.data.transforms import VideoTransform  # noqa: E402
from pipelines.model import AVSR  # noqa: E402


@dataclass(frozen=True)
class DecodeConfig:
    beam: int = 40
    ctc_weight: float = 0.1
    lm_weight: float = 0.3  # 0 disables the LM
    nbest: int = 10


def load(cfg: DecodeConfig, device: str) -> AVSR:
    use_lm = cfg.lm_weight > 0
    return AVSR("video", str(MODEL_PATH), str(MODEL_CONF), str(LM_PATH) if use_lm else None, str(LM_CONF),
                penalty=0.0, ctc_weight=cfg.ctc_weight, lm_weight=cfg.lm_weight, beam_size=cfg.beam,
                device=device)


_transform = VideoTransform(speed_rate=1)  # /255, centre crop 88, normalize (inference only)


def to_input(crop: np.ndarray) -> torch.Tensor:
    """(T, 96, 96) uint8 -> (1, T, 88, 88) float, the model's input."""
    return _transform(torch.from_numpy(np.ascontiguousarray(crop)))


@torch.no_grad()
def decode(avsr: AVSR, crop: np.ndarray, nbest: int = 10) -> tuple[list[tuple[str, float, int]], dict]:
    """Returns ([(text, log_prob, n_tokens)], timings_ms), best first, distinct texts, lowercase."""
    t0 = time.perf_counter()
    x = to_input(crop).to(avsr.device)
    enc = avsr.model.encode(x)
    if x.is_cuda:
        torch.cuda.synchronize()
    t1 = time.perf_counter()
    hyps = avsr.beam_search(enc)
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
