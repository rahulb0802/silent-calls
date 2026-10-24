"""Fit the decision layer's weights and thresholds on our labelled clips; writes weights.json.

Input: JSONL, one clip per line (dump these from the feasibility eval):
  {"truth": "i'll call you back", "context": "Other person: Can you talk now?",
   "candidates": [{"text": "i'll call you back", "score": -3.1}, ...]}

    python -m silentcalls.fit_weights data/clips.jsonl [--precision 0.95]

Jev scores are cached next to the input (<name>.jev.json) so refitting doesn't re-call the API.
"""

import argparse
import asyncio
import json
from pathlib import Path

import numpy as np

from .config import WEIGHTS_PATH, Weights, settings
from .decision import Jev, combine, normalize, top_k
from .protocol import Candidate


async def jev_scores(clips: list[dict], cache_path: Path) -> list[list[float] | None]:
    cache = json.loads(cache_path.read_text()) if cache_path.exists() else {}
    jev = Jev(settings)
    out = []
    try:
        for i, clip in enumerate(clips):
            key = str(i)
            if key not in cache:
                try:
                    cache[key] = await jev.score(clip.get("context", ""), clip["cands"])
                except Exception as e:
                    print(f"clip {i}: jev failed ({e})")
                    cache[key] = None
            out.append(cache[key])
    finally:
        await jev.close()
        cache_path.write_text(json.dumps(cache))
    return out


def evaluate(clips, p_jev, w: Weights):
    """Per clip: (top prob, top correct?, truth in top 3?, log-prob of truth or None)."""
    rows = []
    for clip, pj in zip(clips, p_jev):
        scored = combine(clip["cands"], pj, w)
        texts = [normalize(o.text) for o in scored.options]
        truth = normalize(clip["truth"])
        lp = next((np.log(o.prob + 1e-9) for o in scored.options if normalize(o.text) == truth), None)
        rows.append((scored.options[0].prob, texts[0] == truth, truth in texts[:3], lp))
    return rows


def main() -> None:
    p = argparse.ArgumentParser(prog="python -m silentcalls.fit_weights")
    p.add_argument("clips", type=Path)
    p.add_argument("--precision", type=float, default=0.95,
                   help="required accuracy of guesses spoken without confirmation")
    args = p.parse_args()

    clips = [json.loads(line) for line in args.clips.read_text().splitlines() if line.strip()]
    for c in clips:
        c["cands"] = top_k([Candidate(**x) for x in c["candidates"]], settings.jev_top_k)
    p_jev = asyncio.run(jev_scores(clips, args.clips.with_suffix(".jev.json")))
    usable = [i for i, pj in enumerate(p_jev) if pj is not None]
    clips = [clips[i] for i in usable]
    p_jev = [p_jev[i] for i in usable]
    print(f"{len(clips)} clips with Jev scores")

    # Grid search: maximize log-likelihood of the truth among clips where it's a candidate.
    best = None
    for w_lip in np.arange(0.1, 3.01, 0.1):
        for w_jev in np.arange(0.0, 3.01, 0.1):
            rows = evaluate(clips, p_jev, Weights(w_lip=w_lip, w_jev=w_jev))
            ll = sum(r[3] for r in rows if r[3] is not None)
            if best is None or ll > best[0]:
                best = (ll, round(float(w_lip), 2), round(float(w_jev), 2))
    _, w_lip, w_jev = best

    lip_only = evaluate(clips, [None] * len(clips), Weights())
    rows = evaluate(clips, p_jev, Weights(w_lip=w_lip, w_jev=w_jev))
    acc = lambda rs, k: np.mean([r[k] for r in rs]) * 100  # noqa: E731
    print(f"weights: w_lip={w_lip} w_jev={w_jev}")
    print(f"top-1: lip only {acc(lip_only, 1):.0f}% -> combined {acc(rows, 1):.0f}%")
    print(f"top-3: lip only {acc(lip_only, 2):.0f}% -> combined {acc(rows, 2):.0f}%")

    # Speak threshold: lowest top-prob at which auto-spoken guesses still meet the precision target.
    speak = 1.01
    for t in sorted({r[0] for r in rows}, reverse=True):
        spoken = [r for r in rows if r[0] >= t]
        if np.mean([r[1] for r in spoken]) >= args.precision:
            speak = t
    # Choose threshold: the highest cut below which the top 3 contain the truth at most 30% of the
    # time, so asking to repeat beats showing options.
    choose = 0.05
    for t in sorted({r[0] for r in rows}):
        below = [r for r in rows if r[0] < t]
        if below and np.mean([r[2] for r in below]) <= 0.3:
            choose = t
    choose = min(choose, speak)

    spoken = [r for r in rows if r[0] >= speak]
    shown = [r for r in rows if choose <= r[0] < speak]
    print(f"speak >= {speak:.2f}: {len(spoken)} clips spoken directly, "
          f"{np.mean([r[1] for r in spoken]) * 100 if spoken else 0:.0f}% correct")
    print(f"choose >= {choose:.2f}: {len(shown)} clips shown as top 3, "
          f"{np.mean([r[2] for r in shown]) * 100 if shown else 0:.0f}% contain the truth")

    w = Weights(w_lip=w_lip, w_jev=w_jev, speak_threshold=round(float(speak), 3),
                choose_threshold=round(float(choose), 3))
    WEIGHTS_PATH.write_text(json.dumps(w.__dict__, indent=2))
    print(f"wrote {WEIGHTS_PATH}")


if __name__ == "__main__":
    main()
