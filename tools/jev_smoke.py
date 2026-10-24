"""Jev requests with a canned call, to check the key, the endpoint and the latency.

    python tools/jev_smoke.py -n 5              # uses AI_GATEWAY_API_KEY (Vercel) if set, else TYPESAFE_API_KEY
    python tools/jev_smoke.py -n 5 --timeout 10 # see the real latency even when it's over the 0.5 s budget

The first request also pays for the TLS handshake; the later ones reuse the connection, like a call does.
"""

import argparse
import asyncio
import dataclasses
import sys
import time
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from silentcalls.config import settings  # noqa: E402
from silentcalls.decision import Jev  # noqa: E402
from silentcalls.protocol import Candidate  # noqa: E402

CONTEXT = "Other person: Hey, it's Sarvajith. Can you hear me okay?"
CANDS = ["hi server jet yes i can", "hi sarvajith yes i can", "i served it yes i can", "hi so very yes i can"]


async def main(n: int, timeout: float | None) -> None:
    s = dataclasses.replace(settings, jev_timeout_s=timeout) if timeout else settings
    if not s.jev_api_key:
        raise SystemExit("set AI_GATEWAY_API_KEY (or TYPESAFE_API_KEY) in .env")
    via = "Vercel AI Gateway" if s.ai_gateway_api_key else "TypeSafe"
    print(f"{via}: POST {s.jev_url} model={s.jev_model} timeout={s.jev_timeout_s}s")
    jev = Jev(s)
    probs = None
    try:
        for i in range(n):
            t0 = time.perf_counter()
            try:
                probs = await jev.score(CONTEXT, [Candidate(text=t, score=0.0) for t in CANDS], ["sarvajith"])
                status = "ok"
            except httpx.TimeoutException:
                status = f"TIMEOUT (> {s.jev_timeout_s}s)"
            except httpx.HTTPStatusError as e:
                status = f"HTTP {e.response.status_code}: {e.response.text[:300]}"
            except Exception as e:  # bad payload shape, DNS, ...
                status = f"{type(e).__name__}: {e}"
            print(f"request {i + 1}: {(time.perf_counter() - t0) * 1000:.0f} ms  {status}")
        if probs:
            for t, p in sorted(zip(CANDS, probs), key=lambda x: -x[1]):
                print(f"  {p:.3f}  {t}")
    finally:
        await jev.close()


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("-n", type=int, default=1)
    p.add_argument("--timeout", type=float, help="seconds; default JEV_TIMEOUT_S (0.5)")
    a = p.parse_args()
    asyncio.run(main(a.n, a.timeout))
