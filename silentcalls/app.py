"""Run components 7-9 as one local service: ws://127.0.0.1:8765 (message shapes in protocol.py).

    python -m silentcalls.app                          # everything
    python -m silentcalls.app --no-voice --no-captions # decision layer only, no audio devices needed
"""

import argparse
import asyncio
import json
import logging
from urllib.parse import urlparse

import websockets
from pydantic import BaseModel, ValidationError

from .captions import CallCaptioner
from .config import settings
from .pipeline import Pipeline
from .protocol import CandidatesMessage
from .voice import VoiceOutput

log = logging.getLogger("silentcalls")

clients: set = set()


async def broadcast(event: BaseModel) -> None:
    data = event.model_dump_json()
    for ws in list(clients):
        try:
            await ws.send(data)
        except websockets.ConnectionClosed:
            clients.discard(ws)


def handler(pipeline: Pipeline):
    async def serve(ws):
        # The interim service is local and single-user; browser pages must not
        # silently send speech commands to it from an unrelated web origin.
        origin = ws.request.headers.get("Origin")
        if origin:
            parsed = urlparse(origin)
            local = parsed.scheme in {"http", "https"} and parsed.hostname in {"127.0.0.1", "localhost", "::1"}
            desktop = parsed.scheme == "silent" and parsed.hostname == "app"
            if not (local or desktop):
                await ws.close(code=1008, reason="Local desktop origin required")
                return
        pending: set[asyncio.Task] = set()

        async def run(operation):
            try:
                await operation
            except asyncio.CancelledError:
                raise
            except Exception:
                log.exception("background request failed")
                try:
                    await ws.send(json.dumps({"type": "error", "message": "Request failed; check the local service logs."}))
                except websockets.ConnectionClosed:
                    pass

        def launch(operation):
            task = asyncio.create_task(run(operation))
            pending.add(task)
            task.add_done_callback(pending.discard)

        def text_field(msg, key):
            value = msg[key]
            if not isinstance(value, str) or not value.strip() or len(value) > 5000:
                raise ValueError(f"{key} must be nonempty text up to 5000 characters")
            return value

        clients.add(ws)
        try:
            async for raw in ws:
                try:
                    if not isinstance(raw, str):
                        raise ValueError("This interim decision service accepts JSON, not webcam frames; use the GPU orchestrator for video.")
                    msg = json.loads(raw)
                    if not isinstance(msg, dict):
                        raise ValueError("Expected a JSON object")
                    if len(pending) >= 16:
                        raise ValueError("Too many pending requests; wait before retrying")
                    kind = msg.get("type")
                    if kind == "candidates":
                        launch(pipeline.handle(CandidatesMessage.model_validate(msg)))
                    elif kind == "confirm":
                        launch(pipeline.confirm(text_field(msg, "utterance_id"), text_field(msg, "text")))
                    elif kind == "say":
                        launch(pipeline.speak(text_field(msg, "text")))
                    elif kind == "opener" and pipeline.voice:
                        launch(pipeline.voice.play_opener())
                    else:
                        await ws.send(json.dumps({"type": "error", "message": f"unknown type {kind!r}"}))
                except (json.JSONDecodeError, KeyError, ValidationError, ValueError) as e:
                    await ws.send(json.dumps({"type": "error", "message": str(e)}))
        finally:
            clients.discard(ws)
            tasks = list(pending)
            for task in tasks:
                task.cancel()
            await asyncio.gather(*tasks, return_exceptions=True)
    return serve


async def main() -> None:
    p = argparse.ArgumentParser(prog="python -m silentcalls.app")
    p.add_argument("--no-voice", action="store_true", help="don't speak; just emit events")
    p.add_argument("--no-captions", action="store_true", help="don't capture call audio")
    p.add_argument("--no-jev", action="store_true")
    p.add_argument("--no-claude", action="store_true")
    args = p.parse_args()

    voice = None
    if not args.no_voice:
        voice = VoiceOutput(settings)
        await voice.start()

    pipeline = Pipeline(settings, voice, broadcast, use_jev=not args.no_jev, use_claude=not args.no_claude)
    tasks = []
    if not args.no_captions:
        tasks.append(asyncio.create_task(CallCaptioner(settings, pipeline.on_caption).run()))

    try:
        async with websockets.serve(handler(pipeline), settings.host, settings.port):
            log.info("listening on ws://%s:%d", settings.host, settings.port)
            await asyncio.Future()
    finally:
        for t in tasks:
            t.cancel()
        await pipeline.close()
        if voice:
            await voice.close()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(message)s")
    asyncio.run(main())
