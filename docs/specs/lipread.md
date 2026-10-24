# Spec: Lip-reading service + LoRA (components 5–6) — Person 2 (Rahul, to confirm)

## Scope
Server-side face detection, mouth crop, AutoAVSR inference, per-user adapters,
and enrollment training. Exposes Python functions to the orchestrator; it doesn't
own the WebSocket.

## Interface (in-process, called by the orchestrator)
```python
class LipReader:
    def on_frame(self, utt_id: str, jpeg: bytes) -> None
        # decode + face/landmark detect immediately; store landmarks in memory
    async def finish(self, utt_id: str, user_id: str) -> LipResult
        # crop mouth ROI using stored landmarks, run model with beam 40,
        # return top 10. Frees all frames for utt_id afterwards.
    def cancel(self, utt_id: str) -> None

@dataclass
class LipResult:
    candidates: list[tuple[str, float]]  # (text, log-prob), sorted best-first, len ≤ 10
    crop_ms: int
    lipread_ms: int
```

## Requirements
- Use the same AutoAVSR checkpoint and preprocessing as the feasibility test.
  Results must match it on our 90 clips (overall ≈32% top-1, 48% top-5).
- Frames live in memory only and are deleted after `finish`/`cancel`.
- Load the adapter for `user_id` if one exists and `use_adapter` is true; cache it on the GPU.
- Target: `finish` ≤ 1.0 s on the A16 for a ~3 s clip.
- Also dump the 90 feasibility clips' top-10 candidates as JSONL
  (`truth`, `context`, `candidates: [{text, score}]`) for `silentcalls/fit_weights.py`.

## LoRA trainer
- Input: a user's enrollment clips plus transcripts. Hold out ~20% of sentences.
- Output: `adapters/<user_id>/` plus a JSON report `{before_wer, after_wer,
  before_top5, after_top5, n_train, n_test}` for the main window.
- Exposed as HTTP: `POST /enroll/{user_id}/clip`, `POST /train/{user_id}`,
  `GET /train/{user_id}/status`. TODO: add these to PROTOCOL.md.
- **Hard stop Saturday 6 pm.** If it isn't working, ship without it.

## Done when
`python -m server.eval --clips data/feasibility/` reproduces the feasibility table,
and per-stage timings are printed.
