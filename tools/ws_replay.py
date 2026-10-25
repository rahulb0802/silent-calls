"""Send recorded clips to a lip-reading server over /ws/session, as the desktop client would: 25 fps JPEG
frames in real time, then utterance.end. Measures the delay from utterance.end to `candidates`, which
includes the network. Needs: pip install av opencv-python numpy websockets

    python tools/ws_replay.py ws://144.202.96.192:8000 clips/rahul/rahul_silent_0*.webm --height 480
    python tools/ws_replay.py ws://localhost:8000 clips/*.webm --webm 1000k   # MediaRecorder-style stream
"""

import argparse
import asyncio
import hashlib
import json
import os
import shutil
import statistics
import subprocess
import time

import av
import cv2
import numpy as np
import websockets


def frames_25fps(path: str, height: int) -> list[np.ndarray]:
    """Decode and resample to 25 fps by timestamp (nearest frame), scaled to `height`. Returns BGR."""
    out, t_next = [], 0.0
    with av.open(path) as c:
        for f in c.decode(video=0):
            t = float(f.pts * f.time_base) if f.pts is not None else t_next
            img = f.to_ndarray(format="bgr24")
            while t >= t_next - 0.02:
                out.append(img)
                t_next += 0.04
    h, w = out[0].shape[:2]
    if h > height:
        size = (int(round(w * height / h / 2)) * 2, height)
        out = [cv2.resize(x, size, interpolation=cv2.INTER_AREA) for x in out]
    return out


def webm_chunks(path: str, height: int, bitrate: str) -> list[bytes]:
    """VP8 webm (like MediaRecorder) split into ~100 ms chunks. Needs ffmpeg (or pip install imageio-ffmpeg)."""
    try:
        import imageio_ffmpeg

        exe = imageio_ffmpeg.get_ffmpeg_exe()
    except ImportError:
        exe = shutil.which("ffmpeg")
    data = subprocess.run([exe, "-loglevel", "error", "-i", path, "-an", "-vf", f"scale=-2:{height}", "-c:v", "libvpx",
                           "-deadline", "realtime", "-cpu-used", "8", "-b:v", bitrate, "-maxrate", bitrate,
                           "-bufsize", bitrate, "-f", "webm", "-"], check=True, capture_output=True).stdout
    n = max(1, round(len(frames_25fps(path, 9999)) / 2.5))  # 100 ms = 2.5 frames
    step = -(-len(data) // n)
    return [data[i * step:(i + 1) * step] for i in range(n)]


async def run(url: str, clips: list[str], height: int, quality: int, user: str, webm: str | None,
              given: list[str] | None = None) -> None:
    delays = []
    async with websockets.connect(f"{url}/ws/session?user_id={user}", max_size=None) as ws:
        # profiles open only with their key (server/lipread/identity.py); a fixed one per replay user
        secret = os.getenv("REPLAY_PROFILE_KEY") or hashlib.sha256(f"replay:{user}".encode()).hexdigest()[:48]
        await ws.send(json.dumps({"type": "session.start", "user_id": user, "secret": secret, "use_adapter": True}))
        for i, path in enumerate(clips):
            if webm:
                frames, rate = webm_chunks(path, height, webm), 10  # chunks, sent at 10 per second
            else:
                frames, rate = [cv2.imencode(".jpg", f, [cv2.IMWRITE_JPEG_QUALITY, quality])[1].tobytes()
                                for f in frames_25fps(path, height)], 25
            utt = f"r{i}"
            await ws.send(json.dumps({"type": "utterance.start", "utt_id": utt, "fps": 25,
                                      "encoding": "webm" if webm else "jpeg", **({"given": given} if given else {}),
                                      "t_press_ms": int(time.time() * 1000)}))
            t_start = time.perf_counter()
            for k, j in enumerate(frames):
                await ws.send(j)
                await asyncio.sleep(max(0.0, t_start + (k + 1) / rate - time.perf_counter()))
            t_end = time.perf_counter()
            await ws.send(json.dumps({"type": "utterance.end", "utt_id": utt, "n_frames": len(frames),
                                      "t_release_ms": int(time.time() * 1000)}))
            reply = json.loads(await ws.recv())
            ms = (time.perf_counter() - t_end) * 1000
            delays.append(ms)
            kb = sum(map(len, frames)) / 1024 / (len(frames) / rate)
            top = reply["candidates"][0]["text"] if reply.get("candidates") else reply.get("code")
            print(f"{path}: {ms:.0f} ms end->candidates | {kb:.0f} KB/s | {top!r} | adapter {reply.get('adapter')} "
                  f"| given on top: {bool(reply.get('given')) and top in reply['given']} | {reply.get('timings')}")
    print(f"median end->candidates {statistics.median(delays):.0f} ms over {len(delays)} clips")


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("url", help="ws://host:port")
    p.add_argument("clips", nargs="+")
    p.add_argument("--height", type=int, default=480)
    p.add_argument("--quality", type=int, default=80)
    p.add_argument("--user", default="replay")
    p.add_argument("--webm", metavar="BITRATE", help="send a VP8 webm stream (e.g. 1000k) instead of JPEG frames")
    p.add_argument("--given", nargs="*", help="co-pilot replies to send with each utterance (scored by the server)")
    a = p.parse_args()
    asyncio.run(run(a.url, a.clips, a.height, a.quality, a.user, a.webm, a.given))
