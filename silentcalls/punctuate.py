"""Dictation: write the lip-reader's words as text (capitals, punctuation, sentence breaks) without changing them.

"hi my name is rahul can you send me the claude file" -> "Hi, my name is Rahul. Can you send me the Claude file?"
Claude Haiku 5.5 adds only capitals and punctuation; the result is used only if its letters are exactly the
input's (same words, same order), otherwise None and the app falls back to its simple rules.
"""

import json
import logging
import re

import anthropic
import httpx

log = logging.getLogger(__name__)

MODEL = "claude-haiku-5-5"
SYSTEM = """\
You format dictated text. The user mouthed it silently; a lip-reading model wrote it as lowercase words with \
no punctuation. Add capital letters, punctuation and sentence breaks so it reads as normal written text. \
Join contractions the model split ("i m" -> "I'm"). Never add, remove, reorder or replace a word, even one \
that looks wrong: the user chooses the words, you only write them out. Names in the user's list are spelled \
as listed."""
SCHEMA = {"type": "object", "properties": {"text": {"type": "string"}}, "required": ["text"],
          "additionalProperties": False}


def letters(text: str) -> str:
    """The words with everything but letters and digits removed: equal for the same words however written."""
    return re.sub(r"[^a-z0-9]", "", text.lower())


class Punctuator:
    def __init__(self, client=None):
        # keep the connection open between dictations (a new TLS handshake costs ~0.2-0.3 s)
        self.client = client or anthropic.AsyncAnthropic(
            http_client=anthropic.DefaultAsyncHttpxClient(limits=httpx.Limits(keepalive_expiry=300)))

    async def punctuate(self, text: str, names: list[str] | None = None, before: str = "") -> str | None:
        """`before`: what was dictated just before (context for where sentences break); not rewritten."""
        content = f"Dictated text:\n{text}"
        if before:
            content = f"Already written just before (context only, don't repeat it):\n{before[-400:]}\n\n" + content
        if names:
            content += "\n\nNames and words the user uses: " + ", ".join(names[:60])
        resp = await self.client.messages.create(
            model=MODEL, max_tokens=1024, system=SYSTEM, messages=[{"role": "user", "content": content}],
            thinking={"type": "disabled"}, output_config={"effort": "low", "format": {"type": "json_schema", "schema": SCHEMA}})
        if resp.stop_reason != "end_turn":
            log.info("punctuate: stop_reason=%s", resp.stop_reason)
            return None
        out = json.loads(next((b.text for b in resp.content if b.type == "text"), "{}")).get("text", "").strip()
        if not out or letters(out) != letters(text):  # a word changed: don't use it
            log.info("punctuate: words changed, not used")
            return None
        return out
