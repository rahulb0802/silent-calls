"""Post-call coach with a fake Claude client; practice sentences in the user's server-side list."""

import asyncio
from types import SimpleNamespace as NS

from silentcalls.coach import Coach, call_text
from silentcalls.config import Settings
from silentcalls.pipeline import Pipeline
from silentcalls.protocol import Candidate, CandidatesMessage


class FakeClient:
    def __init__(self):
        self.requests = []
        self.beta = NS(messages=NS(create=self.create))

    async def create(self, **req):
        self.requests.append(req)
        if len(self.requests) == 1:
            return NS(stop_reason="tool_use", content=[
                NS(type="tool_use", id="a", name="propose_vocabulary", input={"word": "Devansh", "reason": "ask the bunch"}),
                NS(type="tool_use", id="b", name="propose_vocabulary", input={"word": "rahul", "reason": "dup"}),
                NS(type="tool_use", id="c", name="propose_practice_sentence",
                   input={"sentence": "I will ask Devansh", "reason": "missed"})])
        return NS(stop_reason="end_turn", content=[NS(type="text", text="Names were hard. Proposed Devansh.")])


def test_coach_collects_proposals_and_skips_known_words():
    client = FakeClient()
    ev = asyncio.run(Coach(Settings(), client=client).review(
        [("them", "Did Devansh send it?"), ("me", "I will ask Devansh")],
        [{"said": "I will ask Devansh", "options": ["i will ask the bunch"], "repair": "I will ask Devansh"}], ["rahul"]))
    assert [(p.kind, p.value) for p in ev.proposals] == [("vocabulary", "Devansh"), ("practice", "I will ask Devansh")]
    results = client.requests[1]["messages"][-1]["content"]
    assert [r.get("is_error", False) for r in results] == [False, True, False]  # rahul is already known
    assert ev.summary.startswith("Names were hard") and ev.moments == 1


def test_call_text_says_how_each_line_was_chosen():
    text = call_text([], [{"said": "Hi Priya, how are you?", "options": ["hi pray how are you", "hi priya how are you"], "repair": ""},
                          {"said": "Yes.", "options": ["yes"], "repair": ""}])
    assert "picked another option" in text and "picked the top option" in text


def test_pipeline_logs_moments_for_the_review():
    events = []

    async def emit(e):
        events.append(e)

    async def run():
        p = Pipeline(Settings(), voice=None, emit=emit, use_jev=False, use_claude=False, coach=Coach(Settings(), client=FakeClient()))
        await p.on_caption("Did Devansh send it?")
        await p.handle(CandidatesMessage(utterance_id="u1", auto_speak=False,
                                         candidates=[Candidate(text="i will ask the bunch", score=-1.0)]))
        await p.speak("I will ask Devansh")
        await p.speak("Thanks, bye")  # typed quick phrase: no options shown, not a moment
        ev = await p.review(["rahul"])
        return p, ev

    p, ev = asyncio.run(run())
    assert ev.moments == 1 and len(ev.proposals) == 2
    assert p._moments == [] and p._call == []  # cleared after the review


def test_practice_sentences_join_personal_prompts(tmp_path, monkeypatch):
    from server.lipread import vocab as vb

    monkeypatch.setattr(vb, "VOCAB_DIR", tmp_path)
    vb.save_user("Rahul", ["Devansh"], ["I will ask Devansh!", "ok"])
    assert vb.load_practice("Rahul") == ["i will ask devansh"]  # one-word sentences are dropped
    vb.save_user("Rahul", ["Devansh", "Priya"])  # practice omitted: kept
    sentences = [p["sentence"] for p in vb.personal_sentences("Rahul", vb.load_user("Rahul"), vb.load_practice("Rahul"))]
    assert sentences[:2] == ["hi my name is rahul", "i will ask devansh"] and len(sentences) == 4
