"""Phrase memory (Moss): the co-pilot's memory of how the user has answered before.

Each reply the user speaks or dictates is stored with the line it answered ("Can you send the file? ->
Sure, I'll send it over tonight."). When the other person says something, Moss finds the user's closest past
exchanges in a few milliseconds and the co-pilot (Claude) gets them as context: it writes replies to what's
being said now, in the user's own phrasing and consistent with facts they've already given. Those replies
are what the lip-reader checks against the video. (Past replies aren't offered as they are: an old answer
rarely fits a new question exactly.)

Opt-in per profile (the app sends {"type": "memory", "profile", "on"}). Only the user's replies and the line
they answered are stored, in the profile's Moss index (cloud, so it follows the user; queries run on this
computer), with a copy on disk in ~/.silentcalls/moss. "Forget" deletes the user's phrases.
"""

import asyncio
import hashlib
import logging
import os
import re
import time
from pathlib import Path

log = logging.getLogger(__name__)

CACHE = Path.home() / ".silentcalls" / "moss"
RECALL_K = 4  # past exchanges given to the co-pilot
PUSH_AFTER_S = 10.0  # batch cloud updates

# Generic starting phrases, so the memory isn't empty on day one: (what they said, what the user replied)
SEED = [
    ("How are you doing today?", "I'm doing well, thanks. How about you?"),
    ("Can you hear me okay?", "Yes, I can hear you fine."),
    ("Are you free tomorrow afternoon?", "Yes, I'm free after three."),
    ("Does Friday work for you?", "Friday works for me."),
    ("Can we move the meeting to next week?", "Sure, next week works. Send me a time."),
    ("What time works best for you?", "Anytime after two works for me."),
    ("Did you get my email?", "Yes, I got it, thanks. I'll reply today."),
    ("Can you send me the file?", "Sure, I'll send it over tonight."),
    ("Have you had a chance to look at it?", "Not yet, I'll look at it this afternoon."),
    ("When can you have it done?", "I can have it done by Friday."),
    ("Are we still on for the call?", "Yes, we're still on."),
    ("Is now a good time?", "Yes, now is good."),
    ("Can I call you back later?", "Sure, call me back whenever you're free."),
    ("Do you have any questions?", "No questions for now, thanks."),
    ("What do you think?", "I think that sounds good."),
    ("Does that make sense?", "Yes, that makes sense."),
    ("Can you repeat that?", "Sorry, let me say that again."),
    ("Where are you right now?", "I'm at home right now."),
    ("Are you running late?", "Sorry, I'm running about ten minutes late."),
    ("Can you share your screen?", "Sure, give me one second."),
    ("Did you finish the project?", "Yes, I finished it. It's in your inbox."),
    ("How did the demo go?", "The demo went really well, thanks."),
    ("Can you join the meeting at four?", "Yes, I'll be there at four."),
    ("Who else is coming?", "I'm not sure, let me check and get back to you."),
    ("What's the address?", "I'll text you the address."),
    ("Do you need anything from me?", "No, I think I'm all set."),
    ("Can you help me with this?", "Of course, what do you need?"),
    ("Thanks for your help.", "No problem, happy to help."),
    ("Talk soon?", "Yes, talk soon. Bye."),
    ("Anything else?", "That's everything for now. Thanks."),
]


def _key(profile: str) -> str:
    return "silentcalls-" + (re.sub(r"[^a-z0-9]+", "-", profile.lower()).strip("-")[:40] or "default")


def _doc(prompt: str, reply: str, seed: bool = False):
    from moss import DocumentInfo
    pid = ("seed-" if seed else "p-") + hashlib.sha1(f"{prompt}|{reply}".lower().encode()).hexdigest()[:16]
    return DocumentInfo(id=pid, text=f"{prompt} -> {reply}",
                        metadata={"prompt": prompt, "reply": reply, "seed": "1" if seed else "0"})


class PhraseMemory:
    """One profile's phrase memory, a Moss session index (live adds, local queries, pushed to the cloud)."""

    def __init__(self, client=None):
        self._client = client
        self._session = None
        self.profile = ""
        self._push: asyncio.TimerHandle | None = None
        self._lock = asyncio.Lock()

    @staticmethod
    def available() -> bool:
        return bool(os.getenv("MOSS_PROJECT_ID") and os.getenv("MOSS_PROJECT_KEY"))

    def _moss(self):
        if self._client is None:
            from moss import MossClient
            self._client = MossClient(os.getenv("MOSS_PROJECT_ID"), os.getenv("MOSS_PROJECT_KEY"))
        return self._client

    async def open(self, profile: str) -> int:
        """Open (or create, seeded) this profile's index; returns how many phrases it holds."""
        async with self._lock:
            if self._session is not None and profile == self.profile:
                return self._session.doc_count
            await self._close()
            t0 = time.perf_counter()
            name = _key(profile)
            session = await self._moss().session(name)
            disk = CACHE / name
            if session.doc_count == 0 and disk.exists():
                try:
                    await session.load_from_disk(str(disk))
                except Exception as e:  # an old or partial snapshot: start fresh
                    log.info("memory: disk copy unusable (%s)", type(e).__name__)
            if session.doc_count == 0:
                await session.add_docs([_doc(p, r, seed=True) for p, r in SEED])
            self._session, self.profile = session, profile
            self._schedule_push()
            log.info("memory: %d phrases for this profile, opened in %.1f s", session.doc_count, time.perf_counter() - t0)
            return session.doc_count

    async def recall(self, line: str, k: int = RECALL_K) -> list[tuple[str, str]]:
        """The user's own past exchanges most like this line: [(what they said, what the user replied)]. The
        generic starting phrases aren't the user's words, so they're left out."""
        if self._session is None or not line.strip():
            return []
        from moss import QueryOptions
        res = await self._session.query(line, QueryOptions(top_k=k + 8))
        out = []
        for d in res.docs:
            meta = d.metadata or {}
            if meta.get("seed") == "1" or not meta.get("reply"):
                continue
            prompt = meta.get("prompt") or d.text.split(" -> ")[0]
            out.append((prompt, meta["reply"]))
        return list(dict.fromkeys(out))[:k]

    async def add(self, prompt: str, reply: str) -> None:
        if self._session is None or not reply.strip():
            return
        await self._session.add_docs([_doc(prompt.strip()[:300] or "(start of the call)", reply.strip()[:300])])
        self._schedule_push()

    async def forget(self) -> int:
        """Delete the user's own phrases (the generic starting ones stay); returns how many were deleted."""
        if self._session is None:
            return 0
        docs = await self._session.get_docs()
        mine = [d.id for d in docs if d.id.startswith("p-")]
        if mine:
            await self._session.delete_docs(mine)
            self._schedule_push()
        return len(mine)

    def _schedule_push(self) -> None:
        if self._push:
            self._push.cancel()
        self._push = asyncio.get_running_loop().call_later(PUSH_AFTER_S, lambda: asyncio.create_task(self._sync()))

    async def _sync(self) -> None:
        """Save to disk and push to the cloud (the index then follows the user to another computer)."""
        session = self._session
        if session is None:
            return
        try:
            disk = CACHE / _key(self.profile)
            disk.mkdir(parents=True, exist_ok=True)
            await session.save_to_disk(str(disk))
            await session.push_index()
        except Exception as e:  # offline: the disk copy and the next push catch up
            log.info("memory: sync failed (%s)", type(e).__name__)

    async def _close(self) -> None:
        if self._session is not None:
            if self._push:
                self._push.cancel()
                self._push = None
                await self._sync()
            try:
                await self._session.close()
            except Exception:
                pass
            self._session = None

    async def close(self) -> None:
        async with self._lock:
            await self._close()
