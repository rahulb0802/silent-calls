"""Send recorded clips to a lip-reading server over /ws/session, as the desktop client would: 25 fps JPEG
frames in real time, then utterance.end. Measures the delay from utterance.end to `candidates`, which
includes the network. Needs: pip install av opencv-python numpy websockets

    python tools/ws_replay.py ws://144.202.96.192:8000 clips/rahul/rahul_silent_0*.webm --height 480
"""

import argparse
import asyncio
import json
import statistics
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


async def run(url: str, clips: list[str], height: int, quality: int, user: str) -> None:
    delays = []
    async with websockets.connect(f"{url}/ws/session?user_id={user}", max_size=None) as ws:
        await ws.send(json.dumps({"type": "session.start", "user_id": user, "use_adapter": True}))
        for i, path in enumerate(clips):
            frames = [cv2.imencode(".jpg", f, [cv2.IMWRITE_JPEG_QUALITY, quality])[1].tobytes()
                      for f in frames_25fps(path, height)]
            utt = f"r{i}"
            await ws.send(json.dumps({"type": "utterance.start", "utt_id": utt, "fps": 25,
                                      "t_press_ms": int(time.time() * 1000)}))
            t_start = time.perf_counter()
            for k, j in enumerate(frames):
                await ws.send(j)
                await asyncio.sleep(max(0.0, t_start + (k + 1) / 25 - time.perf_counter()))
            t_end = time.perf_counter()
            await ws.send(json.dumps({"type": "utterance.end", "utt_id": utt, "n_frames": len(frames),
                                      "t_release_ms": int(time.time() * 1000)}))
            reply = json.loads(await ws.recv())
            ms = (time.perf_counter() - t_end) * 1000
            delays.append(ms)
            kb = sum(map(len, frames)) / 1024 / (len(frames) / 25)
            top = reply["candidates"][0]["text"] if reply.get("candidates") else reply.get("code")
            print(f"{path}: {ms:.0f} ms end->candidates | {kb:.0f} KB/s | {top!r} | {reply.get('timings')}")
    print(f"median end->candidates {statistics.median(delays):.0f} ms over {len(delays)} clips")


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("url", help="ws://host:port")
    p.add_argument("clips", nargs="+")
    p.add_argument("--height", type=int, default=480)
    p.add_argument("--quality", type=int, default=80)
    p.add_argument("--user", default="replay")
    a = p.parse_args()
    asyncio.run(run(a.url, a.clips, a.height, a.quality, a.user))
