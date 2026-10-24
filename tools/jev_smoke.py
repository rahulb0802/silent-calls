"""One Jev request with a canned call, to check the key, the endpoint and the latency.

    python tools/jev_smoke.py            # uses AI_GATEWAY_API_KEY (Vercel) if set, else TYPESAFE_API_KEY
    python tools/jev_smoke.py -n 5       # 5 requests, prints each latency
"""

import argparse
import asyncio
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from silentcalls.config import settings  # noqa: E402
from silentcalls.decision import Jev  # noqa: E402
from silentcalls.protocol import Candidate  # noqa: E402

CONTEXT = "Other person: Hey, it's Sarvajith. Can you hear me okay?"
CANDS = ["hi server jet yes i can", "hi sarvajith yes i can", "i served it yes i can", "hi so very yes i can"]


async def main(n: int) -> None:
    if not settings.jev_api_key:
        raise SystemExit("set AI_GATEWAY_API_KEY (or TYPESAFE_API_KEY) in .env")
    via = "Vercel AI Gateway" if settings.ai_gateway_api_key else "TypeSafe"
    print(f"{via}: POST {settings.jev_url} model={settings.jev_model} timeout={settings.jev_timeout_s}s")
    jev = Jev(settings)
    try:
        for _ in range(n):
            t0 = time.perf_counter()
            probs = await jev.score(CONTEXT, [Candidate(text=t, score=0.0) for t in CANDS], ["sarvajith"])
            print(f"{(time.perf_counter() - t0) * 1000:.0f} ms")
        for t, p in sorted(zip(CANDS, probs), key=lambda x: -x[1]):
            print(f"  {p:.3f}  {t}")
    finally:
        await jev.close()


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("-n", type=int, default=1)
    asyncio.run(main(p.parse_args().n))
