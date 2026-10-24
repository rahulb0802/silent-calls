# Spec: Call audio, decision layer, voice output (components 7–9) — Person 3 (Nilesh)

## Scope
STT for the remote party, rolling context, Jev rescoring, confidence routing,
Claude repair, Cartesia TTS, and the orchestrator that wires them to the WebSocket.

## Status
Built in `silentcalls/` (see README.md), currently run as a local service on
`ws://127.0.0.1:8765` with its own interim messages (`silentcalls/protocol.py`).

To do, to match PROTOCOL.md v0.1:
- [ ] Build `tools/mock_server.py` first (see Orchestrator below).
- [ ] Move into `server/`: take captions audio from `/ws/call-audio` instead of a
      local loopback device, and send TTS PCM back over `/ws/session` instead of
      writing to the virtual mic.
- [ ] Rename messages and fields: route `choose` → `pick`, `confirm` → `pick`,
      caption speakers `them`/`me` → `remote`/`self`, add `rationale` to repair.
- [ ] Measure Jev and Cartesia first-audio latency and fill in ARCHITECTURE.md.
- [ ] Run `fit_weights.py` on the 90 clips and commit `weights.json`.

## Call audio + captions (`silentcalls/captions.py`)
- Consume /ws/call-audio PCM and stream it to Cartesia STT:
  `wss://api.cartesia.ai/stt/websocket?model=ink-2&encoding=pcm_s16le&sample_rate=16000&cartesia_version=2026-08-14`,
  `X-API-Key` header. Send ~100 ms binary chunks.
- After ~0.7 s of silence following speech, send the text message `finalize`. Concatenate
  `is_final` transcript deltas as-is (no trimming between them); on `flush_done`, emit the
  line as a `caption`.
- Keep the last 2–3 final lines from both speakers as `context`.

## Decision layer (`silentcalls/decision.py`)
Input: `LipResult.candidates` (top 10) + `context`.
1. **Jev** (TypeSafe): `POST https://api.typesafe.ai/v1/systemone`,
   `Authorization: Bearer $TYPESAFE_API_KEY`. One `choice` question; the candidates
   are the criteria (`c0`…`c9`) and the context is the `state`:
   ```json
   {"model": "jev-latest", "state": "<context + lip-reading note>",
    "questions": {"reply": {"type": "choice",
      "instructions": "Which option is the user most likely trying to say next?",
      "criteria": {"c0": "<candidate 0>", "c1": "<candidate 1>"}}}}
   ```
   The response has `answers.reply.probabilities` (one per option, summing to 1) and
   `answers.reply.confidence`. Timeout 500 ms → lip-only.
2. **Combined**: `p_lip` = softmax of the lip log-probs over the top 10;
   `p_jev` = Jev's probabilities. `combined = softmax(w_lip·log p_lip + w_jev·log p_jev)`.
   `lip_score` = lip log-prob, `lm_score` = `log p_jev` in the protocol message.
3. **Confidence** = `combined` of the top candidate. Route `speak` at or above
   `speak_threshold`, `pick` at or above `choose_threshold`, otherwise `repeat`.
   Weights and both thresholds are fitted on the 90 clips by `fit_weights.py`
   (speak threshold = lowest at which auto-spoken guesses are ≥95% correct).
4. **Claude repair**, launched at the same time as Jev and never awaited by the fast path:
   - Model `claude-opus-5-5`, `effort: low`, structured output
     (currently `{sentence, confident}`; add `rationale` to match the protocol).
   - Prompt includes the top 10 candidates and the conversation context, and explains
     viseme confusions (p/b/m, f/v, t/d/n, k/g). Stay close to what the candidates support.
   - `fallbacks: "default"` (beta `server-side-fallback-2026-07-01`).
   - Send as a `repair` message when ready. Cancel it if the utterance is already spoken.

## Voice output (`silentcalls/voice.py`)
- Cartesia `POST https://api.cartesia.ai/tts/bytes`, `Authorization: Bearer`,
  `Cartesia-Version: 2026-08-14`, model `sonic-3.6`, the user's cloned `voice_id`,
  `output_format: {container: raw, encoding: pcm_s16le, sample_rate: 48000}`.
  Stream PCM back as `audio.start` / binary / `audio.end` as soon as the first bytes arrive.
- Voice cloning: `POST /voices/clone` (multipart `clip`, `name`, `language`) →
  `id`. CLI: `python -m silentcalls.voice clone me.wav --name You`.
- Optional opener "I'm using a speech assistant", pre-rendered at startup, toggled in settings.
- Emit a `caption` with `speaker: "self"` for every spoken line.

## Orchestrator
Owns /ws/session and /ws/call-audio, calls `LipReader`, runs the decision layer,
and records every timing field in the protocol. Also provide
`tools/mock_server.py`, which speaks the same protocol with canned candidates and
a static WAV, so Person 1 is never blocked. **Build the mock first, tonight.**

## Done when
For a recorded clip and a fake context, the server returns the correct `route`
and audio, with all timings populated.
