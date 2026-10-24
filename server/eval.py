"""Score the lip-reader on the feasibility clips (named <person>_<silent|aloud>_<id>.webm).

    python -m server.eval                                   # whole-clip path, beam 40 (the feasibility setup)
    python -m server.eval --mode stream --height 480        # the live path: 25 fps JPEGs through on_frame/finish
    python -m server.eval --mode stream --realtime          # ... fed at 25 fps, for honest after-release latency
    python -m server.eval --sweep lm=0,0.1,0.3 ctc=0.1,0.3  # decoder settings (reuses cached mouth crops)
    python -m server.eval --adapter                         # use each person's LoRA adapter, if trained
    python -m server.eval --dump-fit data/clips.jsonl       # JSONL for silentcalls/fit_weights.py

Writes server/results/<tag>/{summary.md, summary.json, per_clip.csv, nbest.jsonl}.
"""

import argparse
import asyncio
import csv
import glob
import itertools
import json
import os
import re
import statistics
import time
from pathlib import Path

import numpy as np

from .lipread import frames as fr
from .lipread.metrics import score, summarize
from .lipread.model import DecodeConfig
from .lipread.paths import CACHE_DIR, CLIPS_DIR, EVAL_DATA, MODEL_FPS, RESULTS_DIR
from .lipread.reader import LipReader, LipResult

NAME_RE = re.compile(r"^(?P<person>[a-z0-9]+)_(?P<mode>silent|aloud)_(?P<id>\d\d)(?: ?\(\d+\))?$")
TIMING_KEYS = ("face_wait_ms", "crop_ms", "encode_ms", "beam_ms", "lipread_ms", "finish_ms")


def find_clips(root: Path) -> list[tuple[tuple[str, str, str], str]]:
    """((person, mode, id), path), newest file wins for duplicates; macOS zip junk skipped."""
    latest: dict = {}
    for path in glob.glob(str(root / "**" / "*"), recursive=True):
        if "__MACOSX" in path:
            continue
        stem, ext = os.path.splitext(os.path.basename(path))
        m = NAME_RE.match(stem.lower())
        if ext.lower() not in (".webm", ".mp4", ".mov", ".mkv") or not m:
            continue
        key = (m["person"], m["mode"], m["id"])
        if key not in latest or os.path.getmtime(path) > os.path.getmtime(latest[key]):
            latest[key] = path
    return [(k, latest[k]) for k in sorted(latest)]


def load_sentences() -> dict[str, dict]:
    with open(EVAL_DATA / "feasibility_sentences.csv", encoding="utf-8") as f:
        return {r["id"]: r for r in csv.DictReader(f)}


def cached_crop(reader: LipReader, key, path: str) -> tuple[np.ndarray | None, dict, str | None]:
    """Mouth crop for a clip (whole-clip path), cached by source mtime under CACHE_DIR."""
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cp = CACHE_DIR / ("_".join(key) + ".npz")
    mtime = os.path.getmtime(path)
    if cp.exists():
        z = np.load(cp, allow_pickle=True)
        if float(z["mtime"]) == mtime:
            q = json.loads(str(z["quality"]))
            return (z["crop"] if z["crop"].size else None), q, (str(z["error"]) or None)
    frames = fr.read_video(path)
    landmarks = reader._cpu.submit(lambda: reader._detector().detect_all(frames)).result()
    res = reader._crop(frames, landmarks, fallback=False)
    if isinstance(res, LipResult):
        crop, q, err = None, res.quality, res.error
    else:
        crop, q, err = res[0], res[1], None
    np.savez_compressed(cp, crop=crop if crop is not None else np.zeros(0, np.uint8), quality=json.dumps(q),
                        error=err or "", mtime=mtime)
    return crop, q, err


async def stream_clip(reader: LipReader, path: str, height: int, quality: int, realtime: bool,
                      user_id: str | None) -> tuple[LipResult, float]:
    """Replay a clip the way the desktop client sends it: 25 fps JPEG frames, then finish()."""
    frames = fr.read_video(path, max_height=height)
    jpegs = [fr.encode_jpeg(f, quality) for f in frames]
    utt = f"replay-{time.monotonic_ns()}"
    t_start = time.perf_counter()
    for i, j in enumerate(jpegs):
        reader.on_frame(utt, j)
        if realtime:
            await asyncio.sleep(max(0.0, t_start + (i + 1) / MODEL_FPS - time.perf_counter()))
    kb = sum(len(j) for j in jpegs) / 1024 / max(1, len(jpegs) / MODEL_FPS)
    t0 = time.perf_counter()
    res = await reader.finish(utt, user_id)
    res.timings_ms["finish_ms"] = round((time.perf_counter() - t0) * 1000)
    return res, kb


def run(args, cfg: DecodeConfig, tag: str, reader: LipReader | None = None) -> dict:
    sentences = load_sentences()
    clips = [c for c in find_clips(Path(args.clips))
             if (not args.only or args.only in c[1]) and (not args.persons or c[0][0] in args.persons)
             and (args.include_aloud or c[0][1] == "silent")]
    if not clips:
        raise SystemExit(f"no clips under {args.clips}")
    reader = reader or LipReader(cfg=cfg)
    out_dir = RESULTS_DIR / tag
    out_dir.mkdir(parents=True, exist_ok=True)
    rows, nbest_lines, kbs = [], [], []
    for key, path in clips:
        person, mode, sid = key
        user = person if args.adapter else None
        t0 = time.perf_counter()
        if args.mode == "stream":
            res, kb = asyncio.run(stream_clip(reader, path, args.height, args.quality, args.realtime, user))
            kbs.append(kb)
        else:
            crop, q, err = cached_crop(reader, key, path)
            if crop is None:
                res = LipResult([], 0, 0, quality=q, error=err)
            else:
                res = reader.read_crop(crop, user)
                res.quality = q
            res.timings_ms["finish_ms"] = round((time.perf_counter() - t0) * 1000)
        ref = sentences[sid]["sentence"]
        hyps = [c[0] for c in res.candidates]
        row = {"person": person, "mode": mode, "id": sid, "reference": ref, "top1": hyps[0] if hyps else "",
               **score(ref, hyps), "top5": " | ".join(hyps[:5]), "adapter": res.adapter or "",
               "error": res.error or "", "flags": "; ".join(res.quality.get("flags", [])),
               **{k: res.timings_ms.get(k, "") for k in TIMING_KEYS},
               **{k: res.quality.get(k, "") for k in ("duration_s", "face_rate", "eye_dist_frac", "mouth_motion")}}
        rows.append(row)
        nbest_lines.append({"person": person, "mode": mode, "id": sid, "truth": ref,
                            "context": f"Other person: {sentences[sid]['prior_turn']}",
                            "candidates": [{"text": t, "score": s} for t, s in res.candidates],
                            "n_tokens": res.n_tokens})
        print(f"[{person} {mode} {sid}] {ref!r} -> {row['top1']!r} (rank {row['exact_rank'] or '-'}, "
              f"{row['finish_ms']} ms) {row['error']} {row['flags']}", flush=True)

    groups: dict = {}
    for r in rows:
        groups.setdefault(f"{r['person']}/{r['mode']}", []).append(r)
        groups.setdefault(f"ALL/{r['mode']}", []).append(r)
    summary = {
        "tag": tag, "mode": args.mode, "device": reader.device,
        "decode": {"beam": cfg.beam, "lm_weight": cfg.lm_weight, "ctc_weight": cfg.ctc_weight},
        "stream": {"height": args.height, "jpeg_quality": args.quality, "realtime": args.realtime,
                   "kb_per_s": round(statistics.mean(kbs)) if kbs else None} if args.mode == "stream" else None,
        "adapter": bool(args.adapter),
        "groups": {g: summarize(rs) for g, rs in sorted(groups.items(), key=lambda kv: (kv[0].startswith("ALL"), kv[0]))},
        "timings_median_ms": {k: statistics.median(v) for k in TIMING_KEYS
                              if (v := [r[k] for r in rows if isinstance(r[k], (int, float))])},
    }
    by = {(r["person"], r["mode"], r["id"]): r for r in rows}
    paired = [(by[(p, "silent", i)], r) for (p, m, i), r in by.items() if m == "aloud" and (p, "silent", i) in by]
    if paired:
        summary["silent_vs_aloud"] = {
            "pairs": len(paired),
            "silent_wer": round(sum(a["top1_errors"] for a, _ in paired) / sum(a["ref_words"] for a, _ in paired), 4),
            "aloud_wer": round(sum(b["top1_errors"] for _, b in paired) / sum(b["ref_words"] for _, b in paired), 4)}

    (out_dir / "summary.json").write_text(json.dumps(summary, indent=2))
    (out_dir / "summary.md").write_text(render_md(summary))
    with open(out_dir / "per_clip.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0]))
        w.writeheader()
        w.writerows(rows)
    with open(out_dir / "nbest.jsonl", "w", encoding="utf-8") as f:
        f.writelines(json.dumps(x) + "\n" for x in nbest_lines)
    if args.dump_fit:
        Path(args.dump_fit).parent.mkdir(parents=True, exist_ok=True)
        with open(args.dump_fit, "w", encoding="utf-8") as f:
            for x in nbest_lines:
                if x["mode"] == "silent":
                    f.write(json.dumps({k: x[k] for k in ("truth", "context", "candidates")}) + "\n")
    print(render_md(summary))
    return summary


def render_md(s: dict) -> str:
    d = s["decode"]
    head = f"# {s['tag']}\n\nmode `{s['mode']}` on `{s['device']}` · beam {d['beam']} · LM weight {d['lm_weight']} · " \
           f"CTC weight {d['ctc_weight']} · adapter {'on' if s['adapter'] else 'off'}"
    if s.get("stream"):
        st = s["stream"]
        head += f" · {st['height']}p JPEG q{st['jpeg_quality']} ({st['kb_per_s']} KB/s)" + (" realtime" if st["realtime"] else "")
    cols = ["clips", "top1_wer", "exact@1", "exact@3", "exact@5", "exact@10", "oracle_wer@5", "within1@5"]
    lines = [head, "", "| group | " + " | ".join(cols) + " |", "|" + "---|" * (len(cols) + 1)]
    for g, v in s["groups"].items():
        lines.append(f"| {g} | " + " | ".join(str(v[c]) if c == "clips" else f"{v[c]:.0%}" for c in cols) + " |")
    if s["timings_median_ms"]:
        lines += ["", "Median timings (ms): " + ", ".join(f"{k} {v:.0f}" for k, v in s["timings_median_ms"].items())]
    if s.get("silent_vs_aloud"):
        sa = s["silent_vs_aloud"]
        lines += ["", f"Silent vs aloud on the same {sa['pairs']} sentences: top-1 WER {sa['silent_wer']:.0%} vs {sa['aloud_wer']:.0%}"]
    return "\n".join(lines) + "\n"


def parse_sweep(items: list[str]) -> list[DecodeConfig]:
    grid = {"beam": [40], "lm": [0.3], "ctc": [0.1]}
    for it in items:
        k, v = it.split("=")
        grid[k] = [float(x) for x in v.split(",")]
    return [DecodeConfig(beam=int(b), lm_weight=lm, ctc_weight=c)
            for b, lm, c in itertools.product(grid["beam"], grid["lm"], grid["ctc"])]


def main() -> None:
    p = argparse.ArgumentParser(prog="python -m server.eval")
    p.add_argument("--clips", default=str(CLIPS_DIR))
    p.add_argument("--mode", choices=["file", "stream"], default="file")
    p.add_argument("--height", type=int, default=720, help="stream mode: frame height sent by the client")
    p.add_argument("--quality", type=int, default=80, help="stream mode: JPEG quality")
    p.add_argument("--realtime", action="store_true", help="stream mode: feed frames at 25 fps")
    p.add_argument("--beam", type=int, default=40)
    p.add_argument("--lm-weight", type=float, default=0.3)
    p.add_argument("--ctc-weight", type=float, default=0.1)
    p.add_argument("--sweep", nargs="*", help="e.g. lm=0,0.1,0.3 ctc=0.1,0.3 beam=20,40 (file mode)")
    p.add_argument("--adapter", action="store_true", help="use each person's LoRA adapter if one exists")
    p.add_argument("--persons", nargs="*")
    p.add_argument("--only", help="substring filter on clip path")
    p.add_argument("--include-aloud", action="store_true", default=True)
    p.add_argument("--silent-only", dest="include_aloud", action="store_false")
    p.add_argument("--tag", help="results folder name (default: derived from the settings)")
    p.add_argument("--dump-fit", help="also write silent clips as JSONL for silentcalls/fit_weights.py")
    args = p.parse_args()

    if args.sweep:
        table = []
        for cfg in parse_sweep(args.sweep):
            tag = f"sweep_beam{cfg.beam}_lm{cfg.lm_weight}_ctc{cfg.ctc_weight}"
            s = run(args, cfg, tag)
            table.append((cfg, s["groups"]["ALL/silent"]))
        lines = ["| beam | LM weight | CTC weight | top-1 WER | exact@1 | exact@5 | exact@10 | oracle WER@10 |",
                 "|---|---|---|---|---|---|---|---|"]
        for cfg, g in table:
            lines.append(f"| {cfg.beam} | {cfg.lm_weight} | {cfg.ctc_weight} | {g['top1_wer']:.0%} | {g['exact@1']:.0%} | "
                         f"{g['exact@5']:.0%} | {g['exact@10']:.0%} | {g['oracle_wer@10']:.0%} |")
        (RESULTS_DIR / "sweep.md").write_text("# Decoder sweep (silent clips)\n\n" + "\n".join(lines) + "\n")
        print("\n".join(lines))
        return

    cfg = DecodeConfig(beam=args.beam, lm_weight=args.lm_weight, ctc_weight=args.ctc_weight)
    tag = args.tag or (f"{args.mode}" + (f"_{args.height}p_q{args.quality}" if args.mode == "stream" else "")
                       + ("_realtime" if args.realtime else "") + f"_beam{cfg.beam}" + ("_adapter" if args.adapter else ""))
    run(args, cfg, tag)


if __name__ == "__main__":
    main()
