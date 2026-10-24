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

## Status (Person 2)
Built in `server/lipread/` and `server/lora/`; results of every run are in `docs/RESULTS.md`.

| file | what |
|---|---|
| `server/setup_gpu.sh` | one-time GPU box setup: Python 3.11 venv, AutoAVSR code + weights in `/opt/lr` |
| `server/lipread/reader.py` | `LipReader` / `LipResult` as specified above (plus `n_tokens`, `quality`, `error`, `timings_ms`) |
| `server/lipread/frames.py` | JPEG/video decode, MediaPipe face detection, mouth crop, input-quality flags |
| `server/lipread/model.py` | model loading and N-best decoding |
| `server/lipread/routes.py` | enrollment + training HTTP endpoints (see PROTOCOL.md, HTTP section) |
| `server/lipread/dev_app.py` | stand-in WebSocket server (lip-reading half of the protocol) until the orchestrator exists |
| `server/eval.py` | the eval: whole-clip path, live (streamed JPEG) path, decoder sweeps, `--dump-fit` for `fit_weights.py` |
| `server/lora/` | LoRA wrapper, training data, trainer with before/after report |
| `tools/ws_replay.py` | sends recorded clips to a server over the WebSocket in real time; measures end-to-end delay |

Orchestrator integration:
```python
from server.lipread import LipReader
reader = LipReader()                      # once at startup (loads + warms up, ~15 s)
reader.on_frame(utt_id, jpeg)             # every binary frame
res = await reader.finish(utt_id, user_id, use_adapter)   # on utterance.end
if res.error: send error(code=res.error)  # "no_face" | "crop_failed" | "too_short"
else: decision(res.candidates)            # [(text, log_prob)] best first
reader.cancel(utt_id)                     # on utterance.cancel / disconnect
```
`res.timings_ms` has `crop_ms`, `lipread_ms` (= encode + beam), `face_wait_ms`.

Notes for the other components:
- The server env pins `numpy<2` (mediapipe 0.10.14 needs it); `silentcalls/` runs fine on it.
- JPEG frames must arrive at 25 fps (the model doesn't resample). Send ≤720p; 480p is enough (see RESULTS.md).
- On a slow uplink (the venue Wi-Fi), send a MediaRecorder webm stream instead: `utterance.start` with
  `encoding: "webm"`, then call `reader.on_chunk(utt_id, data)` for each binary message (not `on_frame`).
- Decoder settings: beam 40, LM weight 0.2, CTC weight 0.1 (the `DecodeConfig` default; RESULTS.md section 4).
- On a 2-GPU box, live inference uses `cuda:0` and LoRA training `cuda:1`, so training never slows a call.
