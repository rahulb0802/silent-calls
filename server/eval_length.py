"""Does lip-reading hold up on longer captures? Stitches the silent feasibility clips of one person into longer
clips (k sentences, with a short still pause between) and compares reading the whole clip at once against
reading each sentence separately and joining the results (what splitting at pauses would do).

    LIPREAD_DEVICE=cuda:1 python -m server.eval_length --groups 12

Reports per k: seconds of video, word error rate (whole vs. split), exact sentence, decode time, peak GPU
memory. Stitched clips have a jump in head position at each join, so they're a rough stand-in for one long
natural capture.
"""

import argparse
import json
import random
import statistics
import time
from pathlib import Path

import numpy as np
import torch

from .eval import load_sentences
from .lipread.metrics import norm, word_errors
from .lipread.model import DecodeConfig, decode, normalize_text
from .lipread.paths import CACHE_DIR, MODEL_FPS, RESULTS_DIR
from .lipread.reader import LipReader

PAUSE_S = 0.4


def main() -> None:
    p = argparse.ArgumentParser(prog="python -m server.eval_length")
    p.add_argument("--ks", default="1,2,3,4,6,8")
    p.add_argument("--groups", type=int, default=12, help="stitched clips per k (k=1 uses every clip)")
    p.add_argument("--seed", type=int, default=0)
    p.add_argument("--tag", default="length")
    args = p.parse_args()
    texts = {sid: normalize_text(r["sentence"]) for sid, r in load_sentences().items()}
    clips: dict[str, list[tuple[str, np.ndarray]]] = {}
    for f in sorted(CACHE_DIR.glob("*_silent_*.npz")):
        person, sid = f.stem.split("_silent_")
        crop = np.load(f, allow_pickle=True)["crop"]
        if crop.size and sid in texts:
            clips.setdefault(person, []).append((sid, crop))
    reader = LipReader(cfg=DecodeConfig())
    avsr = reader.avsr
    rng = random.Random(args.seed)
    rows = []

    def read(crop):
        torch.cuda.reset_peak_memory_stats(reader.device)
        t0 = time.perf_counter()
        out, _ = reader._gpu.submit(decode, avsr, crop, 10).result()
        ms = (time.perf_counter() - t0) * 1000
        return (out[0][0] if out else ""), ms, torch.cuda.max_memory_allocated(reader.device) / 2**20

    for k in [int(x) for x in args.ks.split(",")]:
        groups = []
        for person, items in clips.items():
            if k == 1:
                groups += [[it] for it in items]
            else:
                for _ in range(max(1, args.groups // len(clips))):
                    groups.append(rng.sample(items, k))
        for g in groups:
            pause = lambda c: np.repeat(c[-1:], int(PAUSE_S * MODEL_FPS), axis=0)  # mouth still, like a pause
            whole = np.concatenate([part for _, c in g for part in (c, pause(c))][:-1])
            truth = " ".join(texts[sid] for sid, _ in g)
            hyp, ms, mem = read(whole)
            parts = [read(c) for _, c in g]
            split_hyp = " ".join(h for h, _, _ in parts)
            n = len(truth.split())
            rows.append({"k": k, "seconds": round(len(whole) / MODEL_FPS, 1), "words": n,
                         "wer_whole": word_errors(norm(truth), norm(hyp)) / n,
                         "wer_split": word_errors(norm(truth), norm(split_hyp)) / n,
                         "exact_whole": int(norm(hyp) == norm(truth)), "ms_whole": ms,
                         "ms_split": sum(m for _, m, _ in parts), "mem_mb": mem})
        r = [x for x in rows if x["k"] == k]
        print(f"k={k}: {len(r)} clips, {statistics.median(x['seconds'] for x in r):.1f} s, WER whole "
              f"{statistics.mean(x['wer_whole'] for x in r):.0%} / split {statistics.mean(x['wer_split'] for x in r):.0%}, "
              f"decode {statistics.median(x['ms_whole'] for x in r):.0f} ms, peak {max(x['mem_mb'] for x in r):.0f} MB", flush=True)
    out = RESULTS_DIR / args.tag
    out.mkdir(parents=True, exist_ok=True)
    (out / "rows.json").write_text(json.dumps(rows, indent=1))
    lines = [f"# {args.tag}\n", "Stitched silent clips (one person, k sentences, 0.4 s still pause between). Whole: the "
             "stitched clip read at once. Split: each sentence read separately and joined.\n",
             "| sentences | seconds (median) | words | WER whole | WER split | exact whole | decode whole (median) | decode split (sum, median) | peak GPU MB |",
             "|---|---|---|---|---|---|---|---|---|"]
    for k in sorted({x["k"] for x in rows}):
        r = [x for x in rows if x["k"] == k]
        words = sum(x["words"] for x in r)
        lines.append(f"| {k} | {statistics.median(x['seconds'] for x in r):.1f} | {statistics.median(x['words'] for x in r):.0f} | "
                     f"{sum(x['wer_whole'] * x['words'] for x in r) / words:.0%} | {sum(x['wer_split'] * x['words'] for x in r) / words:.0%} | "
                     f"{statistics.mean(x['exact_whole'] for x in r):.0%} | {statistics.median(x['ms_whole'] for x in r):.0f} ms | "
                     f"{statistics.median(x['ms_split'] for x in r):.0f} ms | {max(x['mem_mb'] for x in r):.0f} |")
    (out / "summary.md").write_text("\n".join(lines) + "\n")
    print("\n".join(lines))


if __name__ == "__main__":
    main()
