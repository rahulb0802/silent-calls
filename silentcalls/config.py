"""Settings, read from the environment (and .env if present)."""

import json
import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

ROOT = Path(__file__).resolve().parent.parent
WEIGHTS_PATH = ROOT / "weights.json"


def _env(name: str, default: str = "") -> str:
    return os.getenv(name, default)


def _float(name: str, default: float) -> float:
    return float(os.getenv(name, default))


def _int(name: str, default: int) -> int:
    return int(os.getenv(name, default))


@dataclass(frozen=True)
class Weights:
    """Fitted by `python -m silentcalls.fit_weights`; defaults until then."""

    w_lip: float = 1.0
    w_jev: float = 1.0
    speak_threshold: float = 0.80  # combined prob of top guess needed to speak unconfirmed
    choose_threshold: float = 0.25  # below this we ask the user to repeat

    @classmethod
    def load(cls) -> "Weights":
        if WEIGHTS_PATH.exists():
            return cls(**json.loads(WEIGHTS_PATH.read_text()))
        return cls()


@dataclass(frozen=True)
class Settings:
    # API keys
    cartesia_api_key: str = _env("CARTESIA_API_KEY")
    typesafe_api_key: str = _env("TYPESAFE_API_KEY")  # Jev

    # Cartesia
    cartesia_version: str = _env("CARTESIA_VERSION", "2026-08-14")
    cartesia_voice_id: str = _env("CARTESIA_VOICE_ID")
    tts_model: str = _env("CARTESIA_TTS_MODEL", "sonic-3.6")
    stt_model: str = _env("CARTESIA_STT_MODEL", "ink-2")

    # Audio devices (substring of the device name, as listed by `python -m sounddevice`)
    # Mac: BlackHole 2ch = our voice into Zoom's mic; BlackHole 16ch = Zoom's speaker out.
    # Windows: "CABLE Input" for the mic; Stereo Mix (or a second cable) for call audio.
    virtual_mic_device: str = _env("VIRTUAL_MIC_DEVICE", "BlackHole 2ch")
    call_audio_device: str = _env("CALL_AUDIO_DEVICE", "BlackHole 16ch")
    output_sample_rate: int = _int("OUTPUT_SAMPLE_RATE", 48000)

    # Captions
    context_lines: int = _int("CONTEXT_LINES", 4)  # both speakers, interleaved
    silence_finalize_s: float = _float("SILENCE_FINALIZE_S", 0.7)
    silence_rms: float = _float("SILENCE_RMS", 0.01)

    # Decision layer
    jev_model: str = _env("JEV_MODEL", "jev-latest")
    jev_top_k: int = _int("JEV_TOP_K", 10)
    jev_timeout_s: float = _float("JEV_TIMEOUT_S", 0.5)
    claude_model: str = _env("CLAUDE_MODEL", "claude-opus-5-5")
    claude_top_k: int = _int("CLAUDE_TOP_K", 10)
    vocab: str = _env("VOCAB")  # comma-separated names the user often says (their own, contacts), for Jev/Claude

    # Voice output
    opener_text: str = _env(
        "OPENER_TEXT",
        "Hi, just so you know, I'm using a speech assistant, so there may be short pauses.",
    )

    # Local server for the UI / lip-reading client
    host: str = _env("HOST", "127.0.0.1")
    port: int = _int("PORT", 8765)


settings = Settings()
