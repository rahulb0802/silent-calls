"""Check every piece Silent Calls needs, before a call or a demo. Prints ✔ / ✘ / – with how to fix each.

    python tools/check_setup.py          # local checks + GPU reachability (no paid API calls)
    python tools/check_setup.py --live   # also one tiny request each to Jev, Claude and Cartesia

Never prints keys, calendar or email contents: only whether things are present and reachable.
"""

import argparse
import json
import os
import socket
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
HOME = Path.home() / ".silentcalls"
OK, BAD, SKIP = "✔", "✘", "–"
results: list[tuple[str, str, str, bool]] = []  # (mark, name, detail, required)


def report(mark: str, name: str, detail: str = "", required: bool = True) -> None:
    results.append((mark, name, detail, required))
    print(f" {mark} {name}" + (f": {detail}" if detail else ""), flush=True)


def gpu_health(port: int = 8000) -> dict | None:
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{port}/health", timeout=3) as r:
            return json.loads(r.read())
    except Exception:
        return None


def check_env() -> None:
    try:
        from dotenv import load_dotenv
    except ImportError:
        report(BAD, "Python packages", "run: pip install -r requirements.txt (in .venv)")
        return
    load_dotenv(ROOT / ".env")
    if not (ROOT / ".env").exists():
        report(BAD, ".env", "copy .env.example to .env and fill in your keys")
    for key, why, required in [("CARTESIA_API_KEY", "voice + captions", True),
                               ("ANTHROPIC_API_KEY", "Claude repair + co-pilot", False)]:
        report(OK if os.getenv(key) else BAD, key, "set" if os.getenv(key) else f"missing ({why})", required)
    jev = os.getenv("AI_GATEWAY_API_KEY") or os.getenv("TYPESAFE_API_KEY")
    report(OK if jev else BAD, "Jev key", ("AI_GATEWAY_API_KEY" if os.getenv("AI_GATEWAY_API_KEY") else "TYPESAFE_API_KEY")
           if jev else "missing: set TYPESAFE_API_KEY (ranking falls back to lip scores)", False)


def check_python() -> None:
    try:
        import silentcalls.app  # noqa: F401
        report(OK, "Local service imports")
    except Exception as e:
        report(BAD, "Local service imports", f"{type(e).__name__}: {e} (pip install -r requirements.txt)")


def check_audio() -> None:
    try:
        from silentcalls.audio import find_device
        from silentcalls.config import settings
    except Exception:
        return
    try:
        find_device(settings.virtual_mic_device, "output")
        report(OK, "Virtual microphone", settings.virtual_mic_device)
    except Exception:
        report(BAD, "Virtual microphone", f"no output device matching {settings.virtual_mic_device!r}: install VB-CABLE "
               "(Windows) or BlackHole 2ch (Mac) and set VIRTUAL_MIC_DEVICE")
    if sys.platform == "win32":
        try:
            from silentcalls.captions import loopback_speaker

            _, name = loopback_speaker("loopback")
            report(OK, "Call audio for captions", f"loopback of {name}", False)
            import soundcard as sc

            if "cable" in sc.default_speaker().name.lower():
                report(BAD, "Windows default speaker", "is a VB-CABLE: the call would play into your mic. "
                       "Set it back to your real speakers (Sound settings → Output)", False)
        except Exception as e:
            report(BAD, "Call audio for captions", f"{type(e).__name__} (pip install soundcard)", False)


def check_voice() -> None:
    profile = HOME / "voice-profile.json"
    if profile.exists() or os.getenv("CARTESIA_VOICE_ID"):
        report(OK, "Cloned voice", "saved profile" if profile.exists() else "CARTESIA_VOICE_ID")
    else:
        report(BAD, "Cloned voice", "record your voice in the app's onboarding (or set CARTESIA_VOICE_ID)", False)
    token = HOME / "google_token.json"
    report(OK if token.exists() else SKIP, "Google Calendar + Gmail (co-pilot)",
           "signed in" if token.exists() else "not connected: optional, see docs/COPILOT.md", False)


def check_gpu() -> None:
    key = Path(os.getenv("SILENT_SSH_KEY") or Path.home() / ".ssh" / "vultr_lipread")
    host = os.getenv("SILENT_SSH_HOST") or "144.202.96.192"
    user = os.getenv("SILENT_SSH_USER") or "root"
    health = gpu_health()
    if health and health.get("ok"):
        report(OK, "GPU lip-reader", f"reachable through a tunnel on port 8000 ({health.get('device')})")
        return
    if not key.exists():
        report(BAD, "SSH key", f"not found at {key}: set SILENT_SSH_KEY")
        return
    report(OK, "SSH key", str(key))
    try:
        t0 = time.perf_counter()
        out = subprocess.run(["ssh", "-i", str(key), "-o", "BatchMode=yes", "-o", "ConnectTimeout=8",
                              f"{user}@{host}", "curl -s -m 3 localhost:8000/health"],
                             capture_output=True, text=True, timeout=20)
        ok = '"ok":true' in out.stdout
        report(OK if ok else BAD, "GPU lip-reader",
               f"server healthy ({(time.perf_counter() - t0) * 1000:.0f} ms over SSH); the app opens the tunnel itself"
               if ok else f"not healthy: {(out.stderr or out.stdout).strip()[:200] or 'check systemctl status lipread'}")
    except Exception as e:
        report(BAD, "GPU lip-reader", f"ssh failed: {type(e).__name__}")


def check_client() -> None:
    client = ROOT / "client"
    report(OK if (client / "node_modules").exists() else BAD, "App packages",
           "installed" if (client / "node_modules").exists() else "run: cd client && npm ci")
    electron = client / "node_modules" / "electron" / "path.txt"
    report(OK if electron.exists() else BAD, "Electron", "installed" if electron.exists()
           else "run: cd client && node node_modules/electron/install.js")
    with socket.socket() as s:
        s.settimeout(0.5)
        running = s.connect_ex(("127.0.0.1", 8765)) == 0
    report(OK if running else SKIP, "Local service", "running on port 8765" if running
           else "not running: the app starts it when you connect voice", False)


def check_live() -> None:
    import asyncio

    from silentcalls.config import settings

    async def jev() -> str:
        from silentcalls.decision import Jev
        from silentcalls.protocol import Candidate

        j = Jev(settings)
        try:
            t0 = time.perf_counter()
            await j.score("Other person: Can you hear me?", [Candidate(text="yes i can", score=0.0),
                                                              Candidate(text="yes i can't", score=0.0)])
            return f"{(time.perf_counter() - t0) * 1000:.0f} ms"
        finally:
            await j.close()

    async def claude() -> str:
        import anthropic

        t0 = time.perf_counter()
        await anthropic.AsyncAnthropic().messages.create(model=settings.claude_model, max_tokens=64,
                                                         output_config={"effort": "low"},
                                                         messages=[{"role": "user", "content": "Reply with: ok"}])
        return f"{(time.perf_counter() - t0) * 1000:.0f} ms"

    async def cartesia() -> str:
        import httpx

        async with httpx.AsyncClient(base_url="https://api.cartesia.ai", timeout=10, headers={
                "Authorization": f"Bearer {settings.cartesia_api_key}", "Cartesia-Version": settings.cartesia_version}) as c:
            r = await c.get("/voices", params={"limit": 1})
            r.raise_for_status()
            return "key accepted"

    for name, fn, required in [("Jev", jev, False), ("Claude", claude, False), ("Cartesia", cartesia, True)]:
        try:
            report(OK, f"{name} (live)", asyncio.run(fn()), required)
        except Exception as e:
            report(BAD, f"{name} (live)", f"{type(e).__name__}: {str(e)[:160]}", required)


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--live", action="store_true", help="also make one tiny request each to Jev, Claude, Cartesia")
    args = p.parse_args()
    if sys.stdout.encoding and sys.stdout.encoding.lower() not in ("utf-8", "utf8"):
        sys.stdout.reconfigure(encoding="utf-8")
    print("Silent Calls setup check")
    check_env()
    check_python()
    check_audio()
    check_voice()
    check_client()
    check_gpu()
    if args.live:
        check_live()
    failed = [r for r in results if r[0] == BAD and r[3]]
    print(f"\n{'Ready.' if not failed else f'{len(failed)} required item(s) to fix: ' + ', '.join(r[1] for r in failed)}")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
