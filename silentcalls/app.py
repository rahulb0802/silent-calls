"""Run components 7-9 as one local service: ws://127.0.0.1:8765 (message shapes in protocol.py).

    python -m silentcalls.app                          # everything
    python -m silentcalls.app --no-voice --no-captions # decision layer only, no audio devices needed
"""

import argparse
import asyncio
import json
import logging

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
        clients.add(ws)
        try:
            async for raw in ws:
                try:
                    msg = json.loads(raw)
                    kind = msg.get("type")
                    if kind == "candidates":
                        # Don't block this connection's next message on Jev/TTS.
                        asyncio.create_task(pipeline.handle(CandidatesMessage.model_validate(msg)))
                    elif kind == "confirm":
                        asyncio.create_task(pipeline.confirm(msg["utterance_id"], msg["text"]))
                    elif kind == "say":
                        asyncio.create_task(pipeline.speak(msg["text"]))
                    elif kind == "opener" and pipeline.voice:
                        asyncio.create_task(pipeline.voice.play_opener())
                    else:
                        await ws.send(json.dumps({"type": "error", "message": f"unknown type {kind!r}"}))
                except (json.JSONDecodeError, KeyError, ValidationError) as e:
                    await ws.send(json.dumps({"type": "error", "message": str(e)}))
        finally:
            clients.discard(ws)
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
