"""Name biasing: lip-shape matching (pure Python) and the beam-search bonus (needs torch, sentencepiece and the
AutoAVSR code checkout in VSR_DIR, not the weights)."""

import pytest

from server.lipread import vocab as vb


def test_clean():
    assert vb.clean(["Sarvajith", "sarvajith", " Nilesh!", "", "O’Brien"]) == ["sarvajith", "nilesh", "o'brien"]


def test_visemes_merge_lookalike_sounds():
    assert vb.visemes("cloud") == vb.visemes("claude")  # silent e, rounded vowel
    assert vb.visemes("pat") == vb.visemes("mad")  # p/b/m and t/d/n share a lip shape
    assert vb.viseme_distance(vb.visemes("server"), vb.visemes("sarva")) < 0.5  # one vowel swap


def test_variants_swap_lookalike_span():
    nbest = [("thanks server", -5.0, 4), ("thanks sir", -6.0, 3), ("thank you", -7.0, 3)]
    out = vb.add_name_variants(nbest, ["sarva"], 10)
    texts = [t for t, _, _ in out]
    assert "thanks sarva" in texts
    assert texts.index("thanks sarva") > texts.index("thanks server")  # ranked below its source
    assert all(c in out for c in nbest)


def test_variants_multiword_span_and_skip_present():
    out = vb.add_name_variants([("ask server jet about it", -5.0, 6)], ["sarvajith"], 10)
    assert out[1][0] == "ask sarvajith about it"
    same = [("hi sarva", -5.0, 3), ("hi server", -6.0, 3)]
    assert vb.add_name_variants(same, ["sarva"], 10) == same  # the beam already has the name


def test_variants_respect_nbest_size():
    nbest = [(f"server {i}", -float(i), 2) for i in range(10)]
    out = vb.add_name_variants(nbest, ["sarva"], 10)
    assert len(out) == 10 and any("sarva" in t for t, _, _ in out)
    assert out[0] == nbest[0]


def test_unrelated_words_untouched():
    nbest = [("see you tomorrow", -4.0, 4)]
    assert vb.add_name_variants(nbest, ["sarvajith", "nilesh"], 10) == nbest


def test_names_from_text():
    text = "Hi, this is Sarva from Acme. I talked to Nilesh yesterday. Okay, Monday works."
    names = vb.names_from_text(text)
    assert {"sarva", "nilesh"} <= set(names)
    assert "monday" not in names and "okay" not in names and "i" not in names


# ---- NameBias (beam-search scorer) ----


@pytest.fixture(scope="module")
def bias():
    pytest.importorskip("torch")
    pytest.importorskip("sentencepiece")
    from server.lipread.paths import SPM_MODEL, VSR_DIR

    units = VSR_DIR / "pipelines" / "tokens" / "unigram5000_units.txt"
    if not units.exists() or not SPM_MODEL.exists():
        pytest.skip("needs the AutoAVSR checkout (VSR_DIR) and SPM_MODEL")
    try:
        from server.lipread.model import NameBias
    except ImportError as e:
        pytest.skip(f"AutoAVSR code not importable: {e}")
    tokens = ["<blank>"] + [line.split()[0] for line in units.read_text(encoding="utf-8").splitlines()] + ["<eos>"]
    nb = NameBias(tokens, bonus=2.0)
    assert nb.set_words(["sarvajith"]) == ["sarvajith"]
    return nb, tokens


def _total(nb, seq: list[int]) -> float:
    """Sum of the bonuses the beam would add, token by token, for the sequence sos + seq."""
    import torch

    ys, total = [nb.eos], 0.0
    for tok in seq:
        total += float(nb._row(nb._node(ys), torch.device("cpu"), torch.float32)[tok])
        ys.append(tok)
    return total


def test_bias_full_name_keeps_bonus(bias):
    nb, tokens = bias
    seg = nb._segmentations("sarvajith")[0]
    idx = {t: i for i, t in enumerate(tokens)}
    assert _total(nb, seg) == pytest.approx(2.0 * len(seg))
    assert _total(nb, seg + [nb.eos]) == pytest.approx(2.0 * len(seg))
    assert _total(nb, [idx["▁HELLO"]] + seg + [idx["▁HOW"]]) == pytest.approx(2.0 * len(seg))


def test_bias_abandoned_name_gives_bonus_back(bias):
    nb, tokens = bias
    seg = nb._segmentations("sarvajith")[0]
    idx = {t: i for i, t in enumerate(tokens)}
    if len(seg) < 2:
        pytest.skip("single-piece segmentation")
    assert _total(nb, seg[:1] + [idx["▁HOW"]]) == pytest.approx(0.0)
    assert _total(nb, seg[:-1] + [nb.eos]) == pytest.approx(0.0)


def test_bias_off_when_empty(bias):
    import torch

    nb, _ = bias
    nb.set_words([])
    ys = torch.tensor([[nb.eos, 5]])
    scores, _ = nb.batch_score(ys, [None], torch.zeros(1, 3, 4))
    assert float(scores.abs().sum()) == 0.0
    nb.set_words(["sarvajith"])


def test_bias_flips_beam_to_name(bias):
    """A fake decoder that prefers "server jet" slightly over "sarvajith": the biased search says the name."""
    import torch
    from espnet.nets.batch_beam_search import BatchBeamSearch
    from espnet.nets.scorer_interface import BatchScorerInterface

    nb, tokens = bias
    eos = len(tokens) - 1
    good = nb._segmentations("server jet")[0] + [eos]
    name = nb._segmentations("sarvajith")[0] + [eos]

    class FakeDecoder(BatchScorerInterface):
        def batch_score(self, ys, states, xs):
            out = torch.full((ys.shape[0], len(tokens)), -20.0)
            for b, y in enumerate(ys.tolist()):
                pos = len(y) - 1
                for seq, lp in ((good, -1.0), (name, -1.5)):
                    if y[1:] == seq[:pos] and pos < len(seq):
                        out[b, seq[pos]] = max(float(out[b, seq[pos]]), lp)
            return out, None

    def search(with_bias: bool):
        scorers = {"decoder": FakeDecoder(), **({"names": nb} if with_bias else {})}
        bs = BatchBeamSearch(scorers=scorers, weights={"decoder": 1.0, "names": 1.0}, beam_size=4,
                             vocab_size=len(tokens), sos=eos, eos=eos, token_list=tokens, pre_beam_score_key="full")
        best = bs(torch.zeros(20, 4), maxlenratio=-8)[0]
        return [int(t) for t in best.yseq[1:]]

    assert search(False) == good
    assert search(True) == name
