# Call co-pilot: Google setup

The co-pilot reads your Google Calendar and Gmail (read-only) so it can prepare replies with real facts
("I'm free Tuesday after 3", an order number from an email). You still mouth what you want to say; the
lip-reader picks among its suggestions and its own guesses, and nothing is spoken without your pick.

## One-time setup (about 10 minutes)

1. Go to https://console.cloud.google.com, create a project (e.g. "silent-calls").
2. **APIs & Services → Library**: enable **Google Calendar API** and **Gmail API**.
3. **APIs & Services → OAuth consent screen** (Google Auth Platform → Branding / Audience):
   - User type **External**, app name "Silent Calls", your email as support and developer contact.
   - Leave publishing status **Testing**, and under **Test users** add every Google account that will
     sign in (yours, teammates' for the demo).
4. **Credentials → Create credentials → OAuth client ID**, application type **Desktop app**.
   Download the JSON and save it as `C:\Users\<you>\.silentcalls\google_client.json`
   (macOS: `~/.silentcalls/google_client.json`).
5. From the repo root: `.venv/Scripts/python -m silentcalls.google_auth` (macOS: `.venv/bin/python ...`).
   A browser opens; sign in with a test user. Google warns the app is unverified (it's your own testing
   app): **Advanced → Go to Silent Calls**, allow both read-only permissions. The script prints how many
   events and messages it can see, nothing else.

The token is saved to `~/.silentcalls/google_token.json`, outside the repo. Scopes are read-only
(`calendar.readonly`, `gmail.readonly`): the co-pilot cannot send mail or change events. To revoke:
https://myaccount.google.com/permissions, and delete the token file.
