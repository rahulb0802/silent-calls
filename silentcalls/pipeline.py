"""Glue for components 7-9: candidates in -> decision -> (maybe) cloned voice out."""

import asyncio
import logging
import os
import re
import time
from collections.abc import Awaitable, Callable

from pydantic import BaseModel

from server.lipread.vocab import clean, names_from_text  # pure Python, no GPU deps

from .captions import Transcript
from .config import Settings, Weights
from .decision import Jev, Repairer, route, score_with_jev, top_k
from .protocol import (CandidatesMessage, CaptionEvent, DecisionEvent, NamesEvent, RepairEvent, ReviewEvent,
                       SpokenEvent)
from .voice import VoiceOutput

log = logging.getLogger(__name__)

Emit = Callable[[BaseModel], Awaitable[None]]


class Pipeline:
    def __init__(self, s: Settings, voice: VoiceOutput | None, emit: Emit,
                 use_jev: bool = True, use_claude: bool = True, copilot=None, coach=None):
        self.s = s
        self.w = Weights.load()
        self.voice = voice
        self.emit = emit
        self.transcript = Transcript(s.context_lines)
        self.jev = Jev(s) if use_jev and s.jev_api_key else None
        self.repairer = Repairer(s) if use_claude and os.getenv("ANTHROPIC_API_KEY") else None
        self._repairs: dict[str, asyncio.Task] = {}
        self._heard: list[str] = []  # names heard in this call, kept after their lines leave the transcript
        self.copilot = copilot  # Copilot, or None
        self.coach = coach  # Coach, or None
        # this call, in memory only, for the post-call review: every line, and for each line the user spoke,
        # the options they were shown
        self._call: list[tuple[str, str]] = []
        self._moments: list[dict] = []
        self._shown: tuple[float, list[str]] | None = None
        self._last_repair = ""

    async def close(self) -> None:
        tasks = list(self._repairs.values())
        for t in tasks:
            t.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        self._repairs.clear()
        if self.jev:
            await self.jev.close()
        if self.copilot:
            await self.copilot.close()

    async def on_caption(self, line: str) -> None:
        self.transcript.add("them", line)
        self._call = (self._call + [("them", line)])[-200:]
        await self.emit(CaptionEvent(speaker="them", text=line))
        if self.copilot:
            self.copilot.on_line(line, self.transcript.render(), self.call_names())
        new = [n for n in names_from_text(line) if n not in self._heard]
        if new:
            self._heard = (self._heard + new)[-50:]
            await self.emit(NamesEvent(names=self.call_names()))

    async def on_caption_partial(self, text: str) -> None:
        """The other person's line so far, for the live caption; only finished lines go to the transcript.
        The co-pilot starts on it once it pauses (copilot.on_partial)."""
        await self.emit(CaptionEvent(speaker="them", text=text, final=False))
        if self.copilot:
            self.copilot.on_partial(text, self.transcript.render(also=("them", text)), self.call_names())

    async def handle(self, msg: CandidatesMessage) -> DecisionEvent:
        t0 = time.perf_counter()
        context = self.transcript.render()
        names = clean(self.names(context) + msg.vocab)
        cands = top_k(msg.candidates, max(self.s.jev_top_k, 1))
        if not cands:
            event = DecisionEvent(utterance_id=msg.utterance_id, route="repeat", options=[])
            await self.emit(event)
            return event

        # Claude starts now, in parallel with Jev, and reports back on its own.
        if self.repairer:
            self._repairs[msg.utterance_id] = asyncio.create_task(
                self._repair(msg.utterance_id, context, cands, names))

        try:
            scored, jev_ms = await score_with_jev(self.jev, context, cands, self.w, names)
        except asyncio.CancelledError:
            self._cancel_repair(msg.utterance_id)
            raise
        top = scored.options[0]
        decided = route(top.prob, self.w)
        timings = {"jev": round(jev_ms), "decide": round((time.perf_counter() - t0) * 1000)}
        if msg.model_ms is not None:
            timings["lipread"] = round(msg.model_ms)

        event = DecisionEvent(utterance_id=msg.utterance_id, route=decided,
                              options=scored.options[:3], timings_ms=timings)
        self._shown = (time.monotonic(), [o.text for o in scored.options[:3]])
        await self.emit(event)
        log.info("decision %s: %s %.2f %r %s", msg.utterance_id, decided, top.prob, top.text, timings)

        if decided == "speak" and msg.auto_speak:
            self._cancel_repair(msg.utterance_id)
            await self.speak(top.text)
        return event

    async def confirm(self, utterance_id: str, text: str) -> None:
        """The user picked an option (or Claude's repair) from the overlay."""
        self._cancel_repair(utterance_id)
        await self.speak(text)

    async def speak(self, text: str) -> None:
        self.transcript.add("me", text)
        self._call = (self._call + [("me", text)])[-200:]
        shown = self._shown[1] if self._shown and time.monotonic() - self._shown[0] < 120 else []
        if shown:  # a spoken line that came from a capture (typed quick phrases have no options)
            self._moments = (self._moments + [{"said": text, "options": shown, "repair": self._last_repair}])[-100:]
        self._shown, self._last_repair = None, ""
        if self.copilot:
            await self.copilot.clear()
        first_ms = await self.voice.say(text) if self.voice else 0.0
        await self.emit(SpokenEvent(text=text, first_audio_ms=round(first_ms)))

    async def review(self, vocab: list[str]) -> ReviewEvent:
        """Post-call review: the coach proposes vocabulary and practice sentences from where lip-reading
        struggled. Clears this call's log afterwards."""
        if not self.coach or not self._moments:
            event = ReviewEvent(summary="Nothing to review yet: mouth a few replies in a call first."
                                if self.coach else "The coach needs ANTHROPIC_API_KEY.", proposals=[],
                                moments=len(self._moments), latency_ms=0)
        else:
            event = await self.coach.review(self._call, self._moments, clean(vocab))
            log.info("review: %d proposals from %d moments in %d ms", len(event.proposals), event.moments,
                     event.latency_ms)
            self._call, self._moments = [], []
        await self.emit(event)
        return event

    def call_names(self) -> list[str]:
        """The user's names (VOCAB) plus every name heard in this call so far."""
        return clean(self.s.vocab.split(",") + self._heard)

    def names(self, context: str) -> list[str]:
        """call_names() plus names in the current context (speaker labels stripped)."""
        heard = names_from_text(re.sub(r"(?m)^[^:\n]+:\s*", "", context))
        return clean(self.call_names() + heard)

    async def _repair(self, utterance_id: str, context: str, cands, names: list[str] | None = None) -> None:
        t0 = time.perf_counter()
        try:
            text = await self.repairer.repair(context, cands, names)
        except asyncio.CancelledError:
            raise
        except Exception as e:
            log.warning("repair failed: %s", e)
            return
        finally:
            self._repairs.pop(utterance_id, None)
        if text:
            self._last_repair = text
            await self.emit(RepairEvent(utterance_id=utterance_id, text=text,
                                        latency_ms=round((time.perf_counter() - t0) * 1000)))

    def _cancel_repair(self, utterance_id: str) -> None:
        task = self._repairs.pop(utterance_id, None)
        if task:
            task.cancel()
