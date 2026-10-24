"""Training data for per-user adapters: mouth crops + transcripts, tokenized like the checkpoint.

Sources:
  enrollment  ENROLL_DIR/<user>/<sentence_id>.npz (written by POST /enroll/{user_id}/clip)
  feasibility CACHE_DIR/<person>_silent_<id>.npz  (mouth crops cached by `python -m server.eval`)
"""

import csv
import json
import random
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import sentencepiece as spm
import torch

from ..lipread.paths import CACHE_DIR, ENROLL_DIR, EVAL_DATA, SPM_MODEL

HERE = Path(__file__).resolve().parent
# Fewest enrollment clips we train on: 30 leaves 24 to train after the 20% held out for the report, the smallest
# training set with a measured gain (docs/RESULTS.md, section 5).
MIN_CLIPS = 30
MEAN, STD = 0.421, 0.165  # the checkpoint's input normalization


@dataclass
class Sample:
    key: str  # sentence id, e.g. "e17" (enrollment) or "07" (feasibility)
    text: str
    crop: np.ndarray  # (T, 96, 96) uint8


def enroll_sentences() -> list[dict]:
    with open(HERE / "enroll_sentences.csv", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def feasibility_sentences() -> dict[str, str]:
    with open(EVAL_DATA / "feasibility_sentences.csv", encoding="utf-8") as f:
        return {r["id"]: r["sentence"] for r in csv.DictReader(f)}


def save_enrollment(user_key: str, sentence_id: str, text: str, crop: np.ndarray, quality: dict) -> Path:
    d = ENROLL_DIR / user_key
    d.mkdir(parents=True, exist_ok=True)
    path = d / f"{sentence_id}.npz"
    np.savez_compressed(path, crop=crop, text=text, quality=json.dumps(quality))
    return path


def load_enrollment(user_key: str) -> list[Sample]:
    out = []
    for p in sorted((ENROLL_DIR / user_key).glob("*.npz")):
        z = np.load(p, allow_pickle=True)
        out.append(Sample(p.stem, str(z["text"]), z["crop"]))
    return out


def load_feasibility(person: str) -> list[Sample]:
    sents = feasibility_sentences()
    out = []
    for sid, text in sorted(sents.items()):
        p = CACHE_DIR / f"{person}_silent_{sid}.npz"
        if p.exists():
            z = np.load(p, allow_pickle=True)
            if z["crop"].size:
                out.append(Sample(sid, text, z["crop"]))
    return out


class Tokenizer:
    """Text -> token ids of the checkpoint (unigram5000 pieces; <blank>=0, <unk>=1, <eos>=last)."""

    def __init__(self, token_list: list[str]):
        self.sp = spm.SentencePieceProcessor(model_file=str(SPM_MODEL))
        self.index = {t: i for i, t in enumerate(token_list)}
        self.unk = self.index["<unk>"]

    def encode(self, text: str) -> list[int]:
        pieces = self.sp.encode(text.upper().replace("’", "'"), out_type=str)
        return [self.index.get(p, self.unk) for p in pieces]

    def coverage(self, texts: list[str]) -> float:
        ids = [i for t in texts for i in self.encode(t)]
        return 1 - sum(i == self.unk for i in ids) / max(1, len(ids))


def augment(crop: np.ndarray, rng: random.Random) -> torch.Tensor:
    """Train-time transform (auto_avsr recipe): random 88x88 crop, adaptive time mask, normalize.
    Returns (1, T, 88, 88) float."""
    t = len(crop)
    y, x = rng.randint(0, 8), rng.randint(0, 8)
    v = torch.from_numpy(crop[:, y:y + 88, x:x + 88].astype(np.float32) / 255.0)
    # adaptive time mask: one mask of up to 0.4 s per second of video, filled with the clip mean
    for _ in range(max(1, int((t + 24.9) // 25))):
        w = rng.randint(0, min(10, t // 4))
        if w:
            s = rng.randint(0, t - w)
            v[s:s + w] = v.mean()
    return ((v - MEAN) / STD).unsqueeze(0)


def center(crop: np.ndarray) -> torch.Tensor:
    v = torch.from_numpy(crop[:, 4:92, 4:92].astype(np.float32) / 255.0)
    return ((v - MEAN) / STD).unsqueeze(0)


def collate(xs: list[torch.Tensor], ys: list[list[int]]):
    """-> xs_pad (B, 1, Tmax, 88, 88), xlens (B,), ys_pad (B, Lmax) padded with -1."""
    lens = torch.tensor([x.shape[1] for x in xs])
    xs_pad = torch.zeros(len(xs), 1, int(lens.max()), 88, 88)
    for i, x in enumerate(xs):
        xs_pad[i, :, : x.shape[1]] = x
    ys_pad = torch.full((len(ys), max(len(y) for y in ys)), -1, dtype=torch.long)
    for i, y in enumerate(ys):
        ys_pad[i, : len(y)] = torch.tensor(y)
    return xs_pad, lens, ys_pad
