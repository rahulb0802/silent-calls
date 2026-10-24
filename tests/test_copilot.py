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


def test_copilot_still_answers_when_the_calendar_fails():
    class Down(FakeData):
        async def calendar(self):
            raise ConnectionError("google down")

    client = FakeClient()
    client.requests.append({})  # answer straight away
    cp = Copilot(Settings(), emit=None, data=Down(), client=client)
    replies, steps = asyncio.run(cp.prepare("Other person: are you free?", []))
    assert replies and steps == [] and "unavailable" in client.requests[1]["messages"][0]["content"]


def test_copilot_starts_on_the_paused_partial_and_keeps_it_when_the_final_line_matches(monkeypatch):
    import silentcalls.copilot as cp_mod
    monkeypatch.setattr(cp_mod, "SPECULATE_AFTER_S", 0.01)
    events = []

    async def emit(e):
        events.append(e)

    async def run():
        client = FakeClient()
        cp = Copilot(Settings(), emit=emit, data=FakeData(), client=client)
        cp.on_partial("What's the order", "Other person: What's the order", [])
        cp.on_partial("What's the order number?", "Other person: What's the order number?", [])
        await asyncio.sleep(0.05)  # paused: replies are being prepared for the line so far
        assert cp._task is not None
        cp.on_line("What's the order number", "Other person: What's the order number", [])  # same words
        await cp._task
        first = len(client.requests)
        cp.on_line("Never mind, what's your address?", "Other person: Never mind, what's your address?", [])
        await cp._task
        return first, len(client.requests)

    first, total = asyncio.run(run())
    assert first == 2  # one speculative run (search + answer), not restarted by the matching final line
    assert total == 3  # a different final line starts again (FakeClient answers straight away after its first call)
    assert [e.for_line for e in events] == ["What's the order number?", "Never mind, what's your address?"]


def test_pipeline_passes_the_line_so_far_to_the_copilot():
    seen = []

    class Spy:
        def on_partial(self, text, context, names):
            seen.append((text, context))

    async def run():
        async def emit(e):
            pass
        p = Pipeline(Settings(), voice=None, emit=emit, use_jev=False, use_claude=False, copilot=Spy())
        p.transcript.add("me", "Hi")
        await p.on_caption_partial("Are you free")

    asyncio.run(run())
    assert seen == [("Are you free", "User: Hi\nOther person: Are you free")]


def test_first_names_from_attendees_and_senders():
    from silentcalls.google_data import first_names
    assert first_names(["Priya Shah", "priya.shah", "Team Figma", "Amazon.com", "Support", "Al", "Devansh R."]) == \
        ["priya", "figma", "amazon", "devansh"]


def test_names_from_calendar_email_and_claude_reach_the_lip_reader():
    events = []

    async def emit(e):
        events.append(e)

    class People(FakeData):
        async def people(self):
            return ["priya", "devansh"]

    class NamingClient(FakeClient):
        async def create(self, **req):
            self.requests.append(req)
            answer = {"replies": [{"text": "Yes, I sent it to Sarvajith.", "facts": []}], "names": ["Sarvajith"]}
            return NS(stop_reason="end_turn", content=[NS(type="text", text=json.dumps(answer))])

    async def run():
        cp = Copilot(Settings(), emit=emit, data=People(), client=NamingClient())
        p = Pipeline(Settings(), voice=None, emit=emit, use_jev=False, use_claude=False, copilot=cp)
        await p.load_people()
        await p.on_caption("did you send it to sarvajith")  # lowercase: the captions can't tell it's a name
        await cp._task
        await p.close()
        return p.call_names()

    names = asyncio.run(run())
    assert "sarvajith" in names and {"priya", "devansh"} <= set(names)
    assert [e for e in events if e.type == "names"][-1].names == names


def test_dictated_text_is_context_but_not_spoken():
    events = []

    async def emit(e):
        events.append(e)

    p = Pipeline(Settings(), voice=None, emit=emit, use_jev=False, use_claude=False)
    p.dictated("We finished the integrations.")
    assert "User: We finished the integrations." in p.transcript.render() and not events


def test_punctuation_is_used_only_when_every_word_is_kept():
    from silentcalls.punctuate import Punctuator

    class Fake:
        def __init__(self, out):
            self.messages = NS(create=self.create)
            self.out = out

        async def create(self, **req):
            return NS(stop_reason="end_turn", content=[NS(type="text", text=json.dumps({"text": self.out}))])

    text = "hi my name is rahul can you send me the claude file"
    good = asyncio.run(Punctuator(Fake("Hi, my name is Rahul. Can you send me the Claude file?")).punctuate(text))
    reworded = asyncio.run(Punctuator(Fake("Hi, I'm Rahul. Could you send me the Claude file?")).punctuate(text))
    assert good == "Hi, my name is Rahul. Can you send me the Claude file?" and reworded is None
