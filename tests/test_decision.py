import asyncio

from silentcalls.captions import Transcript
from silentcalls.config import Settings, Weights
from silentcalls.decision import combine, dedupe, route, top_k
from silentcalls.pipeline import Pipeline
from silentcalls.protocol import Candidate, CandidatesMessage

W = Weights(w_lip=1.0, w_jev=1.0, speak_threshold=0.8, choose_threshold=0.25)


def cands(*pairs):
    return [Candidate(text=t, score=s) for t, s in pairs]


def test_jev_can_overturn_the_lip_reader():
    cs = cands(("i'll fall you back", -1.0), ("i'll call you back", -1.2))
    lip_only = combine(cs, None, W)
    assert lip_only.options[0].text == "i'll fall you back"
    with_jev = combine(cs, [0.05, 0.95], W)
    assert with_jev.options[0].text == "i'll call you back"
    assert abs(sum(o.prob for o in with_jev.options) - 1) < 1e-9


def test_routing_thresholds():
    assert route(0.9, W) == "speak"
    assert route(0.5, W) == "choose"
    assert route(0.1, W) == "repeat"


def test_dedupe_merges_case_and_punctuation():
    merged = dedupe(cands(("Hello there.", -1.0), ("hello there", -1.0), ("yellow chair", -3.0)))
    assert len(merged) == 2
    assert merged[0].score > -1.0  # log-sum-exp of the two


def test_top_k_sorts_and_limits():
    out = top_k(cands(("a", -5), ("b", -1), ("c", -3)), 2)
    assert [c.text for c in out] == ["b", "c"]


def test_transcript_keeps_last_lines():
    t = Transcript(2)
    t.add("them", "one")
    t.add("me", "two")
    t.add("them", "three")
    assert t.render() == "User: two\nOther person: three"


def test_pipeline_lip_only_speaks_confident_guess():
    events = []

    async def emit(e):
        events.append(e)

    async def run():
        p = Pipeline(Settings(), voice=None, emit=emit, use_jev=False, use_claude=False)
        p.w = W
        await p.handle(CandidatesMessage(utterance_id="u1", candidates=cands(("yes", 0.0), ("yet", -5.0))))
        await p.handle(CandidatesMessage(utterance_id="u2", candidates=cands(("a", -1.0), ("b", -1.0))))
        await p.close()
        return p

    p = asyncio.run(run())
    kinds = [(e.type, getattr(e, "route", None)) for e in events]
    assert kinds == [("decision", "speak"), ("spoken", None), ("decision", "choose")]
    assert "User: yes" in p.transcript.render()


def test_pipeline_names_from_vocab_and_captions():
    async def emit(e):
        pass

    p = Pipeline(Settings(vocab="Rahul, Nilesh"), voice=None, emit=emit, use_jev=False, use_claude=False)
    p.transcript.add("them", "Hey, it's Sarvajith. Did Priya send the deck?")
    names = p.names(p.transcript.render())
    assert names[:2] == ["rahul", "nilesh"] and {"sarvajith", "priya"} <= set(names)
    assert "other" not in names and "user" not in names


def test_jev_through_vercel_gateway():
    import json

    import httpx

    from silentcalls.decision import Jev

    seen = {}

    def handler(req: httpx.Request) -> httpx.Response:
        seen.update(url=str(req.url), auth=req.headers["authorization"], body=json.loads(req.content))
        return httpx.Response(200, json={"model": "typesafe-ai/jev", "answers": {"reply": {
            "type": "choice", "choice": "c1", "probabilities": {"c0": 0.2, "c1": 0.8}}}})

    s = Settings(ai_gateway_api_key="vck_test", jev_url="https://ai-gateway.vercel.sh/v1/evaluate",
                 jev_model="typesafe-ai/jev")
    jev = Jev(s)
    jev._http = httpx.AsyncClient(transport=httpx.MockTransport(handler),
                                  headers={"Authorization": f"Bearer {s.jev_api_key}"})
    probs = asyncio.run(jev.score("Other person: hi", cands(("hi server", 0.0), ("hi sarva", -1.0)), ["sarva"]))
    assert probs == [0.2, 0.8]
    assert seen["url"] == "https://ai-gateway.vercel.sh/v1/evaluate" and seen["auth"] == "Bearer vck_test"
    assert seen["body"]["model"] == "typesafe-ai/jev" and "sarva" in seen["body"]["state"]


def test_pipeline_no_auto_speak_and_app_vocab():
    events = []

    async def emit(e):
        events.append(e)

    async def run():
        p = Pipeline(Settings(), voice=None, emit=emit, use_jev=False, use_claude=False)
        p.w = W
        msg = CandidatesMessage(utterance_id="u1", candidates=cands(("yes", 0.0), ("yet", -5.0)),
                                vocab=["Sarvajith"], auto_speak=False)
        await p.handle(msg)
        await p.close()
        return p

    p = asyncio.run(run())
    assert [(e.type, getattr(e, "route", None)) for e in events] == [("decision", "speak")]  # ranked, not spoken
    assert "User: yes" not in p.transcript.render()


def test_captions_loopback_choice():
    from silentcalls.captions import CallCaptioner

    assert CallCaptioner(Settings(call_audio_device="loopback"), None)._use_loopback()
    assert CallCaptioner(Settings(call_audio_device="loopback:Realtek"), None)._use_loopback()


def test_pipeline_remembers_names_heard_and_announces_them():
    events = []

    async def emit(e):
        events.append(e)

    async def run():
        p = Pipeline(Settings(vocab="Rahul", context_lines=1), voice=None, emit=emit, use_jev=False, use_claude=False)
        await p.on_caption("Hey, it's Priya from the design team.")
        await p.on_caption("Anyway, how was the demo?")  # Priya's line has left the 1-line transcript
        await p.on_caption("Anyway, how was the demo?")
        return p

    p = asyncio.run(run())
    names = [e.names for e in events if e.type == "names"]
    assert names == [["rahul", "priya"]]  # announced once, when Priya was first heard
    assert p.call_names() == ["rahul", "priya"] and "priya" in p.names(p.transcript.render())
