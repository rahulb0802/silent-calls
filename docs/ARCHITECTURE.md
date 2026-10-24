# Architecture

## Components
```
ELECTRON APP (laptop)                       VULTR GPU SERVER (A16)
- Capture: Logitech webcam, 25 fps,         - Orchestrator (FastAPI, one WS per session)
  0.5 s pre-roll ring buffer, 0.3 s         - Face detection per frame, as frames arrive
  post-roll after key release               - On utterance end: crop mouth ROI + AutoAVSR,
- Global hold-to-talk (uiohook-napi)          beam 40 → top 10 with scores (~0.9 s)
- Call audio capture → server               - STT on the remote party's audio → captions
- Overlay (always on top): recording          + rolling context (last 2–3 lines)
  light, mouth meter (MediaPipe, local),    - Decision: Jev rescoring ∥ Claude repair
  captions, top-3 picker, quick phrases     - Cartesia TTS (cloned voice) → audio back
- Main window: enrollment, train adapter,   - Enrollment + LoRA trainer (same GPU,
  before/after accuracy, settings             per-user adapters)
- Plays returned voice into virtual mic
  (VB-Cable on Windows, BlackHole on Mac)
```

## Happy-path flow
1. User holds key. Client sends `utterance.start`, then the 0.5 s pre-roll frames,
   then live frames as JPEG binary messages.
2. Server runs face detection on each frame as it arrives (so this cost is hidden).
3. User releases key. Client keeps sending 0.3 s more, then `utterance.end`.
4. Server crops + runs lip-reader → top 10 candidates with lip scores.
5. Decision layer, in parallel:
   - Jev rescoring with call context → combined score → confidence → route
   - Claude repair (only matters when confidence is low)
6. Route = `speak`: server immediately calls Cartesia and streams audio back.
   Route = `pick`: client shows top 3 (+ Claude repair when it arrives); user picks;
   server speaks the pick.
   Route = `repeat`: client asks the user to mouth it again. Nothing is spoken.
7. Client plays audio into the virtual mic; Zoom hears the cloned voice.

## Latency budget (key release → first audio)
| Stage                          | Target  | Measured |
|--------------------------------|---------|----------|
| Post-roll wait                 | 0.3 s   | fixed    |
| Crop + lip-read (beam 40)      | 1.0 s   | 0.95 s   |
| Jev rescoring                  | 0.2 s   | ~0.1 s (warm connection) |
| Cartesia first audio           | 0.2 s   | ~0.09 s (0.2 s cold)     |
| **Total (excl. post-roll)**    | ~1.5 s  |          |

Note: the post-roll adds 0.3 s on top. Decide tonight whether the 1.5 s target
includes it.

## Fallbacks
- GPU: Vultr A16 → Google Cloud L4 → CPU (slow, demo-only).
- If Jev is down or slower than 500 ms: rank by lip score alone; confidence thresholds still apply.
- If Claude is down: no repair option; everything else unchanged.
- If Cartesia is down: TODO: decide (system TTS? show text only?).
