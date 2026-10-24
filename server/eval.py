"""Score the lip-reader on the feasibility clips (named <person>_<silent|aloud>_<id>.webm).

    python -m server.eval                                   # whole-clip path, beam 40 (the feasibility setup)
    python -m server.eval --mode stream --height 480        # the live path: 25 fps JPEGs through on_frame/finish
    python -m server.eval --mode stream --realtime          # ... fed at 25 fps, for honest after-release latency
    python -m server.eval --sweep lm=0,0.1,0.3 ctc=0.1,0.3  # decoder settings (reuses cached mouth crops)
    python -m server.eval --adapter                         # use each person's LoRA adapter, if trained
    python -m server.eval --dump-fit data/clips.jsonl       # JSONL for silentcalls/fit_weights.py
    python -m server.eval --vocab sarvajith nilesh rahul    # bias toward names (false-positive check on these clips)
    python -m server.eval --clips /opt/lr/name_clips --sentences name_sentences.csv --vocab-from-csv
                                                            # name clips: does the name reach the top 1 / top 5?

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
import subprocess
import tempfile
import time
from pathlib import Path

import cv2
import numpy as np

from .lipread import frames as fr
from .lipread import vocab as vb
from .lipread.metrics import norm, score, summarize
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


DEFAULT_SENTENCES = "feasibility_sentences.csv"


def load_sentences(name: str = DEFAULT_SENTENCES) -> dict[str, dict]:
    with open(EVAL_DATA / name, encoding="utf-8") as f:
        return {r["id"]: r for r in csv.DictReader(f)}


def name_hits(ref: str, hyps: list[str], vocab: list[str]) -> dict:
    """For clips whose reference contains a vocab word: is every such word in the top 1 / top 5?"""
    ref_n = f" {norm(ref)} "
    names = [w for w in vocab if f" {w} " in ref_n]
    if not names:
        return {"names": "", "name@1": "", "name@5": ""}
    has = [all(f" {w} " in f" {norm(h)} " for w in names) for h in hyps]
    return {"names": " ".join(names), "name@1": int(any(has[:1])), "name@5": int(any(has[:5]))}


def cached_crop(reader: LipReader, key, path: str, prefix: str = "") -> tuple[np.ndarray | None, dict, str | None]:
    """Mouth crop for a clip (whole-clip path), cached by source mtime under CACHE_DIR."""
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cp = CACHE_DIR / (prefix + "_".join(key) + ".npz")
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


def client_face_crop(frames: list[np.ndarray], size: int, gray: bool, det: fr.FaceDetector,
                     margin: float = 2.0) -> list[np.ndarray]:
    """What a bandwidth-saving client would send: a fixed square around the face (from MediaPipe's face box
    on the first frames; `margin` x the box), resized to size x size."""
    boxes = [b for b in (fr.face_box(det, f) for f in frames[:10]) if b is not None]
    h, w = frames[0].shape[:2]
    if boxes:
        x0, y0, bw, bh = np.median(np.array(boxes), axis=0)
        side = margin * max(bw, bh)
        cx, cy = x0 + bw / 2, y0 + bh / 2
    else:
        side, cx, cy = min(h, w), w / 2, h / 2
    side = min(side, h, w)
    x = int(np.clip(cx - side / 2, 0, w - side))
    y = int(np.clip(cy - side / 2, 0, h - side))
    s = int(side)
    out = []
    for f in frames:
        c = cv2.resize(f[y:y + s, x:x + s], (size, size), interpolation=cv2.INTER_AREA)
        if gray:
            c = np.repeat(cv2.cvtColor(c, cv2.COLOR_RGB2GRAY)[..., None], 3, axis=2)
        out.append(c)
    return out


def vp8_bytes(path: str, height: int, bitrate: str) -> bytes:
    """Re-encode a clip the way a MediaRecorder stream would arrive: VP8, realtime encoder, capped bitrate."""
    with tempfile.TemporaryDirectory() as d:
        out = os.path.join(d, "clip.webm")
        subprocess.run([fr._ffmpeg(), "-loglevel", "error", "-i", path, "-an", "-vf", f"scale=-2:{height}",
                        "-c:v", "libvpx", "-deadline", "realtime", "-cpu-used", "8", "-b:v", bitrate,
                        "-maxrate", bitrate, "-bufsize", bitrate, out], check=True)
        return open(out, "rb").read()


def reencoded(path: str, height: int, bitrate: str) -> tuple[list[np.ndarray], float]:
    """VP8 round trip. Returns (25 fps frames, KB/s on the wire)."""
    data = vp8_bytes(path, height, bitrate)
    frames = fr.decode_webm(data)
    return frames, len(data) / 1024 / max(0.04, len(frames) / MODEL_FPS)


async def webm_clip(reader: LipReader, path: str, height: int, bitrate: str, realtime: bool,
                    user_id: str | None, vocab: list[str] | None = None) -> tuple[LipResult, float]:
    """Replay a clip as MediaRecorder chunks (~100 ms each) through on_chunk(), then finish()."""
    data = vp8_bytes(path, height, bitrate)
    dur = len(fr.decode_webm(data)) / MODEL_FPS  # browser webm headers often have no duration
    n = max(1, round(dur / 0.1))
    step = -(-len(data) // n)
    utt = f"webm-{time.monotonic_ns()}"
    t_start = time.perf_counter()
    for i in range(n):
        reader.on_chunk(utt, data[i * step:(i + 1) * step])
        if realtime:
            await asyncio.sleep(max(0.0, t_start + (i + 1) * 0.1 - time.perf_counter()))
    t0 = time.perf_counter()
    res = await reader.finish(utt, user_id, vocab=vocab)
    res.timings_ms["finish_ms"] = round((time.perf_counter() - t0) * 1000)
    return res, len(data) / 1024 / max(0.1, dur)


async def stream_clip(reader: LipReader, path: str, height: int, quality: int, realtime: bool,
                      user_id: str | None, face_crop: int = 0, gray: bool = False,
                      margin: float = 2.0, vocab: list[str] | None = None) -> tuple[LipResult, float]:
    """Replay a clip the way the desktop client sends it: 25 fps JPEG frames, then finish()."""
    frames = fr.read_video(path, max_height=height)
    if face_crop:
        frames = client_face_crop(frames, face_crop, gray, reader._detector(), margin)
    jpegs = [fr.encode_jpeg(f, quality, gray=gray) for f in frames]
    utt = f"replay-{time.monotonic_ns()}"
    t_start = time.perf_counter()
    for i, j in enumerate(jpegs):
        reader.on_frame(utt, j)
        if realtime:
            await asyncio.sleep(max(0.0, t_start + (i + 1) / MODEL_FPS - time.perf_counter()))
    kb = sum(len(j) for j in jpegs) / 1024 / max(1, len(jpegs) / MODEL_FPS)
    t0 = time.perf_counter()
    res = await reader.finish(utt, user_id, vocab=vocab)
    res.timings_ms["finish_ms"] = round((time.perf_counter() - t0) * 1000)
    return res, kb


def run(args, cfg: DecodeConfig, tag: str, reader: LipReader | None = None) -> dict:
    sentences = load_sentences(args.sentences)
    vocab = vb.clean(args.vocab or [])
    if args.vocab_from_csv:
        vocab = vb.clean(vocab + [w for r in sentences.values() for w in (r.get("names") or "").split(";")])
    cache_prefix = "" if args.sentences == DEFAULT_SENTENCES else Path(args.sentences).stem + "_"
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
            res, kb = asyncio.run(stream_clip(reader, path, args.height, args.quality, args.realtime, user,
                                              args.face_crop, args.gray, args.face_margin, vocab))
            kbs.append(kb)
        elif args.mode == "video" and args.chunks:
            res, kb = asyncio.run(webm_clip(reader, path, args.height, args.bitrate, args.realtime, user, vocab))
            kbs.append(kb)
        elif args.mode == "video":
            frames, kb = reencoded(path, args.height, args.bitrate)
            kbs.append(kb)
            res = reader.read_frames(frames, user, vocab)
            res.timings_ms["finish_ms"] = round((time.perf_counter() - t0) * 1000)
        else:
            crop, q, err = cached_crop(reader, key, path, cache_prefix)
            if crop is None:
                res = LipResult([], 0, 0, quality=q, error=err)
            else:
                res = reader.read_crop(crop, user, vocab)
                res.quality = q
            res.timings_ms["finish_ms"] = round((time.perf_counter() - t0) * 1000)
        ref = sentences[sid]["sentence"]
        hyps = [c[0] for c in res.candidates]
        row = {"person": person, "mode": mode, "id": sid, "reference": ref, "top1": hyps[0] if hyps else "",
               **score(ref, hyps), **name_hits(ref, hyps, vocab), "name_variants": len(res.name_variants),
               "top5": " | ".join(hyps[:5]), "adapter": res.adapter or "",
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
                   "face_crop": args.face_crop, "gray": args.gray,
                   "kb_per_s": round(statistics.mean(kbs)) if kbs else None} if args.mode == "stream" else None,
        "video": {"height": args.height, "bitrate": args.bitrate,
                  "kb_per_s": round(statistics.mean(kbs)) if kbs else None} if args.mode == "video" else None,
        "adapter": bool(args.adapter),
        "sentences": args.sentences,
        "vocab": {"words": vocab, "name_bias": cfg.name_bias} if vocab else None,
        "groups": {g: {**summarize(rs), **summarize_names(rs)}
                   for g, rs in sorted(groups.items(), key=lambda kv: (kv[0].startswith("ALL"), kv[0]))},
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


def summarize_names(rows: list[dict]) -> dict:
    named = [r for r in rows if r["names"]]
    if not named:
        return {}
    return {"name_clips": len(named), "name@1": round(statistics.mean(r["name@1"] for r in named), 4),
            "name@5": round(statistics.mean(r["name@5"] for r in named), 4)}


def render_md(s: dict) -> str:
    d = s["decode"]
    head = f"# {s['tag']}\n\nmode `{s['mode']}` on `{s['device']}` · beam {d['beam']} · LM weight {d['lm_weight']} · " \
           f"CTC weight {d['ctc_weight']} · adapter {'on' if s['adapter'] else 'off'}"
    if s.get("sentences", DEFAULT_SENTENCES) != DEFAULT_SENTENCES:
        head += f" · sentences `{s['sentences']}`"
    if s.get("vocab"):
        head += f" · vocab {len(s['vocab']['words'])} words, bias {s['vocab']['name_bias']}"
    if s.get("stream"):
        st = s["stream"]
        crop = f" face crop {st['face_crop']}px" if st.get("face_crop") else ""
        head += f" · {st['height']}p{crop} JPEG q{st['jpeg_quality']}{' gray' if st.get('gray') else ''} ({st['kb_per_s']} KB/s)" + (" realtime" if st["realtime"] else "")
    if s.get("video"):
        v = s["video"]
        head += f" · VP8 {v['height']}p at {v['bitrate']}bps ({v['kb_per_s']} KB/s)"
    cols = ["clips", "top1_wer", "exact@1", "exact@3", "exact@5", "exact@10", "oracle_wer@5", "within1@5"]
    if any("name_clips" in v for v in s["groups"].values()):
        cols += ["name_clips", "name@1", "name@5"]
    lines = [head, "", "| group | " + " | ".join(cols) + " |", "|" + "---|" * (len(cols) + 1)]
    for g, v in s["groups"].items():
        lines.append(f"| {g} | " + " | ".join("-" if c not in v else str(v[c]) if c.endswith("clips") else f"{v[c]:.0%}"
                                              for c in cols) + " |")
    if s["timings_median_ms"]:
        lines += ["", "Median timings (ms): " + ", ".join(f"{k} {v:.0f}" for k, v in s["timings_median_ms"].items())]
    if s.get("silent_vs_aloud"):
        sa = s["silent_vs_aloud"]
        lines += ["", f"Silent vs aloud on the same {sa['pairs']} sentences: top-1 WER {sa['silent_wer']:.0%} vs {sa['aloud_wer']:.0%}"]
    return "\n".join(lines) + "\n"


def parse_sweep(items: list[str], name_bias: float) -> list[DecodeConfig]:
    grid = {"beam": [40], "lm": [0.3], "ctc": [0.1], "bias": [name_bias]}
    for it in items:
        k, v = it.split("=")
        grid[k] = [float(x) for x in v.split(",")]
    return [DecodeConfig(beam=int(b), lm_weight=lm, ctc_weight=c, name_bias=nb)
            for b, lm, c, nb in itertools.product(grid["beam"], grid["lm"], grid["ctc"], grid["bias"])]


def main() -> None:
    p = argparse.ArgumentParser(prog="python -m server.eval")
    p.add_argument("--clips", default=str(CLIPS_DIR))
    p.add_argument("--mode", choices=["file", "stream", "video"], default="file",
                   help="video: re-encode to a VP8 stream at --bitrate/--height first (MediaRecorder upload)")
    p.add_argument("--bitrate", default="500k", help="video mode: VP8 bitrate")
    p.add_argument("--chunks", action="store_true", help="video mode: feed 100 ms webm chunks via on_chunk()")
    p.add_argument("--height", type=int, default=720, help="stream mode: frame height sent by the client")
    p.add_argument("--quality", type=int, default=80, help="stream mode: JPEG quality")
    p.add_argument("--realtime", action="store_true", help="stream mode: feed frames at 25 fps")
    p.add_argument("--face-crop", type=int, default=0, help="stream mode: send only an NxN square around the face")
    p.add_argument("--face-margin", type=float, default=2.0, help="face crop side = margin x face box")
    p.add_argument("--gray", action="store_true", help="stream mode: grayscale JPEGs")
    p.add_argument("--beam", type=int, default=40)
    p.add_argument("--lm-weight", type=float, default=0.2)
    p.add_argument("--ctc-weight", type=float, default=0.1)
    p.add_argument("--sweep", nargs="*", help="e.g. lm=0,0.1,0.3 ctc=0.1,0.3 beam=20,40 (file mode)")
    p.add_argument("--adapter", action="store_true", help="use each person's LoRA adapter if one exists")
    p.add_argument("--persons", nargs="*")
    p.add_argument("--only", help="substring filter on clip path")
    p.add_argument("--include-aloud", action="store_true", default=True)
    p.add_argument("--silent-only", dest="include_aloud", action="store_false")
    p.add_argument("--tag", help="results folder name (default: derived from the settings)")
    p.add_argument("--dump-fit", help="also write silent clips as JSONL for silentcalls/fit_weights.py")
    p.add_argument("--sentences", default=DEFAULT_SENTENCES, help="sentence list in server/eval_data/ (id, sentence, "
                   "prior_turn[, names])")
    p.add_argument("--vocab", nargs="*", help="names to bias toward, applied to every clip")
    p.add_argument("--vocab-from-csv", action="store_true", help="add every name in the sentence list's names column")
    p.add_argument("--name-bias", type=float, default=DecodeConfig.name_bias, help="beam bonus per name piece; "
                   "0 = lip-shape matching only")
    args = p.parse_args()
    suffix = ("" if args.sentences == DEFAULT_SENTENCES else f"_{Path(args.sentences).stem}")         + (f"_vocab_bias{args.name_bias}" if args.vocab or args.vocab_from_csv else "")

    if args.sweep:
        table = []
        for cfg in parse_sweep(args.sweep, args.name_bias):
            tag = f"sweep_beam{cfg.beam}_lm{cfg.lm_weight}_ctc{cfg.ctc_weight}"                 + (suffix.replace(f"bias{args.name_bias}", f"bias{cfg.name_bias}"))
            s = run(args, cfg, tag)
            table.append((cfg, s["groups"]["ALL/silent"]))
        lines = ["| beam | LM weight | CTC weight | name bias | top-1 WER | exact@1 | exact@5 | exact@10 | oracle WER@10 "
                 "| name@1 | name@5 |", "|---|---|---|---|---|---|---|---|---|---|---|"]
        for cfg, g in table:
            nm = f"{g['name@1']:.0%} | {g['name@5']:.0%}" if "name@1" in g else "- | -"
            lines.append(f"| {cfg.beam} | {cfg.lm_weight} | {cfg.ctc_weight} | {cfg.name_bias} | {g['top1_wer']:.0%} | "
                         f"{g['exact@1']:.0%} | {g['exact@5']:.0%} | {g['exact@10']:.0%} | {g['oracle_wer@10']:.0%} | {nm} |")
        (RESULTS_DIR / "sweep.md").write_text("# Decoder sweep (silent clips)\n\n" + "\n".join(lines) + "\n")
        print("\n".join(lines))
        return

    cfg = DecodeConfig(beam=args.beam, lm_weight=args.lm_weight, ctc_weight=args.ctc_weight, name_bias=args.name_bias)
    stream_tag = f"_{args.height}p_q{args.quality}" + (f"_face{args.face_crop}m{args.face_margin}" if args.face_crop else "") \
        + ("_gray" if args.gray else "")
    if args.mode == "video":
        stream_tag = f"_vp8_{args.height}p_{args.bitrate}" + ("_chunks" if args.chunks else "")
    tag = args.tag or (f"{args.mode}" + (stream_tag if args.mode != "file" else "")
                       + ("_realtime" if args.realtime else "") + f"_beam{cfg.beam}_lm{cfg.lm_weight}" + ("_adapter" if args.adapter else "") + suffix)
    run(args, cfg, tag)


if __name__ == "__main__":
    main()
