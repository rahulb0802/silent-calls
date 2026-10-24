"""Minimal LoRA for the AutoAVSR encoder, with several named adapters per layer (one per user).

    names = inject(avsr.model)                # wrap encoder attention linears
    add_adapter(avsr.model, "rahul", r=8)     # new trainable adapter (B = 0, so output is unchanged)
    set_active(avsr.model, "rahul")           # route through it; set_active(model, None) = base model
    save(avsr.model, "rahul", path, meta) / load(avsr.model, "rahul", path)
"""

import math
import re
from pathlib import Path

import torch
from torch import nn

DEFAULT_TARGETS = ("linear_q", "linear_k", "linear_v", "linear_out")
SCOPE = "encoder.encoders."  # 12 conformer blocks; the visual frontend and decoder stay untouched


def adapter_key(user_id: str) -> str:
    """ParameterDict keys can't contain dots; keep user ids to [a-z0-9_]."""
    return re.sub(r"[^a-z0-9_]", "_", user_id.lower())


class LoRALinear(nn.Module):
    def __init__(self, base: nn.Linear):
        super().__init__()
        self.base = base
        self.lora_A = nn.ParameterDict()
        self.lora_B = nn.ParameterDict()
        self.scale: dict[str, float] = {}
        self.dropout = nn.Dropout(0.0)
        self.active: str | None = None

    def add(self, name: str, r: int, alpha: float, dropout: float = 0.05) -> None:
        dev, dt = self.base.weight.device, self.base.weight.dtype
        a = torch.empty(r, self.base.in_features, device=dev, dtype=dt)
        nn.init.kaiming_uniform_(a, a=math.sqrt(5))
        self.lora_A[name] = nn.Parameter(a)
        self.lora_B[name] = nn.Parameter(torch.zeros(self.base.out_features, r, device=dev, dtype=dt))
        self.scale[name] = alpha / r
        self.dropout.p = dropout

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        y = self.base(x)
        name = self.active
        if name is not None and name in self.lora_A:
            a, b = self.lora_A[name], self.lora_B[name]
            y = y + (self.dropout(x) @ a.t().to(x.dtype)) @ b.t().to(x.dtype) * self.scale[name]
        return y


def lora_modules(model: nn.Module) -> dict[str, LoRALinear]:
    return {n: m for n, m in model.named_modules() if isinstance(m, LoRALinear)}


def inject(model: nn.Module, targets: tuple[str, ...] = DEFAULT_TARGETS) -> list[str]:
    """Replace the target nn.Linear layers inside the encoder blocks with LoRALinear. Layers already
    wrapped are skipped, so this is safe to call again with more targets. Returns the newly wrapped."""
    names = []
    for name, module in list(model.named_modules()):
        if not name.startswith(SCOPE):
            continue
        for child_name, child in list(module.named_children()):
            if child_name in targets and isinstance(child, nn.Linear):
                setattr(module, child_name, LoRALinear(child))
                names.append(f"{name}.{child_name}")
    return names


def add_adapter(model: nn.Module, name: str, r: int = 8, alpha: float = 16, dropout: float = 0.05) -> int:
    n = 0
    for m in lora_modules(model).values():
        m.add(name, r, alpha, dropout)
        n += m.lora_A[name].numel() + m.lora_B[name].numel()
    return n


def set_active(model: nn.Module, name: str | None) -> None:
    for m in lora_modules(model).values():
        m.active = name


def has_adapter(model: nn.Module, name: str) -> bool:
    return any(name in m.lora_A for m in lora_modules(model).values())


def adapter_parameters(model: nn.Module, name: str) -> list[nn.Parameter]:
    out = []
    for m in lora_modules(model).values():
        if name in m.lora_A:
            out += [m.lora_A[name], m.lora_B[name]]
    return out


def state(model: nn.Module, name: str) -> dict[str, torch.Tensor]:
    out = {}
    for path, m in lora_modules(model).items():
        if name not in m.lora_A:
            continue
        out[f"{path}.A"] = m.lora_A[name].detach().cpu()
        out[f"{path}.B"] = m.lora_B[name].detach().cpu()
    return out


def save(model: nn.Module, name: str, path: Path, meta: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    torch.save({"meta": meta, "state": state(model, name)}, tmp)
    tmp.replace(path)


def load(model: nn.Module, name: str, path: Path) -> dict:
    """Load a saved adapter into the (already injected) model under `name`. Returns its meta."""
    blob = torch.load(path, map_location="cpu", weights_only=False)
    meta, st = blob["meta"], blob["state"]
    inject(model, tuple(meta.get("targets", DEFAULT_TARGETS)))
    mods = lora_modules(model)
    for path_, m in mods.items():
        if f"{path_}.A" not in st:  # layer wrapped for another user's adapter with different targets
            continue
        a, b = st[f"{path_}.A"], st[f"{path_}.B"]
        dev, dt = m.base.weight.device, m.base.weight.dtype
        m.lora_A[name] = nn.Parameter(a.to(dev, dt), requires_grad=False)
        m.lora_B[name] = nn.Parameter(b.to(dev, dt), requires_grad=False)
        m.scale[name] = meta["alpha"] / meta["r"]
    return meta


def drop(model: nn.Module, name: str) -> None:
    for m in lora_modules(model).values():
        if name in m.lora_A:
            del m.lora_A[name]
            del m.lora_B[name]
            m.scale.pop(name, None)
