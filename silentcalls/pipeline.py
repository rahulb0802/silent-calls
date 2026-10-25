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
from .protocol import (CandidatesMessage, CaptionEvent, DecisionEvent, MemoryEvent, NamesEvent, PunctuatedEvent,
                       RepairEvent, ReviewEvent, SpokenEvent)
from .voice import VoiceOutput

log = logging.getLogger(__name__)

Emit = Callable[[BaseModel], Awaitable[None]]


class Pipeline:
    def __init__(self, s: Settings, voice: VoiceOutput | None, emit: Emit,
                 use_jev: bool = True, use_claude: bool = True, copilot=None, coach=None, punctuator=None,
                 memory=None):
        self.s = s
        self.w = Weights.load()
        self.voice = voice
        self.emit = emit
        self.transcript = Transcript(s.context_lines)
        self.jev = Jev(s) if use_jev and s.jev_api_key else None
        self.repairer = Repairer(s) if use_claude and os.getenv("ANTHROPIC_API_KEY") else None
        self._repairs: dict[str, asyncio.Task] = {}
        self._heard: list[str] = []  # names heard in this call, kept after their lines leave the transcript
        self._people: list[str] = []  # first names from the user's calendar and email (load_people)
        if copilot is not None and getattr(copilot, "on_names", 1) is None:
            copilot.on_names = self.add_names
        self.copilot = copilot  # Copilot, or None
        self.coach = coach  # Coach, or None
        self.punctuator = punctuator  # Punctuator (dictation), or None
        self.memory = memory  # PhraseMemory (Moss), or None; used only while the user has it on
        self.memory_on = False
        self._last_them = ""  # the line the user's next reply answers, for phrase memory
        if copilot is not None and memory is not None:
            copilot.recall = self._recall
        self._dictated: list[str] = []  # what was typed by dictation, as context for where sentences break
        # this call, in memory only, for the post-call review: every line, and for each line the user spoke,
        # the options they were shown
        self._call: list[tuple[str, str]] = []
        self._moments: list[dict] = []
        self._shown: tuple[float, list[str]] | None = None
        self._last_repair = ""

    async def close(self) -> None:
        if self.memory:
            await self.memory.close()
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
        self._last_them = line
        self.transcript.add("them", line)
        self._call = (self._call + [("them", line)])[-200:]
        await self.emit(CaptionEvent(speaker="them", text=line))
        if self.copilot:
            self.copilot.on_line(line, self.transcript.render(), self.call_names())
        await self.add_names(names_from_text(line))

    async def add_names(self, names: list[str]) -> None:
        """Names heard in the call (from the captions, or from Claude reading them): the lip-reader gets them."""
        new = [n for n in clean(names) if n not in self._heard]
        if new:
            self._heard = (self._heard + new)[-50:]
            await self.emit(NamesEvent(names=self.call_names()))

    async def load_people(self) -> None:
        """Start-up: first names from the user's calendar attendees and frequent email senders."""
        data = getattr(self.copilot, "data", None)
        if data is None:
            return
        try:
            self._people = clean(await data.people())
        except Exception as e:  # Google unreachable: carry on without them
            log.info("names: calendar/email names unavailable (%s)", type(e).__name__)
            return
        log.info("names: %d from calendar and email", len(self._people))
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
                self._repair(msg.utterance_id, context, cands, names, msg.me))

        try:
            scored, jev_ms = await score_with_jev(self.jev, context, cands, self.w, names, msg.me)
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

    async def punctuate(self, request_id: str, text: str, names: list[str]) -> None:
        """Dictation: write the picked words out with capitals and punctuation (words unchanged), or None."""
        out = None
        if self.punctuator:
            try:
                out = await asyncio.wait_for(self.punctuator.punctuate(text, names, " ".join(self._dictated[-3:])), 3.0)
            except Exception as e:  # timeout, API: the app uses its simple rules
                log.info("punctuate: %s", type(e).__name__)
        await self.emit(PunctuatedEvent(request_id=request_id, text=out))

    def dictated(self, text: str) -> None:
        """Dictation: the user's text was typed, not spoken; keep it as context (and for the post-call review)."""
        self._dictated = (self._dictated + [text])[-10:]
        if self.memory_on:
            asyncio.create_task(self._remember(text))
        self.transcript.add("me", text)
        self._call = (self._call + [("me", text)])[-200:]
        shown = self._shown[1] if self._shown and time.monotonic() - self._shown[0] < 120 else []
        if shown:
            self._moments = (self._moments + [{"said": text, "options": shown, "repair": self._last_repair}])[-100:]
        self._shown, self._last_repair = None, ""

    async def set_memory(self, profile: str, on: bool) -> None:
        """The app's phrase-memory setting for this profile (opt-in)."""
        if not self.memory:
            await self.emit(MemoryEvent(on=False))
            return
        self.memory_on = False
        count = 0
        if on and profile:
            try:
                count = await self.memory.open(profile)
                self.memory_on = True
            except Exception as e:  # Moss unreachable: carry on without it
                log.info("memory: unavailable (%s)", type(e).__name__)
        await self.emit(MemoryEvent(on=self.memory_on, count=count))

    async def forget_phrases(self) -> None:
        n = await self.memory.forget() if self.memory and self.memory_on else 0
        log.info("memory: forgot %d phrases", n)
        await self.emit(MemoryEvent(on=self.memory_on, count=self.memory._session.doc_count if self.memory_on else 0))

    async def _recall(self, line: str) -> list[tuple[str, str]]:
        """For the co-pilot: the user's past exchanges most like this line (none while memory is off)."""
        return await self.memory.recall(line) if self.memory and self.memory_on else []

    async def _remember(self, text: str) -> None:
        if self.memory_on:
            try:
                await self.memory.add(self._last_them, text)
            except Exception as e:
                log.info("memory: add failed (%s)", type(e).__name__)

    async def speak(self, text: str) -> None:
        asyncio.create_task(self._remember(text))
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
        """The user's names (VOCAB), every name heard in this call so far, then names from their calendar and email."""
        return clean(self.s.vocab.split(",") + self._heard + self._people)

    def names(self, context: str) -> list[str]:
        """call_names() plus names in the current context (speaker labels stripped)."""
        heard = names_from_text(re.sub(r"(?m)^[^:\n]+:\s*", "", context))
        return clean(self.call_names() + heard)

    async def _repair(self, utterance_id: str, context: str, cands, names: list[str] | None = None,
                      me: str = "") -> None:
        t0 = time.perf_counter()
        try:
            text = await self.repairer.repair(context, cands, names, me)
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
