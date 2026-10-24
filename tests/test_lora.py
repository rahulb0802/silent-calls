"""LoRA wrapper and scoring tests. CPU only; needs torch + jiwer, not the AutoAVSR weights."""

import pytest

torch = pytest.importorskip("torch")
pytest.importorskip("jiwer")

from torch import nn  # noqa: E402

from server.lipread.metrics import norm, score, summarize  # noqa: E402
from server.lora import lora  # noqa: E402


class Attn(nn.Module):
    def __init__(self):
        super().__init__()
        self.linear_q, self.linear_k, self.linear_v, self.linear_out = (nn.Linear(16, 16) for _ in range(4))
        self.linear_pos = nn.Linear(16, 16)

    def forward(self, x):
        return self.linear_out(self.linear_q(x) + self.linear_k(x) + self.linear_v(x) + self.linear_pos(x))


class Toy(nn.Module):
    def __init__(self):
        super().__init__()
        self.encoder = nn.Module()
        self.encoder.encoders = nn.ModuleList([nn.ModuleDict({"self_attn": Attn()}) for _ in range(2)])
        self.decoder = Attn()  # out of scope: must not be wrapped

    def forward(self, x):
        for blk in self.encoder.encoders:
            x = blk["self_attn"](x)
        return self.decoder(x)


def test_inject_targets_encoder_only():
    m = Toy()
    names = lora.inject(m)
    assert len(names) == 8 and all(n.startswith("encoder.encoders.") for n in names)
    assert not any("linear_pos" in n for n in names)
    assert isinstance(m.decoder.linear_q, nn.Linear)
    assert lora.inject(m) == []  # second call wraps nothing new


def test_new_adapter_is_identity_then_trains(tmp_path):
    torch.manual_seed(0)
    m = Toy()
    x = torch.randn(3, 16)
    base = m(x).detach()
    base_state = {k: v.clone() for k, v in m.state_dict().items()}
    lora.inject(m)
    for p in m.parameters():
        p.requires_grad_(False)
    lora.add_adapter(m, "rahul", r=4, alpha=8)
    lora.set_active(m, "rahul")
    assert torch.allclose(m(x), base, atol=1e-6)  # B starts at zero
    params = lora.adapter_parameters(m, "rahul")
    opt = torch.optim.SGD(params, lr=0.1)
    for _ in range(5):
        opt.zero_grad()
        (m(x) - 1).pow(2).mean().backward()
        opt.step()
    m.eval()
    tuned = m(x).detach()
    assert not torch.allclose(tuned, base)
    lora.set_active(m, None)
    assert torch.allclose(m(x), base, atol=1e-6)  # base weights untouched

    lora.save(m, "rahul", tmp_path / "adapter.pt", {"r": 4, "alpha": 8, "targets": list(lora.DEFAULT_TARGETS)})
    fresh = Toy()
    fresh.load_state_dict(base_state)
    lora.load(fresh, "rahul", tmp_path / "adapter.pt")
    lora.set_active(fresh, "rahul")
    fresh.eval()
    assert torch.allclose(fresh(x), tuned, atol=1e-5)


def test_adapter_key():
    assert lora.adapter_key("Rahul.B-2") == "rahul_b_2"


def test_score_and_norm():
    assert norm("O K, see you To Day") == "okay see you today"
    row = score("sure go ahead", ["sure go a head", "sure go ahead"])
    assert row["exact_rank"] == 2 and row["exact@1"] == 0 and row["exact@3"] == 1
    assert row["within1@5"] == 1
    s = summarize([row, score("yes", ["no"])])
    assert s["clips"] == 2 and s["exact@5"] == 0.5
