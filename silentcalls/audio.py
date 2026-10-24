"""Small sounddevice helpers shared by captions and voice output."""

import numpy as np
import sounddevice as sd


def find_device(name: str, kind: str) -> int:
    """Index of the first device whose name contains `name` and has `kind` ("input"/"output") channels."""
    key = "max_input_channels" if kind == "input" else "max_output_channels"
    for i, dev in enumerate(sd.query_devices()):
        if name.lower() in dev["name"].lower() and dev[key] > 0:
            return i
    available = [d["name"] for d in sd.query_devices() if d[key] > 0]
    raise RuntimeError(f"No {kind} device matching {name!r}. Available: {available}")


def to_mono_16k(block: np.ndarray, src_rate: int) -> np.ndarray:
    """float32 (frames, channels) at src_rate -> float32 mono at 16 kHz (linear resample)."""
    mono = block.mean(axis=1) if block.ndim == 2 else block
    if src_rate == 16000:
        return mono
    n_out = int(round(len(mono) * 16000 / src_rate))
    x_old = np.linspace(0.0, 1.0, num=len(mono), endpoint=False)
    x_new = np.linspace(0.0, 1.0, num=n_out, endpoint=False)
    return np.interp(x_new, x_old, mono).astype(np.float32)
