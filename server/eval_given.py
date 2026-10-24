"""How much does knowing the likely replies help? Scores each feasibility clip against a short list of given
sentences (what the call co-pilot would prepare) as well as the model's own guesses.

    python -m server.eval_given                    # silent clips, cached mouth crops (run server.eval once first)
    python -m server.eval_given --distractors 4    # list size = truth + 4

Conditions, per clip (the other sentences in the 30-sentence set are the distractors):
  open      no given list: the model alone (the baseline)
  random    truth + N random other sentences
  hard      truth + the N other sentences that look most like it on the lips (viseme distance)
  absent    N random other sentences, truth NOT in the list: does a wrong reply get picked?

Reports exact@1/@3 of the merged ranking, "list@1" (the truth is the best-scoring of the given sentences),
how often a given sentence that is wrong takes the top spot, and the extra time. Writes
server/results/<tag>/{summary.md, summary.json, per_clip.csv}.
"""

import argparse
import csv
import json
import random
import statistics
import time
from pathlib import Path

import numpy as np
import torch

from .eval import find_clips, load_sentences
from .lipread import vocab as vb
from .lipread.metrics import norm, score
from .lipread.model import DecodeConfig, normalize_text, score_texts, to_input
from .lipread.paths import CACHE_DIR, CLIPS_DIR, RESULTS_DIR
from .lipread.reader import LipReader

CONDITIONS = ("open", "random", "hard", "absent")


def lookalikes(truth: str, others: list[str], n: int) -> list[str]:
    target = vb.visemes(truth.replace(" ", ""))
    return sorted(others, key=lambda o: vb.viseme_distance(vb.visemes(o.replace(" ", "")), target) / max(1, len(target)))[:n]


@torch.no_grad()
def list_pick(reader: LipReader, crop: np.ndarray, given: list[str]) -> str | None:
    """The best-scoring of the given sentences alone (no beam)."""
    def run():
        enc = reader.avsr.model.encode(to_input(crop).to(reader.device))
        scored = score_texts(reader.avsr, enc, given)
        return max(scored, key=lambda s: s[1])[0] if scored else None
    return reader._gpu.submit(run).result()


@torch.no_grad()
def list_score(reader: LipReader, crop: np.ndarray, text: str) -> float:
    def run():
        enc = reader.avsr.model.encode(to_input(crop).to(reader.device))
        return score_texts(reader.avsr, enc, [text])[0][1]
    return reader._gpu.submit(run).result()


def main() -> None:
    p = argparse.ArgumentParser(prog="python -m server.eval_given")
    p.add_argument("--clips", default=str(CLIPS_DIR))
    p.add_argument("--distractors", type=int, default=4)
    p.add_argument("--seed", type=int, default=0)
    p.add_argument("--include-aloud", action="store_true")
    p.add_argument("--tag")
    p.add_argument("--dump-scores", action="store_true", help="score every sentence per clip for simulate()")
    p.add_argument("--simulate", help="scores.jsonl from --dump-scores: sweep the prior bonus offline")
    args = p.parse_args()
    if args.simulate:
        print(simulate(Path(args.simulate), args.distractors, args.seed))
        return
    if args.dump_scores:
        print(dump_scores(args))
        return

    sentences = load_sentences()
    texts = {sid: r["sentence"] for sid, r in sentences.items()}
    reader = LipReader(cfg=DecodeConfig())
    rng = random.Random(args.seed)
    rows, calib = [], []
    for (person, mode, sid), _ in find_clips(Path(args.clips)):
        if mode != "silent" and not args.include_aloud:
            continue
        cp = CACHE_DIR / f"{person}_{mode}_{sid}.npz"
        if not cp.exists():
            continue
        z = np.load(cp, allow_pickle=True)
        if not z["crop"].size:
            continue
        crop, truth = z["crop"], texts[sid]
        others = [t for k, t in texts.items() if k != sid]
        lists = {"open": [], "random": [truth] + rng.sample(others, args.distractors),
                 "hard": [truth] + lookalikes(truth, others, args.distractors),
                 "absent": rng.sample(others, args.distractors + 1)}
        for cond, given in lists.items():
            rng.shuffle(given)
            t0 = time.perf_counter()
            res = reader.read_crop(crop, None, None, given)
            ms = (time.perf_counter() - t0) * 1000
            hyps = [c[0] for c in res.candidates]
            given_n = {normalize_text(g) for g in given}
            top_given = bool(hyps) and hyps[0] in given_n
            pick = list_pick(reader, crop, given) if given and cond != "absent" else None
            if cond == "open" and res.candidates:  # does score_texts reproduce the beam's own score?
                calib.append(abs(list_score(reader, crop, res.candidates[0][0]) - res.candidates[0][1]))
            rows.append({"person": person, "mode": mode, "id": sid, "condition": cond, "reference": truth,
                         "top1": hyps[0] if hyps else "", **score(truth, hyps),
                         "list@1": int(pick is not None and norm(pick) == norm(truth)) if cond in ("random", "hard") else "",
                         "wrong_given_top1": int(top_given and norm(hyps[0]) != norm(truth)),
                         "given_ms": res.timings_ms.get("given_ms", 0), "total_ms": round(ms)})
        print(f"[{person} {sid}] " + " ".join(f"{r['condition']}:{r['exact_rank'] or '-'}" for r in rows[-4:]), flush=True)

    summary = {"distractors": args.distractors, "clips": len(rows) // len(CONDITIONS), "conditions": {},
               "calibration_abs_diff_median": round(statistics.median(calib), 3) if calib else None}
    for cond in CONDITIONS:
        rs = [r for r in rows if r["condition"] == cond]
        words = sum(r["ref_words"] for r in rs)
        s = {"top1_wer": round(sum(r["top1_errors"] for r in rs) / words, 4),
             **{f"exact@{k}": round(statistics.mean(r[f"exact@{k}"] for r in rs), 4) for k in (1, 3, 10)},
             "wrong_given_top1": round(statistics.mean(r["wrong_given_top1"] for r in rs), 4),
             "given_ms_median": round(statistics.median(r["given_ms"] for r in rs), 1)}
        if cond in ("random", "hard"):
            s["list@1"] = round(statistics.mean(r["list@1"] for r in rs), 4)
        summary["conditions"][cond] = s
    tag = args.tag or f"given_d{args.distractors}"
    out = RESULTS_DIR / tag
    out.mkdir(parents=True, exist_ok=True)
    (out / "summary.json").write_text(json.dumps(summary, indent=2))
    with open(out / "per_clip.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0]))
        w.writeheader()
        w.writerows(rows)
    lines = [f"# {tag}\n", f"{summary['clips']} silent clips · given list = truth + {args.distractors} other sentences "
             "(absent: {0} others, no truth) · beam 40, LM 0.2\n".format(args.distractors + 1),
             "| condition | WER | exact@1 | exact@3 | exact@10 | list@1 | wrong given at top | scoring ms |",
             "|---|---|---|---|---|---|---|---|"]
    for cond, s in summary["conditions"].items():
        listed = f"{s['list@1']:.0%}" if "list@1" in s else "-"
        lines.append(f"| {cond} | {s['top1_wer']:.0%} | {s['exact@1']:.0%} | {s['exact@3']:.0%} | {s['exact@10']:.0%} | "
                     f"{listed} | {s['wrong_given_top1']:.0%} | {s['given_ms_median']} |")
    lines += ["", f"Scoring check: a given sentence equal to the beam's top guess scores within "
              f"{summary['calibration_abs_diff_median']} (median) of the beam's own score."]
    (out / "summary.md").write_text("\n".join(lines) + "\n")
    print("\n".join(lines))



def dump_scores(args) -> Path:
    """Per clip: the beam's top 10 and every sentence of the set scored against the video, so any given-list
    condition and prior bonus can be simulated offline (simulate())."""
    sentences = load_sentences()
    texts = {sid: r["sentence"] for sid, r in sentences.items()}
    reader = LipReader(cfg=DecodeConfig())
    out = RESULTS_DIR / (args.tag or "given_scores") / "scores.jsonl"
    out.parent.mkdir(parents=True, exist_ok=True)
    with open(out, "w", encoding="utf-8") as f:
        for (person, mode, sid), _ in find_clips(Path(args.clips)):
            cp = CACHE_DIR / f"{person}_{mode}_{sid}.npz"
            if mode != "silent" or not cp.exists():
                continue
            z = np.load(cp, allow_pickle=True)
            if not z["crop"].size:
                continue
            crop = z["crop"]
            res = reader.read_crop(crop)

            def run():
                enc = reader.avsr.model.encode(to_input(crop).to(reader.device))
                return {t: (s, n) for t, s, n in score_texts(reader.avsr, enc, list(texts.values()))}
            scored = reader._gpu.submit(run).result()
            f.write(json.dumps({"person": person, "id": sid, "truth": normalize_text(texts[sid]),
                                "beam": [[t, s, n] for (t, s), n in zip(res.candidates, res.n_tokens)],
                                "sentences": {normalize_text(t): v for t, v in scored.items()}}) + "\n")
            print(f"[{person} {sid}] scored", flush=True)
    return out


def simulate(path: Path, distractors: int = 4, seed: int = 0, bonuses=(0, 2, 4, 6, 8, 10, 12, 15, 20)) -> str:
    """Top-1 accuracy of the merged ranking when given sentences get a prior bonus B (log-prob), and how often
    a wrong given sentence wins when the truth isn't in the list."""
    clips = [json.loads(line) for line in open(path, encoding="utf-8")]
    rng = random.Random(seed)
    trials = []
    for c in clips:
        others = [t for t in c["sentences"] if t != c["truth"]]
        if c["truth"] not in c["sentences"]:
            continue
        trials.append((c, "random", [c["truth"]] + rng.sample(others, distractors)))
        trials.append((c, "hard", [c["truth"]] + lookalikes(c["truth"], others, distractors)))
        trials.append((c, "absent", rng.sample(others, distractors + 1)))
    lines = ["| prior bonus B | truth in list (random): top 1 | truth in list (look-alikes): top 1 | "
             "truth not in list: still right | truth not in list: wrong reply wins |", "|---|---|---|---|---|"]
    for b in bonuses:
        acc = {"random": [], "hard": [], "absent_right": [], "absent_wrong": []}
        for c, cond, given in trials:
            pool = {t: s for t, s, _ in c["beam"]}
            for g in given:
                pool[g] = max(pool.get(g, -1e9), c["sentences"][g][0] + b)
            top = max(pool, key=pool.get)
            if cond == "absent":
                acc["absent_right"].append(top == c["truth"])
                acc["absent_wrong"].append(top in given)
            else:
                acc[cond].append(top == c["truth"])
        m = {k: sum(v) / len(v) for k, v in acc.items()}
        lines.append(f"| {b} | {m['random']:.0%} | {m['hard']:.0%} | {m['absent_right']:.0%} | {m['absent_wrong']:.0%} |")
    return "\n".join(lines)


if __name__ == "__main__":
    main()
