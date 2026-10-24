"""Co-pilot loop with a fake Claude client and fake calendar/inbox (no network)."""

import asyncio
import json
from types import SimpleNamespace as NS

from silentcalls.config import Settings
from silentcalls.copilot import Copilot
from silentcalls.pipeline import Pipeline


class FakeData:
    def __init__(self):
        self.queries = []

    async def calendar(self):
        return [{"title": "Design review", "start": "2026-10-27T13:00", "end": "2026-10-27T14:00", "location": ""}]

    async def search_mail(self, q):
        self.queries.append(q)
        return [{"from": "Amazon", "subject": "Return", "date": "Oct 20", "snippet": "order #112-48"}]


class FakeClient:
    """First reply: one search_email call. Second: the structured answer."""

    def __init__(self):
        self.requests = []
        self.beta = NS(messages=NS(create=self.create))

    async def create(self, **req):
        self.requests.append(req)
        if len(self.requests) == 1:
            return NS(stop_reason="tool_use", content=[NS(type="tool_use", id="t1", name="search_email",
                                                          input={"query": "order return"})])
        answer = {"replies": [{"text": "It's order 112-48.", "facts": [{"source": "email", "detail": "order #112-48"}]},
                              {"text": "Let me check and get back to you.", "facts": []}]}
        return NS(stop_reason="end_turn", content=[NS(type="text", text=json.dumps(answer))])


def test_copilot_searches_mail_then_answers_with_sources():
    data, client = FakeData(), FakeClient()
    cp = Copilot(Settings(), emit=None, data=data, client=client)
    replies, steps = asyncio.run(cp.prepare("Other person: What's the order number?", ["rahul"]))
    assert [r.text for r in replies] == ["It's order 112-48.", "Let me check and get back to you."]
    assert replies[0].facts[0].source == "email"
    assert [(s.tool, s.results) for s in steps] == [("calendar", 1), ("email", 1)]
    assert data.queries == ["order return"]
    first = client.requests[0]
    assert "Design review" in first["messages"][0]["content"] and first["tools"][0]["name"] == "search_email"
    assert client.requests[1]["messages"][-1]["content"][0]["tool_use_id"] == "t1"  # result paired with its call


def test_copilot_without_google_has_no_tools():
    client = FakeClient()
    client.requests.append({})  # skip the tool round: answer straight away
    cp = Copilot(Settings(), emit=None, data=None, client=client)
    replies, steps = asyncio.run(cp.prepare("Other person: hi", []))
    assert replies and steps == [] and client.requests[1]["tools"] == []


def test_pipeline_runs_copilot_on_each_line_and_clears_after_speaking():
    events = []

    async def emit(e):
        events.append(e)

    async def run():
        cp = Copilot(Settings(), emit=emit, data=FakeData(), client=FakeClient())
        p = Pipeline(Settings(), voice=None, emit=emit, use_jev=False, use_claude=False, copilot=cp)
        await p.on_caption("What's the order number?")
        await cp._task
        await p.speak("It's order 112-48.")
        await p.close()

    asyncio.run(run())
    copilot = [e for e in events if e.type == "copilot"]
    assert copilot[0].for_line == "What's the order number?" and len(copilot[0].replies) == 2
    assert copilot[-1].replies == []  # cleared once the user spoke
