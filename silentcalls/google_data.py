"""Read-only Google Calendar and Gmail lookups for the call co-pilot (sign in once: `python -m silentcalls.google_auth`).

Nothing here is logged or stored: the calendar is cached in memory for a few minutes, mail searches for the
call. Only short snippets ever leave this module (to the co-pilot's prompt).
"""

import asyncio
import datetime as dt
import logging
import time

log = logging.getLogger(__name__)

CALENDAR_TTL_S = 300
CALENDAR_DAYS = 7
MAX_EVENTS = 30
MAX_MESSAGES = 5


def _event_time(t: dict) -> str:
    return t.get("dateTime") or t.get("date", "")


class GoogleData:
    """Calendar for the next week and Gmail search, through the saved read-only token."""

    def __init__(self, creds):
        from googleapiclient.discovery import build

        self._cal = build("calendar", "v3", credentials=creds, cache_discovery=False)
        self._gmail = build("gmail", "v1", credentials=creds, cache_discovery=False)
        self._events: tuple[float, list[dict]] | None = None
        self._mail: dict[str, list[dict]] = {}

    @classmethod
    def connect(cls) -> "GoogleData | None":
        """None if Google isn't set up (no token, or the libraries are missing)."""
        try:
            from .google_auth import credentials

            creds = credentials()
            return cls(creds) if creds else None
        except Exception as e:  # missing libraries, revoked token, ...
            log.info("google: not connected (%s)", type(e).__name__)
            return None

    async def calendar(self) -> list[dict]:
        """[{title, start, end, location}] for the next CALENDAR_DAYS days, start-ordered."""
        if self._events and time.monotonic() - self._events[0] < CALENDAR_TTL_S:
            return self._events[1]
        events = await asyncio.to_thread(self._fetch_calendar)
        self._events = (time.monotonic(), events)
        return events

    def _fetch_calendar(self) -> list[dict]:
        now = dt.datetime.now(dt.timezone.utc)
        items = self._cal.events().list(
            calendarId="primary", timeMin=now.isoformat(), timeMax=(now + dt.timedelta(days=CALENDAR_DAYS)).isoformat(),
            singleEvents=True, orderBy="startTime", maxResults=MAX_EVENTS).execute().get("items", [])
        return [{"title": e.get("summary", "(busy)")[:120], "start": _event_time(e.get("start", {})),
                 "end": _event_time(e.get("end", {})), "location": e.get("location", "")[:120]} for e in items]

    async def search_mail(self, query: str) -> list[dict]:
        """[{from, subject, date, snippet}] for a Gmail search query (Gmail's own syntax), newest first."""
        query = query.strip()[:200]
        if query not in self._mail:
            self._mail[query] = await asyncio.to_thread(self._fetch_mail, query)
        return self._mail[query]

    def _fetch_mail(self, query: str) -> list[dict]:
        users = self._gmail.users()
        ids = users.messages().list(userId="me", q=query, maxResults=MAX_MESSAGES).execute().get("messages", [])
        out = []
        for m in ids:
            msg = users.messages().get(userId="me", id=m["id"], format="metadata",
                                       metadataHeaders=["From", "Subject", "Date"]).execute()
            headers = {h["name"].lower(): h["value"] for h in msg.get("payload", {}).get("headers", [])}
            out.append({"from": headers.get("from", "")[:120], "subject": headers.get("subject", "")[:200],
                        "date": headers.get("date", "")[:40], "snippet": msg.get("snippet", "")[:300]})
        return out

    def forget(self) -> None:
        """End of call: drop cached mail results."""
        self._mail.clear()
