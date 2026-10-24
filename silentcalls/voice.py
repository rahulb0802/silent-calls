"""Component 9: speak text in the user's cloned voice into the virtual mic Zoom listens to.

Cartesia /tts/bytes streams raw PCM; we write chunks to the virtual mic device as they arrive, so the
first audio plays before the whole sentence is synthesized.

    python -m silentcalls.voice clone recording.wav --name "Nilesh"   # prints the voice id
    python -m silentcalls.voice say "Hello, can you hear me?"         # test into the virtual mic
"""

import argparse
import asyncio
import logging
import time
from pathlib import Path

import httpx
import sounddevice as sd

from .audio import find_device
from .config import Settings

log = logging.getLogger(__name__)

API = "https://api.cartesia.ai"


def _client(s: Settings, timeout: float = 15.0) -> httpx.AsyncClient:
    headers = {"Authorization": f"Bearer {s.cartesia_api_key}", "Cartesia-Version": s.cartesia_version}
    return httpx.AsyncClient(base_url=API, headers=headers, timeout=timeout)


class VoiceOutput:
    def __init__(self, settings: Settings):
        self.s = settings
        self._http = _client(settings)
        self._lock = asyncio.Lock()  # one utterance at a time, never overlapping
        self._stream: sd.RawOutputStream | None = None
        self._opener_pcm: bytes | None = None

    async def start(self) -> None:
        if not self.s.cartesia_voice_id:
            raise RuntimeError("CARTESIA_VOICE_ID is not set; clone a voice first (see module docstring)")
        device = find_device(self.s.virtual_mic_device, "output")
        self._stream = sd.RawOutputStream(device=device, samplerate=self.s.output_sample_rate,
                                          channels=1, dtype="int16")
        self._stream.start()
        # Pre-render the opener so it plays instantly when the call starts.
        self._opener_pcm = b"".join([c async for c in self._synthesize(self.s.opener_text)])
        log.info("voice: ready on %s", sd.query_devices(device)["name"])

    async def close(self) -> None:
        if self._stream:
            self._stream.stop()
            self._stream.close()
        await self._http.aclose()

    async def say(self, text: str) -> float:
        """Speak `text`; returns ms from call to first audio written to the device."""
        async with self._lock:
            t0 = time.perf_counter()
            first_ms = -1.0
            carry = b""
            async for chunk in self._synthesize(text):
                chunk, carry = carry + chunk, b""
                if len(chunk) % 2:  # keep 16-bit samples whole across chunk boundaries
                    chunk, carry = chunk[:-1], chunk[-1:]
                if first_ms < 0:
                    first_ms = (time.perf_counter() - t0) * 1000
                await asyncio.to_thread(self._stream.write, chunk)
            log.info("voice: first audio %.0f ms for %r", first_ms, text)
            return first_ms

    async def play_opener(self) -> None:
        async with self._lock:
            await asyncio.to_thread(self._stream.write, self._opener_pcm)

    async def _synthesize(self, text: str):
        body = {
            "model_id": self.s.tts_model,
            "transcript": text,
            "voice": {"id": self.s.cartesia_voice_id},
            "language": "en",
            "output_format": {"container": "raw", "encoding": "pcm_s16le",
                              "sample_rate": self.s.output_sample_rate},
        }
        async with self._http.stream("POST", "/tts/bytes", json=body) as resp:
            if resp.status_code != 200:
                raise RuntimeError(f"Cartesia TTS {resp.status_code}: {(await resp.aread()).decode()}")
            async for chunk in resp.aiter_bytes():
                yield chunk


async def clone_voice(s: Settings, clip: Path, name: str) -> str:
    """Clone a voice from a short, clean recording; returns the new voice id."""
    async with _client(s, timeout=120) as http:
        with clip.open("rb") as f:
            resp = await http.post("/voices/clone", data={"name": name, "language": "en"},
                                   files={"clip": (clip.name, f)})
    resp.raise_for_status()
    return resp.json()["id"]


async def _main() -> None:
    from .config import settings

    p = argparse.ArgumentParser(prog="python -m silentcalls.voice")
    sub = p.add_subparsers(dest="cmd", required=True)
    c = sub.add_parser("clone")
    c.add_argument("clip", type=Path)
    c.add_argument("--name", required=True)
    sy = sub.add_parser("say")
    sy.add_argument("text")
    args = p.parse_args()

    if args.cmd == "clone":
        voice_id = await clone_voice(settings, args.clip, args.name)
        print(f"Cloned. Add to .env:\nCARTESIA_VOICE_ID={voice_id}")
    else:
        v = VoiceOutput(settings)
        await v.start()
        await v.say(args.text)
        await asyncio.sleep(0.5)  # let the device drain
        await v.close()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(_main())
