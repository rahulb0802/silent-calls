# Frontend / Person 2 source contract review

Source review only. No tests, builds, typechecks, app launches, SSH commands, health requests, model calls, speech requests or push performed.

## Compatible current inference path

Compared client/src/services/lipread-port.ts against server/lipread/dev_app.py, reader.py, tools/ws_replay.py and docs/PROTOCOL.md. The frontend's /ws/session endpoint, query/profile identity, session.start/use_adapter, utterance.start/fps, raw binary JPEG sequence, utterance.end/utt_id/frame count, candidates/text/lip_score/confidence/timings/quality and error-code parsing match the actual stand-in server. Additional timestamp/frame-count fields are accepted but not used by the current server. The server defaults to JPEG, so no proposed wire extension is needed.

The stand-in always returns route=pick and has no voice/caption/decision layer. Frontend confirmation correctly routes text to Nilesh's local voice service rather than sending pick or TTS requests to the GPU stand-in. use_adapter=true requests an adapter, but reader.py falls back to the base model when none exists. The UI now displays the server's actual adapter result (null means base model), rather than implying personalized training is active.

## Capture mismatches fixed locally

- reader.py ignores JPEG frames after MAX_FRAMES=375 (15 seconds at 25fps). The frontend previously held up to30 seconds, silently losing later words server-side. Holds now finish after14 seconds, reserving room for .5s pre-roll and .3s tail.
- The JPEG server doesn't resample timestamps. Previously the client only sent frames when video.currentTime changed, so timer/camera rate differences could compress the effective timeline below25fps. Capture now samples at fixed40ms timestamps, repeating the latest image for short gaps. Rendering stalls over250ms abort active captures instead of stretching an arbitrary still frame. Camera stall detection remains in place. The displayed measured rate is labeled sampled fps.

## What remains deliberately separate

- HTTP enrollment/training endpoints are now present, but Workspace still has an undefined EnrollmentPort and six local prompts. The actual server requires at least8 accepted clips, offers60 prompts via /enroll/sentences, returns job_id and state (not the current generic UI status shape), and reports before_wer/after_wer/before_top5/after_top5. WER is not accuracy and must not be mislabeled. No upload/train actions are enabled; this needs a dedicated adapter and UI update.
- HTTP enrollment and webm encoding are labeled PROPOSED/needs sign-off in PROTOCOL.md. No unilateral protocol edit or new mode activation was made here. The existing JPEG mode remains compatible but can be slow on venue Wi-Fi.
- Canceling a session closes its socket and rejects stale results. The server supports utterance.cancel while receiving frames, but awaits finish inline after utterance.end; disconnecting at that point does not necessarily preempt already queued GPU work. It never speaks on its own. Frontend ignores abandoned replies and never replays.
- T/native global capture still needs the user's manual confirmation. Source-level wire compatibility is not evidence that OS permissions or capture are working at runtime.
