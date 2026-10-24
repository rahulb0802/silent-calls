"""Messages shared between the components. PROPOSAL - agree these Friday night.

Lip-reading server (GPU, Person 1), per utterance:
  client -> server  {"type": "start", "utterance_id": "u1"}
  client -> server  binary frames (JPEG bytes, one per webcam frame, while the key is held)
  client -> server  {"type": "end", "utterance_id": "u1"}
  server -> client  CandidatesMessage (below)

Desktop app <-> this process (ws://127.0.0.1:8765, see app.py):
  in:  CandidatesMessage                         forward the lip-reader's output here (optional vocab, auto_speak)
  in:  {"type": "confirm", "utterance_id", "text"}   user picked an option -> speak it
  in:  {"type": "say", "text"}                   speak arbitrary text (typed fallback)
  in:  {"type": "opener"}                        play the "speech assistant" opener
  out: DecisionEvent, RepairEvent, CaptionEvent, SpokenEvent, NamesEvent (on connect and when a new name is heard),
       CopilotEvent (prepared replies after each line from the other person; see copilot.py),
       ReviewEvent (after {"type": "review", "vocab": [...]}: the post-call coach's proposals; see coach.py)
"""

from typing import Literal

from pydantic import BaseModel, Field


class Candidate(BaseModel):
    text: str
    score: float  # lip-reader beam log-prob; higher is better


class CandidatesMessage(BaseModel):
    type: Literal["candidates"] = "candidates"
    utterance_id: str
    candidates: list[Candidate]  # best first, up to the beam size (40)
    model_ms: float | None = None  # crop + model time on the GPU, for latency logging
    vocab: list[str] = Field(default_factory=list, max_length=200)  # names the user may say (app's word list)
    auto_speak: bool = True  # False: never speak on route "speak"; the app waits for the user's pick


class Option(BaseModel):
    text: str
    prob: float  # combined lip-reading + Jev probability
    p_lip: float
    p_jev: float | None = None


class DecisionEvent(BaseModel):
    type: Literal["decision"] = "decision"
    utterance_id: str
    route: Literal["speak", "choose", "repeat"]
    options: list[Option]  # top 3
    timings_ms: dict[str, float] = Field(default_factory=dict)


class RepairEvent(BaseModel):
    """Claude's suggested fix; only ever shown as an extra option, never auto-spoken."""

    type: Literal["repair"] = "repair"
    utterance_id: str
    text: str
    latency_ms: float


class CaptionEvent(BaseModel):
    type: Literal["caption"] = "caption"
    speaker: Literal["them", "me"]
    text: str
    final: bool = True  # False: the line so far, still being spoken (display only; replaced by the next one)


class NamesEvent(BaseModel):
    """Names likely in this call (VOCAB + names heard so far), so the app can send them to the lip-reader too."""

    type: Literal["names"] = "names"
    names: list[str]


class CopilotFact(BaseModel):
    source: Literal["calendar", "email", "vocabulary", "conversation"]
    detail: str  # e.g. "Design review, Tue 2:00-3:00pm"


class CopilotReply(BaseModel):
    text: str
    facts: list[CopilotFact] = Field(default_factory=list)


class CopilotStep(BaseModel):
    tool: str  # "calendar" | "email"
    query: str
    results: int


class CopilotEvent(BaseModel):
    """Replies the call co-pilot prepared after the other person's latest line; the app sends them to the
    lip-reader with the next capture (`given`), never speaks them by itself. Empty replies clear the list."""

    type: Literal["copilot"] = "copilot"
    replies: list[CopilotReply]
    for_line: str
    latency_ms: int
    steps: list[CopilotStep] = Field(default_factory=list)


class CoachProposal(BaseModel):
    kind: Literal["vocabulary", "practice"]
    value: str  # the word, or the practice sentence
    reason: str  # evidence from the call


class ReviewEvent(BaseModel):
    """The post-call coach's review (coach.py): proposals the user approves or rejects in the app."""

    type: Literal["review"] = "review"
    summary: str
    proposals: list[CoachProposal]
    moments: int  # lines the user spoke in the call
    latency_ms: int


class SpokenEvent(BaseModel):
    type: Literal["spoken"] = "spoken"
    text: str
    first_audio_ms: float
