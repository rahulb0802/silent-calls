"""The call co-pilot: after each line the other person says, prepare the replies the user would likely give.

The user still mouths what they want to say. The co-pilot's replies are sent to the lip-reader with the next
capture and scored against the video alongside the model's own guesses (server/lipread/model.py,
score_texts), so mouthing picks the reply and the co-pilot supplies what lips can't carry: times, dates,
order numbers, names. Nothing is spoken without the user's pick.

Claude Opus 5.5 at low effort, with read-only tools: the user's calendar for the next week (in the prompt) and
a Gmail search tool (snippets only). Each reply lists the facts it used and where they came from, so the app
can show its work.
"""

import asyncio
import datetime as dt
import json
import logging
import time
from collections.abc import Awaitable, Callable

import anthropic

from .config import Settings
from .protocol import CopilotEvent, CopilotFact, CopilotReply, CopilotStep

log = logging.getLogger(__name__)

MAX_REPLIES = 4
MAX_ROUNDS = 3  # model turns: at most two rounds of mail searches, then the answer
# Replies must be ready before the user finishes mouthing, so ask for fast output (Opus 5.5 fast mode).
FAST, FAST_BETA = {"speed": "fast"}, ["fast-mode-2026-02-01"]

SYSTEM = """\
You help someone on a live phone or video call who cannot speak aloud. They silently mouth their reply to a \
camera; a lip-reading model reads it and a cloned voice speaks it. Right after the other person says something, \
you prepare the replies the user is most likely to want to give, so the lip-reader can match their mouthing \
against them.

Write up to 4 short replies (at most 15 words each), in the user's own voice, first person, natural spoken \
English: what they would actually say next. Cover the different directions a reply could take (e.g. yes / no / \
not sure, or different times), most likely first.

Use the user's calendar and email when the conversation calls for a fact the user would know: when they are \
free, a meeting time, an order or confirmation number, an address, a date. Use only facts that appear in the \
calendar or in a search result; never invent one. If a fact is needed but you can't find it, offer a reply that \
says so honestly (e.g. "Let me check and get back to you"). For every fact used, list its source and the exact \
detail (e.g. calendar: "Design review, Tue 2:00-3:00pm").

Search email only when the conversation clearly needs something from it; use Gmail search syntax and keep it \
narrow. Never put private details in a reply unless the other person asked for them."""

SEARCH_TOOL = {
    "name": "search_email",
    "description": ("Search the user's Gmail (read-only). Returns up to 5 recent matching messages as "
                    "{from, subject, date, snippet}. Use Gmail search syntax, e.g. 'from:amazon order', "
                    "'subject:confirmation newer_than:30d'."),
    "strict": True,
    "input_schema": {"type": "object", "properties": {"query": {"type": "string"}},
                     "required": ["query"], "additionalProperties": False},
}

REPLIES_SCHEMA = {
    "type": "object",
    "properties": {
        "replies": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "text": {"type": "string"},
                    "facts": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "source": {"type": "string", "enum": ["calendar", "email", "vocabulary", "conversation"]},
                                "detail": {"type": "string"},
                            },
                            "required": ["source", "detail"],
                            "additionalProperties": False,
                        },
                    },
                },
                "required": ["text", "facts"],
                "additionalProperties": False,
            },
        },
    },
    "required": ["replies"],
    "additionalProperties": False,
}


def calendar_text(events: list[dict]) -> str:
    if not events:
        return "(nothing on the calendar in the next 7 days)"
    return "\n".join(f"- {e['title']}: {e['start']} to {e['end']}" + (f" at {e['location']}" if e["location"] else "")
                     for e in events)


class Copilot:
    """Prepares replies after each line from the other person; the latest line wins (older work is cancelled)."""

    def __init__(self, s: Settings, emit: Callable[[CopilotEvent], Awaitable[None]], data=None, client=None):
        self.s = s
        self.emit = emit
        self.data = data  # GoogleData, or anything with async calendar() / search_mail(query); None = no Google
        self.client = client or anthropic.AsyncAnthropic()
        self._task: asyncio.Task | None = None
        self._fast = True
        self.last: CopilotEvent | None = None

    def on_line(self, line: str, context: str, names: list[str]) -> None:
        if self._task and not self._task.done():
            self._task.cancel()
        self._task = asyncio.create_task(self._run(line, context, names))

    async def clear(self) -> None:
        """The user spoke: the prepared replies are used up."""
        if self._task and not self._task.done():
            self._task.cancel()
        self.last = CopilotEvent(replies=[], for_line="", latency_ms=0)
        await self.emit(self.last)

    async def close(self) -> None:
        if self._task and not self._task.done():
            self._task.cancel()
            await asyncio.gather(self._task, return_exceptions=True)

    async def _run(self, line: str, context: str, names: list[str]) -> None:
        t0 = time.perf_counter()
        try:
            replies, steps = await self.prepare(context, names)
        except asyncio.CancelledError:
            raise
        except Exception as e:  # network, API, Google; the call goes on without suggestions
            log.warning("copilot: %s", type(e).__name__)
            return
        self.last = CopilotEvent(replies=replies, for_line=line, steps=steps,
                                 latency_ms=round((time.perf_counter() - t0) * 1000))
        log.info("copilot: %d replies in %d ms, %d lookups", len(replies), self.last.latency_ms, len(steps))
        await self.emit(self.last)

    async def _create(self, tools: list, messages: list):
        request = dict(model=self.s.claude_model, max_tokens=4096, fallbacks="default", system=SYSTEM, tools=tools,
                       output_config={"effort": "low", "format": {"type": "json_schema", "schema": REPLIES_SCHEMA}},
                       messages=messages)
        if self._fast:
            try:
                return await self.client.beta.messages.create(
                    **request, **FAST, betas=["server-side-fallback-2026-07-01", *FAST_BETA])
            except anthropic.RateLimitError:  # fast mode has its own rate limit: carry on at standard speed
                log.info("copilot: fast mode rate-limited, using standard speed")
                self._fast = False
        return await self.client.beta.messages.create(**request, betas=["server-side-fallback-2026-07-01"])

    async def prepare(self, context: str, names: list[str]) -> tuple[list[CopilotReply], list[CopilotStep]]:
        steps: list[CopilotStep] = []
        parts = [f"Now: {dt.datetime.now().astimezone():%A %Y-%m-%d %H:%M %Z}"]
        if self.data is not None:
            events = await self.data.calendar()
            steps.append(CopilotStep(tool="calendar", query="next 7 days", results=len(events)))
            parts.append(f"The user's calendar (next 7 days):\n{calendar_text(events)}")
        else:
            parts.append("(The user's calendar and email are not connected.)")
        if names:
            parts.append("Names and words the user uses: " + ", ".join(names))
        parts.append(f"The call so far (most recent last):\n{context}\n\nPrepare the user's likely replies.")
        messages: list = [{"role": "user", "content": "\n\n".join(parts)}]
        tools = [SEARCH_TOOL] if self.data is not None else []

        for _ in range(MAX_ROUNDS):
            resp = await self._create(tools, messages)
            if resp.stop_reason == "tool_use":
                messages.append({"role": "assistant", "content": resp.content})
                results = []
                for block in resp.content:
                    if block.type != "tool_use":
                        continue
                    query = str(block.input.get("query", "")) if isinstance(block.input, dict) else ""
                    try:
                        found = await self.data.search_mail(query)
                        content, error = json.dumps(found), False
                    except Exception as e:
                        found, content, error = [], f"search failed: {type(e).__name__}", True
                    steps.append(CopilotStep(tool="email", query=query[:200], results=len(found)))
                    results.append({"type": "tool_result", "tool_use_id": block.id, "content": content,
                                    "is_error": error})
                messages.append({"role": "user", "content": results})
                continue
            if resp.stop_reason != "end_turn":  # refusal, max_tokens, ...
                log.warning("copilot: stop_reason=%s", resp.stop_reason)
                return [], steps
            text = next((b.text for b in resp.content if b.type == "text"), "")
            data = json.loads(text)
            replies = [CopilotReply(text=r["text"].strip()[:200],
                                    facts=[CopilotFact(source=f["source"], detail=f["detail"][:200]) for f in r["facts"]])
                       for r in data["replies"] if r["text"].strip()]
            return replies[:MAX_REPLIES], steps
        return [], steps
