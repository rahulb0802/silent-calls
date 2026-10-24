# GPU stand-in integration: Person 1

Implemented from the SSH / WebSocket instructions supplied by the user. The draft protocol file is unchanged. This connects the lip-reading-only stand-in, not the eventual combined orchestrator.

## Connections and ownership

- Keep your own SSH tunnel to the GPU open, binding `127.0.0.1:8000` locally. The app does not manage SSH, use private keys, change firewall rules or start remote services.
- Default GPU URL: `ws://127.0.0.1:8000/ws/session?user_id=sarvajith`. Training & settings contains the endpoint and profile ID. Existing explicitly chosen profiles are retained; generated `local-*` placeholders become `sarvajith` for this checkout's integration. Set your actual profile when sharing this checkout.
- Only `ws://127.0.0.1` / `localhost`, `/ws/session` endpoints are accepted by this transport; localhost is normalized to 127.0.0.1 for the existing CSP. No remote public endpoint or CSP wildcard is added.
- Opening the widget does not connect or upload camera video. Click Connect lip-reading to enable the GPU path. Frames are sent only for held utterances, including 500ms pre-roll and 300ms tail.
- Text and quick phrases use the existing local voice service on 8765. Confirming a GPU result can connect/start that service using the existing developer `.env`; no provider keys enter the GPU connection or renderer.

## Wire flow

1. On each socket open: `session.start {user_id,use_adapter:true}`.
2. On hold: `utterance.start {utt_id,fps:25,t_press_ms}`.
3. Synchronous conversion of each captured JPEG data URL to binary bytes, then one binary WebSocket message per frame. Ordered sending includes the existing buffer. Camera requests 640x480 and preserves source aspect ratio at width 640; JPEG quality 0.8. Capture targets 25fps and reports actual fps.
4. After the capture engine finishes post-roll: `utterance.end {utt_id,n_frames,t_release_ms}`. Count is the number of binary messages submitted. Monotonic local timestamps are converted to epoch milliseconds for the wire.
5. Display up to ten candidates and reported confidence/timings/quality. The top three have 1/2/3 shortcuts when the widget is focused outside text inputs; extra guesses and editing are available. Confidence is labeled as reported confidence, not accuracy.
6. A user's explicit pick or edited phrase invokes the existing local `say` path exactly once. No `pick`, quick phrase or audio requests go to the lip-reading-only server. `spoken` from the local service acknowledges completion; it does not prove the other participant heard it.

## Failure and cancellation behavior

Automatic GPU reconnect uses 1/2/4/8/15-second delays after the initial explicit connection. Every new connection gets a fresh session. Broken captures and pending inference are discarded and never replayed. Camera/global key are stopped on lost connection; re-enable them after reconnect. Canceling an unfinished request closes its socket rather than assuming the stand-in implements cancellation. Completed candidates can be discarded locally.

Outgoing queued binary data is capped at 12MiB; excess aborts the capture instead of dropping random frames. A queue display reports browser buffered bytes, not server upload receipt or progress percentage. The GPU reply timeout is two minutes to accommodate venue Wi-Fi. Both the transport and UI restrict stale utterance responses. `no_face`, `crop_failed` and `too_short` have recovery instructions. No API keys, meeting frames or text are logged or written to disk.

The local voice bridge serializes speech globally with typed speech. Missing/busy/disconnected voice or uncertain acknowledgement produces an error; nothing is retried automatically. Already submitted voice output may finish if the GPU connection is subsequently lost. Use the voice panel's disconnect if you need to interrupt local speech.

TODO(hackathon): accept the agreed video-chunk protocol when Person 2 supplies it; binary JPEG encoding is isolated in `lipread-port.ts`. Integrate authenticated profile ownership, enrollment/training, Jev, repair and incoming captions when the appropriate backend endpoints exist. Do not treat this stand-in as the full orchestrator.

## Manual test by the user (not run by the agent)

1. Keep your working SSH tunnel open. The health check already succeeded on your machine.
2. Quit Electron fully, then run `cd ~/Desktop/Projects/calhacks/client && npm run dev`.
3. Open the floating companion. In Training & settings confirm profile `sarvajith` (or your actual server profile), and `ws://127.0.0.1:8000/ws/session`; Save if changed.
4. Back in the widget, click Connect lip-reading. Expect GPU connected. Nothing should be spoken.
5. Enable camera; choose the Logitech camera before enabling if needed. Enable global key, granting Accessibility/Input Monitoring if required.
6. Hold F8, mouth a short phrase, release. Expect the 300ms tail, then uploading/waiting, then candidate buttons. Venue Wi-Fi may take 10 seconds or longer. Capture alone must not speak.
7. Select a correct candidate, or edit the phrase and click Speak edited phrase. The local voice service must be configured as before. In Meet/Zoom choose BlackHole 2ch and keep the mic unmuted. Ask a participant whether they heard the selected text.
8. For keyboard selection, focus the widget outside the editing field and press 1/2/3. These are local widget shortcuts, not system-wide selection keys.
9. Try Type instead / quick phrases to confirm the existing typed path remains accessible.
10. Optional recovery: close the SSH tunnel during a capture, reopen it, and wait for reconnect. The old capture should not be replayed; re-enable camera/global key and capture a fresh phrase.

No tests, builds, typechecks, verification passes, live network requests, app launches or GPU calls were run by the agent. Changes are local, awaiting the user's approval before any push.
