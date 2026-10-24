"""Component 9: speak text in the user's cloned voice into the virtual mic Zoom listens to.

Cartesia /tts/bytes streams raw PCM; we write chunks to the virtual mic device as they arrive, so the
first audio plays before the whole sentence is synthesized.

    python -m silentcalls.voice clone recording.wav --name "Nilesh"   # prints the voice id
    python -m silentcalls.voice say "Hello, can you hear me?"         # test into the virtual mic
"""

import argparse
import asyncio
import json
import logging
import os
import re
import time
from io import BytesIO
from pathlib import Path
from tempfile import NamedTemporaryFile

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
    def __init__(self, settings: Settings, profile_path: Path | None = None):
        self.s = settings
        self._http = _client(settings)
        self._lock = asyncio.Lock()  # one utterance at a time, never overlapping
        self._stream: sd.RawOutputStream | None = None
        self._opener_pcm: bytes | None = None
        self._profile_path = profile_path or Path.home() / ".silentcalls" / "voice-profile.json"
        self._voice_id = settings.cartesia_voice_id
        self._voice_name = ""
        self._personal = False
        self._load_profile()

    @property
    def profile(self) -> dict[str, str | bool]:
        return {"personal": self._personal, "name": self._voice_name,
                "has_voice": bool(self._voice_id)}

    def _load_profile(self) -> None:
        try:
            profile = json.loads(self._profile_path.read_text())
            voice_id, name = profile.get("voice_id"), profile.get("name")
            if isinstance(voice_id, str) and voice_id and isinstance(name, str):
                self._voice_id, self._voice_name, self._personal = voice_id, name, True
        except (OSError, ValueError, AttributeError):
            pass  # A missing/invalid local profile leaves the configured fallback voice available.

    def _save_profile(self, voice_id: str, name: str) -> None:
        self._profile_path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        temp_name: str | None = None
        try:
            with NamedTemporaryFile("w", dir=self._profile_path.parent, prefix=".voice-", delete=False) as file:
                temp_name = file.name
                json.dump({"voice_id": voice_id, "name": name}, file)
                file.flush()
                os.fsync(file.fileno())
            os.replace(temp_name, self._profile_path)
        finally:
            if temp_name and os.path.exists(temp_name):
                os.unlink(temp_name)

    async def start(self) -> None:
        device = find_device(self.s.virtual_mic_device, "output")
        self._stream = sd.RawOutputStream(device=device, samplerate=self.s.output_sample_rate,
                                          channels=1, dtype="int16")
        self._stream.start()
        # Provider availability must not prevent onboarding from opening.
        # Render the optional opener lazily when the user asks to play it.
        log.info("voice: ready on %s", sd.query_devices(device)["name"])

    async def close(self) -> None:
        if self._stream:
            self._stream.stop()
            self._stream.close()
        await self._http.aclose()

    async def say(self, text: str) -> float:
        """Speak `text`; returns ms from call to first audio written to the device."""
        async with self._lock:
            if not self._voice_id:
                raise RuntimeError("Set up a voice before speaking.")
            t0 = time.perf_counter()
            first_ms = -1.0
            carry = b""
            try:
                async for chunk in self._synthesize(text):
                    chunk, carry = carry + chunk, b""
                    if len(chunk) % 2:  # keep 16-bit samples whole across chunk boundaries
                        chunk, carry = chunk[:-1], chunk[-1:]
                    if first_ms < 0:
                        first_ms = (time.perf_counter() - t0) * 1000
                    await asyncio.to_thread(self._stream.write, chunk)
            except asyncio.CancelledError:
                if self._stream:
                    await asyncio.to_thread(self._stream.abort)
                    self._stream.start()
                raise
            log.info("voice: first audio %.0f ms for %r", first_ms, text)
            return first_ms

    async def play_opener(self) -> None:
        async with self._lock:
            if self._opener_pcm is None:
                if not self._voice_id:
                    raise RuntimeError("Set up a voice before playing the opener.")
                self._opener_pcm = b"".join([c async for c in self._synthesize(self.s.opener_text)])
            await asyncio.to_thread(self._stream.write, self._opener_pcm)

    async def clone_from_sample(self, wav: bytes, name: str) -> None:
        """Create and select a personal voice; no raw sample is saved locally."""
        async with self._lock:
            voice_id = await clone_voice_bytes(self.s, wav, name)
            self._voice_id, self._voice_name, self._personal = voice_id, name, True
            self._opener_pcm = None  # The previous voice's cached opener must never play.
            try:
                self._save_profile(voice_id, name)
            except OSError as error:
                raise RuntimeError("Your voice was created and selected, but could not be saved on this computer. Reconnect to use it this session; do not create it again. Check permissions for ~/.silentcalls before restarting the service.") from error

    async def _synthesize(self, text: str):
        body = {
            "model_id": self.s.tts_model,
            "transcript": text,
            "voice": {"id": self._voice_id},
            "language": "en",
            "output_format": {"container": "raw", "encoding": "pcm_s16le",
                              "sample_rate": self.s.output_sample_rate},
        }
        async with self._http.stream("POST", "/tts/bytes", json=body) as resp:
            if resp.status_code != 200:
                raise RuntimeError(f"Cartesia TTS {resp.status_code}: {(await resp.aread()).decode()}")
            async for chunk in resp.aiter_bytes():
                yield chunk


def clone_error_message(error: httpx.HTTPStatusError) -> str:
    """Return bounded provider diagnostics, never headers, raw bodies or audio."""
    response = error.response
    code = response.status_code
    guidance = {
        400: "Cartesia rejected the recording or clone settings.",
        401: "The backend Cartesia API key is invalid or expired.",
        402: "The Cartesia account needs credits or a plan that supports voice cloning. Check Billing in Cartesia; recording again will not fix this.",
        403: "The Cartesia key/account is not allowed to clone voices. Check the key's voice permissions and account plan; recording again will not fix this.",
        404: "Cartesia's cloning endpoint was unavailable for this API version.",
        413: "Cartesia rejected the recording size. Use a shorter clip.",
        415: "Cartesia could not read the audio format. Record a new sample in the app.",
        422: "Cartesia could not accept the recording or clone settings.",
        429: "Cartesia's usage or voice limit was reached. Check account limits before retrying.",
    }.get(code, "Cartesia could not create the voice. Try again later." if code >= 500 else "Cartesia rejected the voice setup request.")
    detail = ""
    try:
        data = response.json() if len(response.content) <= 16_384 else None
        if isinstance(data, dict):
            candidate = data.get("error") or data.get("message") or data.get("detail")
            if isinstance(candidate, dict):
                candidate = candidate.get("message") or candidate.get("detail")
            if isinstance(candidate, str):
                # Provider messages can include invalid values; remove secrets and encoded blobs.
                detail = re.sub(r"(?i)(?:sk_car_|sk_live_|sk_test_)[A-Za-z0-9_-]+", "[redacted]", candidate)
                detail = re.sub(r"(?i)bearer\s+\S+", "Bearer [redacted]", detail)
                detail = re.sub(r"[A-Za-z0-9+/=_-]{80,}", "[redacted data]", detail)
                detail = re.sub(r"(?i)(api[_ -]?key|token|authorization)\s*[:=]\s*[^\s,;]+", r"\1=[redacted]", detail)
                detail = " ".join(detail.split())[:350]
    except (ValueError, UnicodeError):
        pass
    return f"{guidance} (HTTP {code})" + (f" Cartesia: {detail}" if detail else "")


async def clone_voice(s: Settings, clip: Path, name: str) -> str:
    """Clone a voice from a short, clean recording; returns the new voice id."""
    return await clone_voice_bytes(s, clip.read_bytes(), name)


async def clone_voice_bytes(s: Settings, wav: bytes, name: str) -> str:
    """Send an in-memory WAV to Cartesia; the provider key stays in Python."""
    if not s.cartesia_api_key:
        raise RuntimeError("Cartesia is not configured on the local service.")
    async with _client(s, timeout=120) as http:
        # Clone uses the documented contract independently of legacy TTS settings.
        http.headers["Cartesia-Version"] = "2026-08-14"
        resp = await http.post("/voices/clone", data={"name": name, "language": "en", "access": "private"},
                               files={"clip": ("voice.wav", BytesIO(wav), "audio/wav")})
    resp.raise_for_status()
    voice_id = resp.json().get("id")
    if not isinstance(voice_id, str) or not voice_id:
        raise RuntimeError("Cartesia did not return a voice ID.")
    return voice_id


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
