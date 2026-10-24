"""Stand-in for the lip-reading server: sends candidates to the local app and prints its events.

    python scripts/fake_lipreader.py "i'll call you back" "i'll fall you back" "all you back"
"""

import asyncio
import json
import sys
import uuid

import websockets


async def main(texts: list[str]) -> None:
    async with websockets.connect("ws://127.0.0.1:8765") as ws:
        msg = {
            "type": "candidates",
            "utterance_id": uuid.uuid4().hex[:8],
            "candidates": [{"text": t, "score": -1.0 - i} for i, t in enumerate(texts)],
            "model_ms": 950,
        }
        await ws.send(json.dumps(msg))
        try:
            while True:  # print events until the app goes quiet (Claude's repair can take a few seconds)
                print(await asyncio.wait_for(ws.recv(), timeout=15))
        except TimeoutError:
            pass


if __name__ == "__main__":
    asyncio.run(main(sys.argv[1:] or ["i'll call you back", "i'll fall you back", "all you back"]))
