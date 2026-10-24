# Silent Calls

Take a phone or video call without making a sound. You mouth your reply at your webcam; Silent Calls reads your
lips, works out what you meant from the conversation, and says it into the call **in your own cloned voice**.

**Who it's for:** people who can't speak aloud but can still move their lips: after a laryngectomy or vocal-cord
surgery, with voice loss from ALS or Parkinson's, on voice rest; and anyone who needs to answer a call where they
can't talk (a library, a hospital ward, next to a sleeping baby). Today their options are typing into chat (if the
call has one) or not taking the call. Silent Calls lets them stay *in* the conversation, in their own voice.

## How it works

```
 Your laptop                                                        Vultr GPU (NVIDIA A16)
┌───────────────────────────────────────────────────────┐          ┌──────────────────────────────────────┐
│ Desktop app (Electron + React)                        │  webcam  │ Lip-reader (AutoAVSR, PyTorch)       │
│  hold a key, mouth your reply ────────────────────────┼─ video ─►│  face + mouth crop (MediaPipe)       │
│                                                       │  (SSH    │  beam search → top 10 guesses        │
│  pick 1 / 2 / 3, or Claude's suggestion ◄─────────────┼─ tunnel)─┤  + names you use (vocab bias)        │
│                                                       │          │  + co-pilot's replies scored against │
│ Local service (Python)                                │          │    the same video                    │
│  call captions: speakers → Cartesia speech-to-text    │          │  + your personal LoRA adapter        │
│  co-pilot: Claude + your Calendar/Gmail → likely replies ──────► │                                      │
│  decision: TypeSafe Jev ranks guesses with the call   │          └──────────────────────────────────────┘
│  repair: Claude suggests what you probably meant      │
│  voice: Cartesia TTS in your cloned voice ──► virtual mic (VB-CABLE / BlackHole) ──► Zoom / Meet / FaceTime
└───────────────────────────────────────────────────────┘
```

1. **The other person talks.** Their audio is captioned live (Cartesia speech-to-text, recorded from your speakers).
2. **The co-pilot prepares your likely replies** (Claude, with read-only access to your calendar and email): asked
   "are you free Tuesday?", it already has "I'm free after 3 on Tuesday" ready, with the calendar entry it used.
3. **You mouth your reply** while holding a key. The lip-reader reads it, and also scores the co-pilot's replies
   against the same video. Your mouthing picks the reply; the co-pilot supplies what lips can't carry (times,
   order numbers, names).
4. **Jev ranks the options** using the conversation; Claude offers a repaired sentence if the lip-reader is off.
5. **You pick one** (keys 1-3). It's spoken in your cloned voice through a virtual microphone. **Nothing is ever
   spoken without your pick.**

The app gets better for you: a 10-minute calibration (30-60 sentences, including ones with your own name and
vocabulary) trains a personal adapter in about 35 seconds.

## Results

Measured on 90 silently mouthed call sentences from 3 people (full log: [docs/RESULTS.md](docs/RESULTS.md)).

| | |
|---|---|
| Lip-reading alone: right sentence is the top guess / in the top 10 | 36% / 56% |
| **When the co-pilot anticipated the reply** | top guess right **77%**, word error rate **37% → 19%** |
| With the conversation (Jev reranking, decision weights fitted on the clips) | top guess **31% → 42%**, top 3 **41% → 56%** |
| Personal adapter, sentences it never saw | word error rate **37% → 31%** (no change on someone else) |
| Key release → candidates (on the GPU server; 1.3 s over venue Wi-Fi) | **~1.1 s** |
| Pick → your voice in the call (Cartesia, first audio) | **~90 ms** |
| Co-pilot replies ready after the other person's line | **2.3 s** (2.9 s with an email search) |
| Upload needed (VP8 stream) | ~130 KB/s |

## Tools we used, and how

| Tool | What it does in Silent Calls |
|---|---|
| **Cartesia** | The user's voice, end to end. **Voice cloning** from a short guided recording in onboarding (`silentcalls/voice.py`, `/voices/clone`); **Sonic TTS** speaks every picked reply in that voice, streamed as PCM into the virtual mic (~90 ms to first audio); **Ink speech-to-text** (streaming WebSocket) captions the other person live, word by word, which feeds the co-pilot, Jev and Claude. |
| **Claude (Anthropic API)** | Two jobs, both offered as options and never spoken on their own. **Co-pilot agent** (`silentcalls/copilot.py`): after each line the other person says, Claude Opus 5.5 (fast mode, low effort) reads the conversation and the user's calendar, decides whether to search their email (a tool it calls with Gmail search syntax), and returns up to 4 likely replies, each with the facts it used and their source. **Repair** (`silentcalls/decision.py`): given the lip-reader's top 10 and the conversation, Claude proposes the sentence the user most likely meant, accounting for lip-reading confusions (p/b/m, f/v, ...). Structured outputs for both; server-side refusal fallbacks enabled. |
| **Vultr Cloud GPU** | Runs the lip-reader: an NVIDIA A16 (2 × 16 GB) hosts the AutoAVSR model as a `systemd` service. GPU 0 serves calls; GPU 1 trains personal LoRA adapters (~35 s) so training never slows a call. All of our evaluation runs (decoder sweeps, cross-validation, the co-pilot experiments) ran there too. |
| **Google Calendar + Gmail APIs** | Read-only, the user's own account (`silentcalls/google_data.py`): the next 7 days of events go into the co-pilot's context; Gmail search is a tool the co-pilot calls when the conversation needs a fact from email. Snippets only, never stored or logged. |
| **TypeSafe Jev** | Decision layer (`silentcalls/decision.py`): one choice question over the lip-reader's top 10, with the live conversation as state; its probabilities are combined with the lip scores (weights fitted on our clips) to rank the options. ~100 ms with a warm connection. |
| **AutoAVSR + ESPnet (PyTorch)** | The visual speech recognition model (LRS3, ~250M parameters) and its beam search, which we extended with a name/vocabulary bias, scoring of given sentences (the co-pilot's replies) against the video, and per-user LoRA adapters (`server/lipread/`, `server/lora/`). |
| **MediaPipe** | Face landmarks for the mouth crop on the GPU server, and a local mouth-movement meter in the app. |
| **Electron + React** | The desktop app: onboarding, calibration, the always-on-top meeting widget, a global hold-to-talk key, and the SSH tunnel to the GPU (opened automatically). |
| **VB-CABLE / BlackHole, WASAPI loopback** | The virtual microphone the cloned voice plays into; call audio for captions is recorded from the speakers (Windows loopback, no second cable). |

## Run it

**One-time setup**

1. Python service, from the repo root (Python 3.11):
   ```sh
   python -m venv .venv            # or: uv venv --python 3.11 .venv
   .venv/Scripts/pip install -r requirements.txt   # macOS/Linux: .venv/bin/pip
   cp .env.example .env            # add CARTESIA_API_KEY, ANTHROPIC_API_KEY, TYPESAFE_API_KEY
   ```
   In `.env`: `VIRTUAL_MIC_DEVICE=CABLE Input` (Windows) or `BlackHole 2ch` (Mac).
2. Virtual microphone: install [VB-CABLE](https://vb-audio.com/Cable/) (Windows) or BlackHole 2ch (Mac). In
   Zoom/Meet, set the **microphone** to CABLE Output / BlackHole 2ch and keep the **speaker** on your real speakers.
3. Optional, for the co-pilot's calendar and email: [docs/COPILOT.md](docs/COPILOT.md) (Google sign-in, read-only).
4. The GPU server: [server/setup_gpu.sh](server/setup_gpu.sh) on a Vultr GPU instance, then
   `systemctl start lipread` ([server/lipread.service](server/lipread.service)). The app reaches it through an SSH
   tunnel it opens itself (`~/.ssh/vultr_lipread`; override with `SILENT_SSH_KEY`, `SILENT_SSH_HOST`).

**Every time**

```sh
cd client
npm ci          # first time only
npm run dev
```

The app walks you through onboarding (camera, voice clone, meeting audio, calibration) and starts the local
service itself. To check every piece at once: `python tools/check_setup.py`.

## Privacy and safety

- **Nothing is spoken without your pick.** The decision layer and Claude only rank and suggest; the app tells the
  service not to auto-speak.
- **Video stays in memory.** Webcam frames are processed and dropped; only calibration clips are kept, and only as
  96×96 mouth crops with their sentence, per user.
- **Your adapter and word list are yours:** loaded only for your profile.
- **Google access is read-only** (calendar, Gmail search), snippets only, nothing logged. The co-pilot shows where
  every fact came from, and can be switched off in the widget.
- **No keys in the repo.** Secrets live in `.env` and `~/.silentcalls/`.

## Known limits

- Lip-reading is hard: alone, the right sentence is the top guess about a third of the time. The product is built
  around that: the top 3 to pick from, Jev's ranking, Claude's repair, the co-pilot, a personal adapter.
- Names and rare words need to be in your vocabulary (or said in the call) to be read; even then a strong
  look-alike word can win, and Claude's repair is the dependable fix.
- Numbers are hard to see on lips; the co-pilot supplies them from your calendar and email.
- The GPU server is reached over SSH; there is no multi-user authentication yet.

## Repository

| Path | |
|---|---|
| `client/` | Electron + React app (widget, onboarding, calibration, SSH tunnel) |
| `silentcalls/` | Local Python service: captions, co-pilot, decision (Jev + Claude), Cartesia voice |
| `server/lipread/` | GPU lip-reading service: model, vocabulary bias, given-sentence scoring, HTTP + WebSocket |
| `server/lora/` | Personal adapters: enrollment data, trainer, cross-validation |
| `server/eval.py`, `server/eval_given.py` | The evaluations behind every number in docs/RESULTS.md |
| `docs/` | [Architecture](docs/ARCHITECTURE.md), [protocol](docs/PROTOCOL.md), [results](docs/RESULTS.md), setup guides |
| `tests/`, `client/tests/` | Python and app tests |
