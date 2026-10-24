# Combined frontend + nilesh source audit

Audited sources: frontend `a8c5d62`, nilesh `d883697`, and existing main `a000f8c` (adds the direct-merge Git workflow). This was static source review only. No tests/builds or live device/provider/network integration checks were run.

## Findings fixed in the combined tree

- Conflicting layout and setup instructions: desktop source now lives in `client/`, backend stays in `silentcalls/`, Python tests remain at root, and both sets of setup instructions are retained. Ignore rules cover both stacks, recordings, environment files and generated artifacts.
- Meeting video could be written to disk using Export, contradicting the root agent guide. Removed that control and file-generation function; capture/replay remain in memory. Enrollment remains separate and requires explicit consent for a future upload adapter.
- Local service accepted malformed JSON shapes and raw webcam bytes as though they were decision messages. Added explicit object/text checks and an actionable rejection for binary video. No message fields or protocol routes were renamed.
- Local service launched unowned tasks: exceptions were detached and work could continue after socket disconnect. Requests are bounded, tracked, canceled and awaited on disconnect. Pipeline repairs are cleaned up on cancellation/close. Voice cancellation aborts the local stream before releasing the output lock.
- Browser pages from unrelated web origins could issue speech requests to the loopback service. Added a local-desktop origin gate. This is not authentication and the legacy shared pipeline remains single-user only.
- Caption audio used an unbounded queue. Bounded it to twenty 100ms chunks and drop the oldest unsent audio when full.
- Malformed Jev probabilities/nonfinite lip scores could corrupt routing. Reject invalid candidates and fall back to lip-only scoring when probability values are invalid.
- Global capture lacked the client spec's Escape cancellation. Added Escape handling during a native hold; cancel disarms capture rather than completing the utterance.

## Blocking integration gaps (not represented as complete)

1. There is no real GPU lip-reading service or enrollment API in either branch.
   **Update (Person 2):** now in `server/lipread/` (LipReader, enrollment + training HTTP endpoints) and
   `server/lora/`, running on the Vultr box; `server/lipread/dev_app.py` serves the lip-reading half of
   PROTOCOL.md until the orchestrator exists. See docs/specs/lipread.md and docs/RESULTS.md.
2. The frontend `MeetingPort`/`EnrollmentPort` interfaces are not bound to a transport. The existing interim Python service is not the draft GPU orchestrator, so merging files does not make frames flow into lip-reading.
3. The existing service's `decision`, `confirm`, `say`, `spoken`, `them/me`, `utterance_id` messages differ from the draft's `candidates`, `pick`, `quick_phrase`, `audio.*`, `remote/self`, `utt_id` messages. `docs/PROTOCOL.md` and `silentcalls/protocol.py` were kept unchanged. Agree the adapter mapping with the team before wiring it.
4. The live widget currently requires explicit candidate confirmation. The draft supports high-confidence auto-speech, a repeat route and optional Claude repair; these need a protocol-approved frontend adapter/UI extension.
5. The legacy local service shares a transcript and voice across its connections. Keep it on loopback for one user. It must not be exposed as a multi-user/cloud service without session/user isolation and authentication.
6. Virtual-mic output/call-audio capture currently belong to Python. The future remote orchestrator design expects the desktop client to handle returned PCM and call-audio upload; those client implementations are absent.
7. A local MediaPipe model must be supplied by the user. Provider model IDs/SDK compatibility, calibration thresholds, actual Zoom behavior and Windows packaging remain unverified. Default confidence thresholds are provisional until fitting real data.

## Merge/default branch

Both feature branches and the existing main history are preserved. Main is updated with a normal push, never force-pushed. Setting GitHub's default branch also requires repository administration permission; write permission alone may be insufficient.
