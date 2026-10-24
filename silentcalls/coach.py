"""Post-call coach: an agent that reviews where lip-reading struggled in the call and proposes fixes.

Trigger: the user clicks "Review this call" in the widget (or the app sends {"type": "review"}).
Input: what was said in the call, and for each line the user spoke, the options they were shown and what they
actually said (picked as-is, a different option, an edited phrase, or Claude's repair).
Tools (proposals only, nothing changes until the user approves in the app):
  propose_vocabulary(word, reason)          a name or term the lip-reader kept missing
  propose_practice_sentence(sentence, reason)  a sentence to record in calibration, so the personal adapter
                                            learns it (up to 5; they join the first 30 prompts)
The app shows the plan, each proposal with its reason and evidence, and Approve buttons. Approved words go to the
user's vocabulary (which also biases the lip-reader); approved sentences become calibration prompts.
"""

import json
import logging
import time

import anthropic

from .config import Settings
from .protocol import CoachProposal, ReviewEvent

log = logging.getLogger(__name__)

MAX_PROPOSALS = 6
MAX_ROUNDS = 4

SYSTEM = """\
You review a phone/video call for someone who cannot speak aloud: they mouthed their replies to a webcam, a \
lip-reading model guessed them, and they picked (or corrected) what was spoken in their cloned voice.

Find where lip-reading struggled and propose fixes, using the tools:
- propose_vocabulary: a name or uncommon word the user had to correct or type in, or that the other person used \
and the user is likely to say again. Not common words.
- propose_practice_sentence: a short sentence (5-12 words) the user is likely to say again, built around the \
words that failed, to record in calibration. At most 3.

Only propose what the call gives evidence for; quote that evidence in `reason`. If lip-reading did fine, propose \
nothing. Then finish with a two-sentence summary of how the call went for lip-reading and what you proposed."""

TOOLS = [
    {"name": "propose_vocabulary", "strict": True,
     "description": "Propose adding a name or uncommon word to the user's vocabulary (the user approves first).",
     "input_schema": {"type": "object", "properties": {"word": {"type": "string"}, "reason": {"type": "string"}},
                      "required": ["word", "reason"], "additionalProperties": False}},
    {"name": "propose_practice_sentence", "strict": True,
     "description": "Propose a sentence for the user to record in calibration (the user approves first).",
     "input_schema": {"type": "object", "properties": {"sentence": {"type": "string"}, "reason": {"type": "string"}},
                      "required": ["sentence", "reason"], "additionalProperties": False}},
]


def _norm(text: str) -> str:
    return " ".join("".join(c for c in text.lower() if c.isalnum() or c.isspace()).split())


def call_text(transcript: list[tuple[str, str]], moments: list[dict]) -> str:
    lines = ["Conversation (in order):"]
    lines += [f"{'Other person' if who == 'them' else 'User'}: {text}" for who, text in transcript]
    lines.append("\nWhat the user mouthed, the options the lip-reader showed, and what was finally spoken:")
    for i, m in enumerate(moments, 1):
        shown = " | ".join(m["options"]) or "(no options)"
        said, options = _norm(m["said"]), [_norm(o) for o in m["options"]]
        how = ("picked the top option" if options and said == options[0]
               else "picked another option" if said in options
               else "used Claude's repair" if m.get("repair") and said == _norm(m["repair"])
               else "typed/edited it")
        lines.append(f"{i}. shown: {shown}\n   spoken: {m['said']} ({how})")
    return "\n".join(lines)


class Coach:
    def __init__(self, s: Settings, client=None):
        self.s = s
        self.client = client or anthropic.AsyncAnthropic()

    async def review(self, transcript: list[tuple[str, str]], moments: list[dict], vocab: list[str]) -> ReviewEvent:
        t0 = time.perf_counter()
        proposals: list[CoachProposal] = []
        known = {w.lower() for w in vocab}
        content = call_text(transcript, moments)
        if vocab:
            content += "\n\nAlready in the user's vocabulary (don't propose these): " + ", ".join(vocab)
        messages: list = [{"role": "user", "content": content}]
        summary = ""
        for _ in range(MAX_ROUNDS):
            resp = await self.client.beta.messages.create(
                model=self.s.claude_model, max_tokens=4096, betas=["server-side-fallback-2026-07-01"],
                fallbacks="default", output_config={"effort": "medium"}, system=SYSTEM, tools=TOOLS, messages=messages)
            if resp.stop_reason != "tool_use":
                if resp.stop_reason != "end_turn":
                    log.warning("coach: stop_reason=%s", resp.stop_reason)
                summary = next((b.text for b in resp.content if b.type == "text"), "").strip()
                break
            messages.append({"role": "assistant", "content": resp.content})
            results = []
            for block in resp.content:
                if block.type != "tool_use":
                    continue
                args = block.input if isinstance(block.input, dict) else {}
                kind = "vocabulary" if block.name == "propose_vocabulary" else "practice"
                value = str(args.get("word" if kind == "vocabulary" else "sentence", "")).strip()[:200]
                if not value or len(proposals) >= MAX_PROPOSALS or (kind == "vocabulary" and value.lower() in known):
                    results.append({"type": "tool_result", "tool_use_id": block.id, "is_error": True,
                                    "content": "not added: empty, duplicate, already known, or the limit is reached"})
                    continue
                known.add(value.lower())
                proposals.append(CoachProposal(kind=kind, value=value, reason=str(args.get("reason", ""))[:300]))
                results.append({"type": "tool_result", "tool_use_id": block.id,
                                "content": "proposed; the user will approve or reject it"})
            messages.append({"role": "user", "content": results})
        return ReviewEvent(summary=summary[:1000], proposals=proposals, moments=len(moments),
                           latency_ms=round((time.perf_counter() - t0) * 1000))
