# Decisions (append-only log; include the reason)

- **GPU: Vultr A16** on hackathon credits. Backup: GCP L4 (paid), then CPU.
- **Beam 40, not 10.** Beam 10 saved 0.4 s on GPU but cost ~6 points of accuracy.
- **Hold-to-talk key**, not automatic start/stop detection (that's a stretch goal).
- **0.5 s pre-roll / 0.3 s post-roll.** Cut-off clips hurt accuracy in the feasibility test.
- **Claude runs in parallel and is never on the critical path.** Its repair is
  shown as an option only. Model: Claude Opus 5.5, low effort, structured output.
- **Confidence gating.** Low confidence never speaks unconfirmed text.
- **Privacy.** Video is never stored; per-user adapters are private.
- **Score weights** for lip vs Jev are fitted on our 90 feasibility clips.
- **Cut order if behind:** stretch goals → LoRA. Never cut the core loop or the backup video.
- **STT: Cartesia `ink-2`** over its streaming WebSocket. Keeps us on one vendor for the
  Cartesia track; end of turn is a client-side `finalize` after ~0.7 s of silence.
- **TTS: Cartesia `sonic-3.6`**, raw PCM s16le streamed from `/tts/bytes`, so first audio
  plays before synthesis finishes.
- **Confidence = combined probability of the top candidate**: softmax over
  `w_lip·log p_lip + w_jev·log p_jev` (both are probabilities over the same top 10).
- **Jev timeout 500 ms**, then lip-only scores. Keeps a slow Jev off the 1.5 s budget.
- **Claude requests use `fallbacks: "default"`**, so a refused request is retried server-side.
- TODO: confidence thresholds for speak / pick / repeat (run `silentcalls/fit_weights.py` on the 90 clips).
