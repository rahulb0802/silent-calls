"""Run components 7-9 as one local service: ws://127.0.0.1:8765 (message shapes in protocol.py).

    python -m silentcalls.app                          # everything
    python -m silentcalls.app --no-voice --no-captions # decision layer only, no audio devices needed
"""

import argparse
import asyncio
import base64
import binascii
import io
import json
import logging
import wave
from urllib.parse import urlparse

import websockets
import httpx
from pydantic import BaseModel, ValidationError

from .captions import CallCaptioner
from .config import settings
from .pipeline import Pipeline
from .protocol import CandidatesMessage
from .voice import VoiceOutput, clone_error_message

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

        async def clone_personal_voice(msg):
            try:
                await create_personal_voice(msg)
            except asyncio.CancelledError:
                raise
            except httpx.HTTPStatusError as error:
                await ws.send(json.dumps({"type": "voice.clone.error", "message": clone_error_message(error)}))
            except httpx.RequestError:
                await ws.send(json.dumps({"type": "voice.clone.error", "message": "Cartesia could not be reached. The request may have arrived; check your Cartesia voice library before creating another voice."}))
            except (ValueError, RuntimeError) as error:
                await ws.send(json.dumps({"type": "voice.clone.error", "message": str(error)}))
            except Exception:
                # Avoid exposing provider response bodies or voice samples in UI/logs.
                log.error("Personal voice setup failed unexpectedly")
                await ws.send(json.dumps({"type": "voice.clone.error", "message": "Voice setup failed. Reconnect to check its status before trying again."}))

        async def create_personal_voice(msg):
            if not pipeline.voice:
                raise ValueError("Voice output is unavailable.")
            name = text_field(msg, "name")
            if len(name) > 80:
                raise ValueError("Voice name must be 80 characters or fewer.")
            encoded = msg.get("wav")
            if not isinstance(encoded, str) or len(encoded) > 2_600_000:
                raise ValueError("Voice sample must be a short WAV recording.")
            try:
                wav = base64.b64decode(encoded, validate=True)
                with wave.open(io.BytesIO(wav), "rb") as sample:
                    seconds = sample.getnframes() / sample.getframerate()
                    valid = (sample.getnchannels() == 1 and sample.getsampwidth() == 2
                             and sample.getframerate() in {16000, 44100, 48000} and 3 <= seconds <= 20)
                    if valid:
                        valid = len(sample.readframes(sample.getnframes())) == sample.getnframes() * 2
            except (binascii.Error, EOFError, ValueError, wave.Error, ZeroDivisionError) as e:
                raise ValueError("Could not read the voice sample WAV.") from e
            if not valid:
                raise ValueError("Record 3–20 seconds of mono WAV voice audio.")
            await pipeline.voice.clone_from_sample(wav, name)
            await ws.send(json.dumps({"type": "voice.ready", **pipeline.voice.profile}))

        clients.add(ws)
        try:
            await ws.send(json.dumps({"type": "voice.status", **(pipeline.voice.profile if pipeline.voice else
                                                                   {"personal": False, "name": "", "has_voice": False})}))
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
                    elif kind == "voice.clone":
                        launch(clone_personal_voice(msg))
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
    if pipeline.jev:
        pipeline.jev.start()
    tasks = []
    if not args.no_captions:
        tasks.append(asyncio.create_task(CallCaptioner(settings, pipeline.on_caption).run()))

    try:
        async with websockets.serve(handler(pipeline), settings.host, settings.port, max_size=3 * 1024 * 1024):
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
