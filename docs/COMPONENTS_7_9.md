# Silent Calls

Take calls without speaking: mouth words at a webcam, a lip-reading model produces candidate
sentences, the conversation picks the right one, and a clone of your voice says it into Zoom, Meet
or FaceTime.

## Components 7-9 (`silentcalls/`)

| # | Component | File | What it does |
|---|-----------|------|--------------|
| 7 | Call audio + captions | `captions.py` | Captures the call's audio from a loopback device and streams it to Cartesia speech-to-text (`ink-2`). Each pause ends a line. The last few lines (both speakers) become the context. |
| 8 | Decision layer | `decision.py`, `fit_weights.py` | Combines lip-reading and Jev scores and routes the result: speak, show the top 3, or ask to repeat. Claude Opus 5.5 (low effort, structured output) repairs the guess in parallel and is only ever offered as an extra option. |
| 9 | Voice output | `voice.py` | Streams the Cartesia cloned voice (`sonic-3.6`) into a virtual mic. Includes a pre-rendered "I'm using a speech assistant" opener. |

`pipeline.py` connects them, and `app.py` serves them on `ws://127.0.0.1:8765`. The message shapes
are in `protocol.py` and are a proposal to agree on Friday night.

## Setup

```bash
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
cp .env.example .env   # fill in keys
```

### Audio routing

You need two virtual devices, so your voice and the call audio don't loop into each other.

**Mac:** `brew install blackhole-2ch blackhole-16ch`, then:
- Zoom microphone → **BlackHole 2ch**. Our cloned voice is written here (`VIRTUAL_MIC_DEVICE`).
- In Audio MIDI Setup, create a **Multi-Output Device** with your speakers and **BlackHole 16ch**, and set it as Zoom's speaker. You still hear the call, and we capture it from BlackHole 16ch (`CALL_AUDIO_DEVICE`).

**Windows:** Zoom mic → **CABLE Output** (VB-Cable). Set `VIRTUAL_MIC_DEVICE=CABLE Input`. For
call audio, enable **Stereo Mix** and set `CALL_AUDIO_DEVICE=Stereo Mix`, or use a second VB-Cable
the same way as on Mac.

List device names with `.venv/bin/python -m sounddevice`.

### Clone your voice

Record about 10-20 s of clean speech, then run:

```bash
.venv/bin/python -m silentcalls.voice clone me.wav --name "Nilesh"   # prints CARTESIA_VOICE_ID
.venv/bin/python -m silentcalls.voice say "Can you hear me?"         # test into the virtual mic
```

## Run

```bash
.venv/bin/python -m silentcalls.app                            # everything
.venv/bin/python -m silentcalls.app --no-voice --no-captions   # decision layer only
.venv/bin/python scripts/fake_lipreader.py "i'll call you back" "i'll fall you back"
.venv/bin/python -m silentcalls.captions                       # just print the other person's lines
```

## Fit the decision weights

Dump the feasibility clips as JSONL (`truth`, `context`, `candidates: [{text, score}]`), then run:

```bash
.venv/bin/python -m silentcalls.fit_weights data/clips.jsonl --precision 0.95
```

This writes `weights.json` (`w_lip`, `w_jev`, `speak_threshold`, `choose_threshold`) and prints
lip-only vs combined accuracy. The speak threshold is the lowest at which guesses spoken without
confirmation are still at least 95% correct.

## Rules the code enforces

- Nothing below `speak_threshold` is spoken without the user confirming it.
- Claude's repair is never spoken automatically and never delays the decision.
- If Jev times out (500 ms), the decision uses lip-reading scores alone.
- Claude calls use `fallbacks: "default"`, so a refused request is retried on another model on the server.

## Tests

```bash
.venv/bin/python -m pytest -q tests
```
