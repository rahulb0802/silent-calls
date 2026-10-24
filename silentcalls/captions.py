"""Component 7: capture the call's audio, transcribe the other person, keep recent lines as context.

Zoom/Meet/FaceTime speaker output is routed to a loopback device (CALL_AUDIO_DEVICE); we stream it to
Cartesia's speech-to-text WebSocket and send `finalize` after a pause, so each turn becomes one line.

On Windows, CALL_AUDIO_DEVICE=loopback (the default there) records what your speakers play through WASAPI
loopback, so no second virtual cable is needed: `loopback` picks the default speaker unless that is a
VB-CABLE (our own voice goes there), `loopback:Realtek` picks a speaker by name.
Our own lines are added by the pipeline after they are spoken, so the context has both sides.
"""

import asyncio
import json
import logging
import sys
import threading
import time
import warnings
from collections import deque
from collections.abc import Awaitable, Callable
from urllib.parse import urlencode

import numpy as np
import sounddevice as sd
import websockets

from .audio import find_device, to_mono_16k
from .config import Settings

log = logging.getLogger(__name__)

STT_URL = "wss://api.cartesia.ai/stt/websocket"
CHUNK_S = 0.1  # Cartesia recommends ~100 ms chunks
LOOPBACK_RATE = 48000


def loopback_speaker(spec: str):
    """The Windows speaker to record for `loopback` / `loopback:<name>`: never a VB-CABLE, which carries our
    own cloned voice into the meeting, not the call."""
    import soundcard as sc  # Windows-only dependency

    name = spec.partition(":")[2].strip().lower()
    speakers = [s for s in sc.all_speakers() if "cable" not in s.name.lower()]
    if name:
        speakers = [s for s in speakers if name in s.name.lower()]
    default = sc.default_speaker()
    pick = next((s for s in speakers if s.name == default.name), speakers[0] if speakers else None)
    if pick is None:
        raise RuntimeError(f"No speaker to record for {spec!r}. Speakers: {[s.name for s in sc.all_speakers()]}")
    return sc.get_microphone(id=str(pick.name), include_loopback=True), pick.name


class Transcript:
    """The last few lines of the call, both speakers interleaved."""

    def __init__(self, max_lines: int):
        self._lines: deque[tuple[str, str]] = deque(maxlen=max_lines)

    def add(self, speaker: str, text: str) -> None:
        text = text.strip()
        if text:
            self._lines.append((speaker, text))

    def render(self, also: tuple[str, str] | None = None) -> str:
        """The lines so far; `also`: one more (speaker, text) at the end, e.g. a line still being spoken."""
        lines = [*self._lines, also] if also else list(self._lines)
        if not lines:
            return "(no conversation yet)"
        names = {"them": "Other person", "me": "User"}
        return "\n".join(f"{names.get(s, s)}: {t}" for s, t in lines)


class CallCaptioner:
    def __init__(self, settings: Settings, on_line: Callable[[str], Awaitable[None]],
                 on_partial: Callable[[str], Awaitable[None]] | None = None):
        self.s = settings
        self.on_line = on_line
        self.on_partial = on_partial  # the line so far, as Cartesia streams it, for live display

    async def run(self) -> None:
        """Capture and transcribe forever, reconnecting on errors."""
        backoff = 1.0
        while True:
            try:
                await self._session()
                backoff = 1.0
            except asyncio.CancelledError:
                raise
            except Exception as e:  # network drop, device unplugged, ...
                log.warning("captions: %s; reconnecting in %.0fs", e, backoff)
                await asyncio.sleep(backoff)
                backoff = min(backoff * 2, 15.0)

    def _use_loopback(self) -> bool:
        spec = self.s.call_audio_device
        if spec.lower().startswith("loopback"):
            return True
        if sys.platform == "win32":
            try:
                find_device(spec, "input")
            except RuntimeError:
                log.warning("captions: no input device %r; recording the speakers instead (loopback)", spec)
                return True
        return False

    async def _session(self) -> None:
        loop = asyncio.get_running_loop()
        audio_q: asyncio.Queue[np.ndarray] = asyncio.Queue(maxsize=20)

        def enqueue(block):
            # Keep at most two seconds; do not accumulate stale call audio.
            if audio_q.full():
                audio_q.get_nowait()
            audio_q.put_nowait(block)

        query = urlencode({
            "model": self.s.stt_model,
            "encoding": "pcm_s16le",
            "sample_rate": 16000,
            "cartesia_version": self.s.cartesia_version,
        })
        headers = {"X-API-Key": self.s.cartesia_api_key}

        if self._use_loopback():
            spec = self.s.call_audio_device if self.s.call_audio_device.lower().startswith("loopback") else "loopback"
            stop = threading.Event()
            started: asyncio.Future[str] = loop.create_future()  # the speaker's name, or the error
            failed: asyncio.Future[None] = loop.create_future()

            def settle(fut, value=None, error=None):
                if not fut.done():
                    fut.set_exception(error) if error else fut.set_result(value)

            def pump():  # soundcard's recorder blocks, so it runs on its own thread, with its own COM init
                import ctypes

                import soundcard  # noqa: F401  (its import initializes COM for the importing thread)

                ctypes.windll.ole32.CoInitializeEx(None, 0)  # this thread too, if soundcard was imported elsewhere
                warnings.filterwarnings("ignore", message="data discontinuity")  # harmless glitches when idle
                try:
                    mic, name = loopback_speaker(spec)
                    with mic.recorder(samplerate=LOOPBACK_RATE, channels=2, blocksize=int(LOOPBACK_RATE * CHUNK_S)) as rec:
                        loop.call_soon_threadsafe(settle, started, name)
                        while not stop.is_set():
                            block = rec.record(numframes=int(LOOPBACK_RATE * CHUNK_S))
                            loop.call_soon_threadsafe(enqueue, block.astype(np.float32))
                except Exception as e:  # device gone, COM error, ...: end this session so run() retries
                    loop.call_soon_threadsafe(settle, started, None, e)
                    loop.call_soon_threadsafe(settle, failed, None, e)

            thread = threading.Thread(target=pump, name="call-loopback", daemon=True)
            thread.start()
            try:
                name = await started
                async with websockets.connect(f"{STT_URL}?{query}", additional_headers=headers) as ws:
                    log.info("captions: listening to %s (loopback)", name)
                    await asyncio.gather(self._send(ws, audio_q, LOOPBACK_RATE), self._receive(ws), failed)
            finally:
                stop.set()
            return

        device = find_device(self.s.call_audio_device, "input")
        info = sd.query_devices(device)
        rate = int(info["default_samplerate"])
        channels = min(2, int(info["max_input_channels"]))

        def callback(indata, frames, t, status):
            loop.call_soon_threadsafe(enqueue, indata.copy())

        with sd.InputStream(device=device, samplerate=rate, channels=channels, dtype="float32",
                            blocksize=int(rate * CHUNK_S), callback=callback):
            async with websockets.connect(f"{STT_URL}?{query}", additional_headers=headers) as ws:
                log.info("captions: listening on %s", info["name"])
                await asyncio.gather(self._send(ws, audio_q, rate), self._receive(ws))

    async def _send(self, ws, audio_q: asyncio.Queue, rate: int) -> None:
        heard_speech = False
        silent_for = 0.0
        while True:
            block = await audio_q.get()
            mono = to_mono_16k(block, rate)
            await ws.send((np.clip(mono, -1, 1) * 32767).astype("<i2").tobytes())

            # Cheap end-of-turn detection: after speech, a pause triggers a finalize.
            if float(np.sqrt(np.mean(mono**2))) > self.s.silence_rms:
                heard_speech, silent_for = True, 0.0
            elif heard_speech:
                silent_for += CHUNK_S
                if silent_for >= self.s.silence_finalize_s:
                    await ws.send("finalize")
                    heard_speech, silent_for = False, 0.0

    async def _receive(self, ws) -> None:
        pending = ""  # final deltas since the last line; concatenated as-is, per Cartesia docs
        async for raw in ws:
            msg = json.loads(raw)
            kind = msg.get("type")
            if kind == "transcript" and msg.get("is_final"):
                pending += msg.get("text", "")
                if self.on_partial and pending.strip():
                    await self.on_partial(pending.strip())
            elif kind == "flush_done":
                if pending.strip():
                    await self.on_line(pending.strip())
                pending = ""
            elif kind == "error":
                raise RuntimeError(f"Cartesia STT error: {msg.get('title')}: {msg.get('message')}")


async def _demo() -> None:
    """`python -m silentcalls.captions` - print the other person's lines as they arrive."""
    from .config import settings

    async def show(line: str) -> None:
        print(f"[{time.strftime('%H:%M:%S')}] them: {line}")

    await CallCaptioner(settings, show).run()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(_demo())
