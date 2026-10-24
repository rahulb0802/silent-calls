"""One-time Google sign-in for the call co-pilot: read-only Calendar and Gmail.

    python -m silentcalls.google_auth          # opens the browser, saves the token, prints a quick check

Needs a Desktop OAuth client from Google Cloud saved as ~/.silentcalls/google_client.json (see
docs/COPILOT.md). The token is saved next to it, outside the repo; nothing here is committed.
Scopes are read-only: the co-pilot can look things up, never send mail or change events.
"""

import datetime as dt
import sys
from pathlib import Path

DIR = Path.home() / ".silentcalls"
CLIENT = DIR / "google_client.json"
TOKEN = DIR / "google_token.json"
SCOPES = ["https://www.googleapis.com/auth/calendar.readonly",
          "https://www.googleapis.com/auth/gmail.readonly"]


def credentials(interactive: bool = False):
    """Saved credentials (refreshed if expired), or None. interactive=True runs the browser sign-in."""
    from google.auth.transport.requests import Request
    from google.oauth2.credentials import Credentials
    from google_auth_oauthlib.flow import InstalledAppFlow

    creds = Credentials.from_authorized_user_file(str(TOKEN), SCOPES) if TOKEN.exists() else None
    if creds and creds.expired and creds.refresh_token:
        try:
            creds.refresh(Request())
        except Exception:
            creds = None
    if (not creds or not creds.valid) and interactive:
        if not CLIENT.exists():
            raise SystemExit(f"Save your Desktop OAuth client JSON as {CLIENT} first (docs/COPILOT.md).")
        creds = InstalledAppFlow.from_client_secrets_file(str(CLIENT), SCOPES).run_local_server(port=0)
    if creds and creds.valid:
        DIR.mkdir(mode=0o700, parents=True, exist_ok=True)
        TOKEN.write_text(creds.to_json())
        return creds
    return None


def main() -> None:
    from googleapiclient.discovery import build

    creds = credentials(interactive=True)
    now = dt.datetime.now(dt.timezone.utc)
    cal = build("calendar", "v3", credentials=creds, cache_discovery=False)
    events = cal.events().list(calendarId="primary", timeMin=now.isoformat(), timeMax=(now + dt.timedelta(days=7)).isoformat(),
                               singleEvents=True, orderBy="startTime", maxResults=50).execute().get("items", [])
    gmail = build("gmail", "v1", credentials=creds, cache_discovery=False)
    msgs = gmail.users().messages().list(userId="me", maxResults=10).execute().get("messages", [])
    # counts only: the check shouldn't print anyone's calendar or mail into a terminal
    print(f"Signed in. Calendar: {len(events)} events in the next 7 days. Gmail: {len(msgs)} recent messages readable.")
    print(f"Token saved to {TOKEN}")


if __name__ == "__main__":
    sys.exit(main())
