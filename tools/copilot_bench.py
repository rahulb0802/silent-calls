"""Compare Claude models for the call co-pilot on scripted calls (fake calendar and inbox, real API).

Each scenario is a call so far, plus a check on the replies: `want` must match at least one reply (the right
fact or direction), and `never` must match none (an invented fact). Reports, per model: how often the right
reply is in the list and first, invented facts, email searches when one was / wasn't needed, latency, cost.

    python tools/copilot_bench.py --reps 3 --out results/copilot_models
"""

import argparse
import asyncio
import datetime as dt
import json
import re
import statistics
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import anthropic  # noqa: E402

from silentcalls.config import Settings  # noqa: E402
from silentcalls.copilot import FAST, Copilot  # noqa: E402

# $ per million tokens (input, output), from the Claude API model docs
CONFIGS = {
    "opus-5.5-fast": dict(model="claude-opus-5-5", fast=True, fallbacks=True, price=(8, 40)),
    "opus-5.5": dict(model="claude-opus-5-5", fast=False, fallbacks=True, price=(4, 20)),
    "sonnet-5.5": dict(model="claude-sonnet-5-5", fast=False, fallbacks=True, price=(2, 10)),
    "haiku-5.5": dict(model="claude-haiku-5-5", fast=False, fallbacks=False, price=(0.10, 0.50)),  # no fallbacks
}


def day(weekday: int, hour: int, minute: int = 0) -> str:
    """The next given weekday (0 = Monday) after today, at a time, as Google Calendar's dateTime."""
    now = dt.datetime.now().astimezone()
    ahead = (weekday - now.weekday()) % 7 or 7
    t = (now + dt.timedelta(days=ahead)).replace(hour=hour, minute=minute, second=0, microsecond=0)
    return t.isoformat()


CALENDAR = [
    {"title": "Sync with Priya", "start": day(0, 16), "end": day(0, 16, 30), "location": ""},
    {"title": "Design review", "start": day(1, 14), "end": day(1, 15), "location": ""},
    {"title": "Dentist", "start": day(2, 11), "end": day(2, 12), "location": "Smile Dental, 220 Valencia St"},
    {"title": "Quarterly planning", "start": day(3, 10), "end": day(3, 12), "location": "Room 4B, 500 Howard St"},
    {"title": "Flight to Seattle (UA 1532)", "start": day(4, 18, 5), "end": day(4, 20, 20), "location": "SFO"},
]

INBOX = [
    {"from": "Amazon.com", "subject": "Your order of Logitech C920 webcam has shipped", "date": "Oct 20",
     "snippet": "Order #112-4839201-7733105. Arriving Tuesday. Track your package"},
    {"from": "United Airlines", "subject": "Confirmation for your trip to Seattle", "date": "Oct 18",
     "snippet": "Confirmation number: K7XQ2M. UA 1532 SFO to SEA, Friday 6:05 PM"},
    {"from": "Marriott", "subject": "Reservation confirmed: Seattle Marriott Waterfront", "date": "Oct 18",
     "snippet": "2100 Alaskan Way, Seattle WA 98121. Check-in Friday, check-out Sunday. Confirmation 88213904"},
    {"from": "Devansh Rao", "subject": "Figma mockups v2", "date": "Oct 23",
     "snippet": "Here's the updated Figma file with the onboarding screens, let me know what you think"},
    {"from": "Mission Bay Apartments", "subject": "Lease renewal", "date": "Oct 2",
     "snippet": "Your current lease ends December 31. Please let us know by November 15 if you plan to renew"},
    {"from": "Newsletter", "subject": "This week in design", "date": "Oct 22", "snippet": "Ten tools we love"},
]

OPERATORS = re.compile(r"^(from|to|subject|newer_than|older_than|after|before|in|is|label|has):", re.I)


class FakeData:
    def __init__(self):
        self.queries: list[str] = []

    async def calendar(self):
        return CALENDAR

    async def search_mail(self, query: str):
        """Gmail-ish: a message matches if any query word (operator values included) is in it."""
        self.queries.append(query)
        words = [OPERATORS.sub("", w).strip('"()').lower() for w in query.split()]
        words = [w for w in words if len(w) > 2 and w not in {"and", "the", "or"}]
        hits = [m for m in INBOX if any(w in json.dumps(m).lower() for w in words)]
        return hits[:5]


# (name, conversation, want, never, needs_email)
SCENARIOS = [
    ("free_tuesday", "Other person: Are you free Tuesday afternoon to go over the budget?",
     r"\b(3|three|after 3|15:00)\b|\bbusy (from )?(2|two)\b|design review", None, False),
    ("order_number", "Other person: Thanks for calling support. Can I get your order number for the webcam?",
     r"112-?4839201-?7733105", r"\b(?!112-?4839201)\d{3}-\d{7}-\d{7}\b", True),
    ("meeting_where", "Other person: Where's the quarterly planning meeting on Thursday?",
     r"4B|500 Howard", None, False),
    ("flight_code", "Other person: I can help with your seat change. What's your confirmation code?",
     r"K7XQ2M", r"\b(?!K7XQ2M)[A-Z0-9]{6}\b", True),
    ("hotel_address", "Other person: I'll send a car. What's the address of the hotel you booked in Seattle?",
     r"2100 Alaskan", None, True),
    ("figma_file", "Other person: Hey, did Devansh send you the new Figma file?",
     r"\b(yes|yeah|yep|got it|did|he sent)\b", None, True),
    ("lease_end", "Other person: For the moving quote, when does your current lease end?",
     r"December 31|Dec(ember)? 31(st)?|end of December", r"\b(January|February|November 30|June|July)\b", True),
    ("move_call_conflict", "Other person: Could we move our call to Wednesday at 11?",
     r"\b(dentist|busy|can't|cannot|not free|conflict|have (something|an appointment)|another time|after 12|noon)\b",
     None, False),
    ("priya_sync", "Other person: Are we still on for the four o'clock sync with Priya on Monday?",
     r"\b(yes|yep|yeah|still on|see you|i'll be there)\b", None, False),
    ("unknown_card", "Other person: Before we continue, can you read me your library card number?",
     r"check|look|get back|don't have|find|grab", r"\d{5,}", False),
    ("how_are_you", "Other person: Hi! How are you doing today?",
     r"\b(good|well|great|fine|not bad|doing)\b", None, False),
    ("followup_time", "Other person: So about the budget review.\nUser: Sure, what time works?\n"
     "Other person: Does Friday at 5 work for you?",
     r"\b(flight|flying|seattle|airport|before|earlier|can't|cannot|leave|leaving|busy|tight)\b", None, False),
]


class BenchCopilot(Copilot):
    def __init__(self, s, cfg, data):
        super().__init__(s, emit=None, data=data)
        self.cfg = cfg
        self.usage = [0, 0]
        self.calls = 0

    async def _create(self, tools, messages):
        request = dict(model=self.cfg["model"], max_tokens=4096, system=self.SYSTEM_TEXT, tools=tools,
                       output_config={"effort": "low", "format": {"type": "json_schema",
                                                                  "schema": self.SCHEMA}},
                       messages=messages)
        betas = []
        if self.cfg["fallbacks"]:
            request["fallbacks"] = "default"
            betas.append("server-side-fallback-2026-07-01")
        if self.cfg["fast"]:
            request.update(FAST)
            betas.append("fast-mode-2026-02-01")
        resp = await self.client.beta.messages.create(**request, betas=betas)
        self.usage[0] += resp.usage.input_tokens + (resp.usage.cache_read_input_tokens or 0)
        self.usage[1] += resp.usage.output_tokens
        self.calls += 1
        return resp


async def run_one(s, name, cfg, scen):
    from silentcalls import copilot as cp
    BenchCopilot.SYSTEM_TEXT, BenchCopilot.SCHEMA = cp.SYSTEM, cp.REPLIES_SCHEMA
    sid, context, want, never, needs_email = scen
    data = FakeData()
    bot = BenchCopilot(s, cfg, data)
    t0 = time.perf_counter()
    try:
        replies, _ = await bot.prepare(context, ["Priya", "Devansh"])
        error = None
    except anthropic.APIError as e:
        replies, error = [], f"{type(e).__name__}: {str(e)[:200]}"
    except Exception as e:  # bad JSON etc.
        replies, error = [], f"{type(e).__name__}: {str(e)[:200]}"
    ms = round((time.perf_counter() - t0) * 1000)
    texts = [r.text for r in replies]
    hit = [bool(re.search(want, t, re.I)) for t in texts]
    invented = bool(never) and any(re.search(never, t) for t in texts)
    cost = (bot.usage[0] * cfg["price"][0] + bot.usage[1] * cfg["price"][1]) / 1e6
    return {"config": name, "scenario": sid, "ms": ms, "replies": texts, "any": any(hit),
            "top": bool(hit and hit[0]), "invented": invented, "searched": bool(data.queries),
            "needs_email": needs_email, "queries": data.queries, "calls": bot.calls,
            "in_tokens": bot.usage[0], "out_tokens": bot.usage[1], "cost": cost, "error": error,
            "too_long": any(len(t.split()) > 15 for t in texts)}


def summarize(rows):
    out = {}
    for name in CONFIGS:
        rs = [r for r in rows if r["config"] == name]
        if not rs:
            continue
        ok = [r for r in rs if not r["error"]]
        ms = sorted(r["ms"] for r in ok)
        email = [r for r in rs if r["needs_email"]]
        no_email = [r for r in rs if not r["needs_email"]]
        out[name] = {
            "runs": len(rs), "errors": len(rs) - len(ok),
            "right_in_list": sum(r["any"] for r in rs) / len(rs),
            "right_first": sum(r["top"] for r in rs) / len(rs),
            "invented_fact": sum(r["invented"] for r in rs),
            "searched_when_needed": sum(r["searched"] for r in email) / max(1, len(email)),
            "searched_when_not": sum(r["searched"] for r in no_email) / max(1, len(no_email)),
            "too_long_replies": sum(r["too_long"] for r in rs),
            "ms_median": statistics.median(ms) if ms else None,
            "ms_p90": ms[min(len(ms) - 1, int(0.9 * len(ms)))] if ms else None,
            "ms_median_no_search": statistics.median([r["ms"] for r in ok if not r["searched"]] or [0]),
            "ms_median_search": statistics.median([r["ms"] for r in ok if r["searched"]] or [0]),
            "cost_per_line": sum(r["cost"] for r in rs) / len(rs),
        }
    return out


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--reps", type=int, default=3)
    ap.add_argument("--configs", default=",".join(CONFIGS))
    ap.add_argument("--out", default="results/copilot_models")
    args = ap.parse_args()
    s = Settings()
    names = args.configs.split(",")
    rows = []
    for rep in range(args.reps):
        for scen in SCENARIOS:
            for name in names:  # interleaved, so network drift hits every model alike
                r = await run_one(s, name, CONFIGS[name], scen)
                r["rep"] = rep
                rows.append(r)
                print(f"{rep} {scen[0]:20s} {name:14s} {r['ms']:6d} ms  any={r['any']:d} top={r['top']:d}"
                      f" inv={r['invented']:d} search={r['searched']:d}" + (f"  ERR {r['error']}" if r["error"] else ""),
                      flush=True)
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    (out / "runs.jsonl").write_text("\n".join(json.dumps(r) for r in rows) + "\n", encoding="utf-8")
    summary = summarize(rows)
    (out / "summary.json").write_text(json.dumps(summary, indent=1), encoding="utf-8")
    print(json.dumps(summary, indent=1))


if __name__ == "__main__":
    asyncio.run(main())
