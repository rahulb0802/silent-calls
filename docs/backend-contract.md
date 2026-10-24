# Proposed backend boundary

This is a proposal for team agreement, not an implemented wire protocol.

Use one session-scoped WebSocket managed outside the UI components. Keep credentials in Electron's main process. Do not add service API secrets to Vite variables: those are public renderer assets.

Client events:

- `utterance.start`: sessionId, utteranceId, timestamp, userId (once authentication exists).
- Binary JPEG frames at 25 fps, associated with the active utterance. Define framing and backpressure before implementation. Pre-roll: 0.5 seconds; post-roll: 0.3 seconds.
- `utterance.end`: utteranceId, timestamp.
- `candidate.confirm`: utteranceId, candidateId. Backend must verify the candidate belongs to that utterance.
- `utterance.cancel`: utteranceId.

Server events:

- `session.ready`
- `utterance.processing`: utteranceId.
- `utterance.candidates`: utteranceId, candidates [{ id, text, confidence }], requiresConfirmation. Define/calibrate confidence semantics before presenting percentages.
- `speech.started` / `speech.finished`: utteranceId.
- `error`: utteranceId if applicable, code, recoverable, user-facing message.

Low confidence waits for explicit confirmation. Ignore results from canceled or stale utterances. Pausing cancels active capture, pending inference and speech. On disconnect stop capture/output and expose reconnect. Do not move from a result to speaking on a timer: replace the demo timer with actual backend/audio acknowledgements.

Enrollment needs a separate consent and upload contract. The current local practice capture is not training and must not imply an adapter has been created. Voice enrollment must support people unable to provide a new spoken recording.

Integration entry points: connect the real frame pipeline in `src/capture/use-capture.ts` to the agreed transport and display returned candidates in `src/widget.tsx`. The sample candidate flow is preserved in `src/demo-widget.tsx`. Actual virtual microphone output and global key press/release are native work, not renderer-only React features.

## Current implementation handoff

The live frontend now exposes `MeetingPort` and `EnrollmentPort` in `src/services/meeting-port.ts`. They are interfaces only: no network implementation is installed. `MeetingWidget` accepts an optional meeting service; `Workspace` accepts an optional enrollment backend. Both default to local-only operation and disabled backend actions.

Capture callbacks provide an utterance ID allocated at key-down, start metadata, pre-roll and live/tail frames in order, a final clip and cancellation. Frame timestamps use the capture renderer's monotonic clock. The adapter must bound its send queue, cancel on disconnect, validate incoming events, and ignore stale utterance IDs. Candidate UI always asks for explicit confirmation. Speech status is displayed only after the voice service reports it; the frontend does not synthesize or route voice.

Enrollment passes labeled Blob clips with a train/eval split, profile ID and AbortSignal to the adapter. The backend supplies job status/progress and optional beforeAccuracy/afterAccuracy in [0,1]. Two held-out sentences must be excluded from adapter training. The backend must authenticate the user and enforce adapter ownership; a frontend profile ID is not authentication. Stopping the frontend's wait aborts its requests but does not claim to cancel a server training job.
