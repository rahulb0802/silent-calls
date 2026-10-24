"""Stand-in server: the lip-reading half of PROTOCOL.md v0.1 on the real GPU, until the orchestrator
(server/app/, Person 3) mounts LipReader itself. Lets the client test real candidates and latency.

    uvicorn server.lipread.dev_app:app --host 0.0.0.0 --port 8000

Supports session.start, utterance.start (optional `encoding: "jpeg" | "webm"`; both take an optional
`vocab: [names]`, proposed in PROTOCOL.md), binary JPEG frames or MediaRecorder webm chunks, utterance.end,
utterance.cancel, and replies
with `candidates` (lip scores only: no Jev, so lm_score is null and route is always "pick"), plus `error`.
Also serves the enrollment/training endpoints and GET /health.
"""

import asyncio
import json
import logging
import math
import time

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from .reader import LipReader
from .routes import router

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(message)s")
log = logging.getLogger("dev_app")
app = FastAPI(title="silent calls lip-reader (dev)")
app.include_router(router)
# tools/record_enroll.html is opened from file://, so it needs CORS
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
reader: LipReader | None = None


@app.on_event("startup")
async def _startup() -> None:
    global reader
    reader = await asyncio.get_running_loop().run_in_executor(None, LipReader)


@app.get("/health")
def health() -> dict:
    return {"ok": reader is not None, "device": reader.device if reader else None,
            "load_s": round(reader.load_s, 1) if reader else None}


def softmax(xs: list[float]) -> list[float]:
    m = max(xs)
    e = [math.exp(x - m) for x in xs]
    return [v / sum(e) for v in e]


@app.websocket("/ws/session")
async def session(ws: WebSocket, user_id: str = "anon") -> None:
    await ws.accept()
    use_adapter, utt_id, webm = True, None, False
    session_vocab, utt_vocab = [], []
    try:
        while True:
            msg = await ws.receive()
            if msg["type"] == "websocket.disconnect":
                break
            if msg.get("bytes") is not None:
                if utt_id:
                    (reader.on_chunk if webm else reader.on_frame)(utt_id, msg["bytes"])
                continue
            m = json.loads(msg["text"])
            kind = m.get("type")
            if kind == "session.start":
                user_id = m.get("user_id", user_id)
                use_adapter = m.get("use_adapter", True)
                session_vocab = list(m.get("vocab") or [])
            elif kind == "utterance.start":
                utt_id = m["utt_id"]
                webm = m.get("encoding", "jpeg") == "webm"  # binary = MediaRecorder chunks, not JPEGs
                utt_vocab = list(m.get("vocab") or [])  # e.g. names just heard in the call
            elif kind == "utterance.cancel":
                reader.cancel(m["utt_id"])
                utt_id = None
            elif kind == "utterance.end":
                done, utt_id = m["utt_id"], None
                t0 = time.perf_counter()
                vocab = session_vocab + utt_vocab
                log.info("utterance %s: %d vocab words", done, len(vocab))  # count only: names stay out of logs
                r = await reader.finish(done, user_id, use_adapter, vocab=vocab)
                if r.error:
                    await ws.send_json({"type": "error", "utt_id": done, "code": r.error,
                                        "message": "; ".join(r.quality.get("flags", [])) or r.error})
                    continue
                probs = softmax([s for _, s in r.candidates])
                await ws.send_json({
                    "type": "candidates", "utt_id": done, "route": "pick", "confidence": round(probs[0], 3),
                    "candidates": [{"text": t, "lip_score": round(s, 3), "lm_score": None, "combined": round(p, 4)}
                                   for (t, s), p in zip(r.candidates, probs)],
                    "timings": {**r.timings_ms, "server_ms": round((time.perf_counter() - t0) * 1000)},
                    "adapter": r.adapter, "quality": r.quality, "name_variants": r.name_variants})
    except WebSocketDisconnect:
        pass
    finally:
        if utt_id:
            reader.cancel(utt_id)
