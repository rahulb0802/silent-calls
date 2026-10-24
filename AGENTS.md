# Silent Calls — Agent Guide

Desktop app for taking calls without speaking: user mouths words at a webcam →
lip-reading model returns candidate sentences → decision layer picks one using
call context → Cartesia clone of the user's voice speaks it into Zoom/Meet/FaceTime
via a virtual mic.

This is a 36-hour hackathon project (Cal Hacks, Oct 23–25 2026). Optimize for a
working demo, not production quality.

## Read before coding
1. docs/ARCHITECTURE.md — system overview and data flow
2. docs/PROTOCOL.md — the WebSocket contract. **Do not change it unilaterally.**
   If you need a change, stop and tell the human.
3. The spec for your component in docs/specs/

## Hard rules (never violate)
- Nothing is spoken aloud unless confidence is high OR the user confirmed it.
- Video frames are processed in memory and never written to disk or logged.
  (Exception: enrollment clips, stored per-user, only during enrollment.)
- Per-user LoRA adapters are private: load only the adapter for the session's user_id.
- Claude never blocks the fast path. Its repair is only ever offered as an option.
- Never commit API keys. Use `.env` (see `.env.example`).

## Conventions
- Server: Python 3.11, FastAPI, asyncio, PyTorch. Type hints everywhere. `ruff` format.
- Client: Electron + React + TypeScript. `prettier`.
- Every stage logs its latency in ms (see PROTOCOL `timings`). We are measuring
  against a 1.5 s budget, so keep the timing fields accurate.
- Prefer simple, readable code over abstraction. No new frameworks without asking.
- When something can't be finished, leave a `TODO(hackathon):` comment and keep
  the core loop working.

## Git workflow
- Commit sequentially by added feature, with a separate focused commit for each feature. Preserve this convention for future work.
- Claude may commit, push, and merge directly to `main` in this repo. No pull requests needed.
- Work on a short-lived feature branch, then merge it into `main` and push.
- Before merging: `git fetch` and rebase onto `origin/main` so teammates' work isn't overwritten.
- Never force-push to `main` and never rewrite its history.

## Repo layout
- `silentcalls/` — components 7–9 (captions, decision layer, voice output), already
  built. Moves into `server/` once the orchestrator exists; see docs/specs/decision-voice.md.
- `client/` — Electron + React (TODO)
- `server/` — FastAPI on Vultr (TODO)
- `tools/mock_server.py` — fake backend so the client never waits on the GPU (TODO)

## Commands
- Server: `cd server && uvicorn app.main:app --host 0.0.0.0 --port 8000`
- Mock server: `python tools/mock_server.py` (port 8000, same protocol, fake data)
- Client: `cd client && npm run dev`
- Components 7–9 today: `.venv/bin/python -m silentcalls.app` (see README.md)
- Tests: `.venv/bin/python -m pytest -q tests`

## Combined-tree status
The Electron app now lives in `client/`. The local `silentcalls/` service is still the interim single-user components 7–9 implementation, not the draft GPU orchestrator. See docs/MERGE_AUDIT.md before integration. Both wire protocol documents were preserved; agree any changes with the human first.
