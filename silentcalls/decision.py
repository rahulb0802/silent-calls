"""Component 8: pick what to say from the lip-reader's candidates.

combined logit = w_lip * log p_lip + w_jev * log p_jev, softmaxed over the top candidates, where
  p_lip = softmax of the lip-reader's beam scores, and
  p_jev = Jev's probability that each candidate is what the user meant, given the conversation.
Weights and thresholds are fitted on our labelled clips (fit_weights.py).

Routing on the combined probability of the top guess:
  >= speak_threshold   speak it now (fast path)
  >= choose_threshold  show the top 3 for the user to pick
  otherwise            ask the user to repeat
Claude repair runs in parallel with Jev and never delays the decision; its suggestion is only ever
offered as an extra option.
"""

import json
import logging
import time
from dataclasses import dataclass

import anthropic
import httpx
import numpy as np

from .config import Settings, Weights
from .protocol import Candidate, Option

log = logging.getLogger(__name__)

JEV_URL = "https://api.typesafe.ai/v1/systemone"
EPS = 1e-6


def softmax(x: np.ndarray) -> np.ndarray:
    e = np.exp(x - x.max())
    return e / e.sum()


@dataclass
class Scored:
    options: list[Option]  # all scored candidates, best first
    jev_ok: bool


def combine(cands: list[Candidate], p_jev: list[float] | None, w: Weights) -> Scored:
    if not cands:
        return Scored(options=[], jev_ok=False)
    if p_jev is not None:
        values = np.asarray(p_jev, dtype=float)
        if values.shape != (len(cands),) or not np.all(np.isfinite(values)) or np.any(values < 0) or values.sum() <= 0:
            log.warning("invalid Jev probabilities; using lip scores only")
            p_jev = None
        else:
            p_jev = (values / values.sum()).tolist()
    p_lip = softmax(np.array([c.score for c in cands], dtype=float))
    logits = w.w_lip * np.log(p_lip + EPS)
    if p_jev is not None:
        logits = logits + w.w_jev * np.log(np.array(p_jev) + EPS)
    prob = softmax(logits)
    options = [
        Option(text=c.text, prob=float(prob[i]), p_lip=float(p_lip[i]),
               p_jev=None if p_jev is None else float(p_jev[i]))
        for i, c in enumerate(cands)
    ]
    options.sort(key=lambda o: o.prob, reverse=True)
    return Scored(options=options, jev_ok=p_jev is not None)


def route(top_prob: float, w: Weights) -> str:
    if top_prob >= w.speak_threshold:
        return "speak"
    if top_prob >= w.choose_threshold:
        return "choose"
    return "repeat"


def dedupe(cands: list[Candidate]) -> list[Candidate]:
    """Merge candidates that differ only in case/punctuation (log-sum-exp of their scores)."""
    merged: dict[str, Candidate] = {}
    for c in cands:
        key = normalize(c.text)
        if key in merged:
            prev = merged[key]
            merged[key] = Candidate(text=prev.text, score=float(np.logaddexp(prev.score, c.score)))
        else:
            merged[key] = c
    return list(merged.values())


def normalize(text: str) -> str:
    return " ".join("".join(ch for ch in text.lower() if ch.isalnum() or ch.isspace()).split())


class Jev:
    """TypeSafe's Jev: one Choice question over the candidates, given the conversation as state."""

    def __init__(self, s: Settings):
        self.s = s
        self._http = httpx.AsyncClient(
            headers={"Authorization": f"Bearer {s.typesafe_api_key}"}, timeout=s.jev_timeout_s
        )

    async def close(self) -> None:
        await self._http.aclose()

    async def score(self, context: str, cands: list[Candidate], names: list[str] | None = None) -> list[float]:
        state = (
            f"A phone call. Recent conversation:\n{context}\n\n"
            "The user cannot speak aloud, so they silently mouthed their next line to a camera. "
            "A lip-reading model produced the options below. Lip-reading confuses sounds that look "
            "alike on the lips (p/b/m, f/v, t/d/n, k/g), so options are often near-misses."
        ) + names_note(names)
        body = {
            "model": self.s.jev_model,
            "state": state,
            "questions": {
                "reply": {
                    "type": "choice",
                    "instructions": "Which option is the user most likely trying to say next?",
                    "criteria": {f"c{i}": c.text for i, c in enumerate(cands)},
                }
            },
        }
        resp = await self._http.post(JEV_URL, json=body)
        resp.raise_for_status()
        probs = resp.json()["answers"]["reply"]["probabilities"]
        return [float(probs.get(f"c{i}", 0.0)) for i in range(len(cands))]


def names_note(names: list[str] | None) -> str:
    """Names the user may say (their list + names heard in the call). The lip-reader rarely gets a name right:
    it reads a look-alike instead ("server jet" for "Sarvajith")."""
    if not names:
        return ""
    return ("\n\nNames that may come up: " + ", ".join(names) + ". The lip-reader often turns a name into "
            "ordinary words that look alike on the lips (e.g. \"server jet\" for \"Sarvajith\").")


REPAIR_SYSTEM = """\
You repair lip-reading output for a person who cannot speak aloud and is on a phone call. They \
silently mouth a sentence; a lip-reading model returns its top guesses, which are often near-misses \
because sounds that look alike on the lips get confused (p/b/m, f/v, t/d/n, k/g, s/z, ch/j/sh).

Return the sentence the user most plausibly meant, using the conversation and the guesses. Prefer \
staying close to the guesses' words and length; change only what the context makes clear. Write it \
exactly as it should be spoken, in the user's voice. If no guess is plausible and you cannot tell, \
set "confident" to false."""

REPAIR_SCHEMA = {
    "type": "object",
    "properties": {
        "sentence": {"type": "string"},
        "confident": {"type": "boolean"},
    },
    "required": ["sentence", "confident"],
    "additionalProperties": False,
}


class Repairer:
    """Claude, at low effort with structured output, proposes a corrected sentence."""

    def __init__(self, s: Settings):
        self.s = s
        self._client = anthropic.AsyncAnthropic()

    async def repair(self, context: str, cands: list[Candidate], names: list[str] | None = None) -> str | None:
        guesses = "\n".join(f"{i + 1}. {c.text}" for i, c in enumerate(cands[: self.s.claude_top_k]))
        guesses += names_note(names)
        resp = await self._client.beta.messages.create(
            model=self.s.claude_model,
            max_tokens=2048,
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
            output_config={"effort": "low",
                           "format": {"type": "json_schema", "schema": REPAIR_SCHEMA}},
            system=REPAIR_SYSTEM,
            messages=[{
                "role": "user",
                "content": f"Conversation so far:\n{context}\n\nLip-reading guesses, best first:\n{guesses}",
            }],
        )
        if resp.stop_reason != "end_turn":  # refusal, max_tokens, ...
            log.warning("repair: stop_reason=%s", resp.stop_reason)
            return None
        text = next(b.text for b in resp.content if b.type == "text")
        out = json.loads(text)
        return out["sentence"].strip() if out["confident"] else None


async def score_with_jev(jev: Jev | None, context: str, cands: list[Candidate],
                         w: Weights, names: list[str] | None = None) -> tuple[Scored, float]:
    """Combine lip and Jev scores; falls back to lip-only if Jev is slow or down. Returns (scored, jev_ms)."""
    t0 = time.perf_counter()
    p_jev = None
    if jev is not None:
        try:
            p_jev = await jev.score(context, cands, names)
        except Exception as e:  # timeout, HTTP error, bad payload
            log.warning("jev failed (%s); using lip-reading scores only", e)
    jev_ms = (time.perf_counter() - t0) * 1000
    return combine(cands, p_jev, w), jev_ms


def top_k(cands: list[Candidate], k: int) -> list[Candidate]:
    valid = [c for c in cands if c.text.strip() and np.isfinite(c.score)]
    return sorted(dedupe(valid), key=lambda c: c.score, reverse=True)[:k]
