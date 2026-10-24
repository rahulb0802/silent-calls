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
2. On hold, VP8-capable Electron sends `utterance.start {utt_id,fps:25,t_press_ms,encoding:"webm"}`. The camera requests 480p and keeps its source aspect ratio.
3. The existing 25fps frame buffer feeds one canvas MediaRecorder at 2 Mbps. It records the 500ms pre-roll, live frames and 300ms tail as one WebM stream, sent in ordered binary chunks. Browsers without VP8 MediaRecorder support retain the JPEG frame path and omit `encoding`.
4. After post-roll and the encoder's queued frames finish, send `utterance.end {utt_id,n_frames,t_release_ms}`. `n_frames` is the number of camera frames fed to the encoder (or JPEG messages sent in fallback mode). Monotonic local timestamps are converted to epoch milliseconds for the wire.
5. Display up to ten candidates and reported confidence/timings/quality. The top three have 1/2/3 shortcuts when the widget is focused outside text inputs; extra guesses and editing are available. Confidence is labeled as reported confidence, not accuracy.
6. A user's explicit pick or edited phrase invokes the existing local `say` path exactly once. No `pick`, quick phrase or audio requests go to the lip-reading-only server. `spoken` from the local service acknowledges completion; it does not prove the other participant heard it.

## Failure and cancellation behavior

Automatic GPU reconnect uses 1/2/4/8/15-second delays after the initial explicit connection. Every new connection gets a fresh session. Broken captures and pending inference are discarded and never replayed. Camera/global key are stopped on lost connection; re-enable them after reconnect. Canceling an unfinished request closes its socket rather than assuming the stand-in implements cancellation. Completed candidates can be discarded locally.

Outgoing queued binary data is capped at 12MiB; excess aborts the capture instead of dropping random frames. A queue display reports browser buffered bytes, not server upload receipt or progress percentage. The GPU reply timeout is two minutes to accommodate venue Wi-Fi. Both the transport and UI restrict stale utterance responses. `no_face`, `crop_failed` and `too_short` have recovery instructions. No API keys, meeting frames or text are logged or written to disk.

The local voice bridge serializes speech globally with typed speech. Missing/busy/disconnected voice or uncertain acknowledgement produces an error; nothing is retried automatically. Already submitted voice output may finish if the GPU connection is subsequently lost. Use the voice panel's disconnect if you need to interrupt local speech.

The optional WebM field remains marked as a proposal requiring team sign-off in PROTOCOL.md; this implementation does not edit the protocol document. TODO(hackathon): integrate authenticated profile ownership, Jev, repair and incoming captions when the appropriate backend endpoints exist. Do not treat this stand-in as the full orchestrator.

## Manual test by the user (not run by the agent)

1. Keep your working SSH tunnel open. The health check already succeeded on your machine.
2. Quit Electron fully, then run `cd ~/Desktop/Projects/calhacks/client && npm run dev`.
3. Open the floating companion. In Training & settings confirm profile `sarvajith` (or your actual server profile), and `ws://127.0.0.1:8000/ws/session`; Save if changed.
4. Back in the widget, click Connect lip-reading. Expect GPU connected. Nothing should be spoken.
5. Enable camera; choose the Logitech camera before enabling if needed. Enable global key, granting Accessibility/Input Monitoring if required.
6. Hold T, mouth a short phrase, release. Expect the 300ms tail, then uploading/waiting, then candidate buttons. Capture alone must not speak.
7. Select a correct candidate, or edit the phrase and click Speak edited phrase. The local voice service must be configured as before. In Meet/Zoom choose BlackHole 2ch and keep the mic unmuted. Ask a participant whether they heard the selected text.
8. For keyboard selection, focus the widget outside the editing field and press 1/2/3. These are local widget shortcuts, not system-wide selection keys.
9. Try Type instead / quick phrases to confirm the existing typed path remains accessible.
10. Optional recovery: close the SSH tunnel during a capture, reopen it, and wait for reconnect. The old capture should not be replayed; re-enable camera/global key and capture a fresh phrase.

No tests, builds, typechecks, verification passes, live network requests, app launches or GPU calls were run by the agent. Changes are local, awaiting the user's approval before any push.

## Letter hold key

The default is now T, using native `UiohookKey.T` and renderer `KeyT`. Hold-key storage v2 starts with T instead of inheriting the old F8 default; other key choices remain available. Native T with Command/Control/Alt is ignored so normal shortcuts do not start captures. Typing in Silent Calls inputs does not start native capture. The global hook observes and does not suppress the letter in other apps; avoid a focused meeting chat field while holding T. No tests or verification pass were run for this change.

### Hold-key recovery

The focused widget now handles its own key-down/up even when the native hook reports active. Capture transitions are idempotent, so duplicate native/renderer events cannot start two utterances. Visible key feedback explains camera-off, warming-up and previous-request blocks. Global enable moves focus away from editable controls. This fallback only covers the focused widget; holding while Meet/Zoom is focused still requires native key permissions and Enable global key. No tests, app launches or verification passes were run.

## Source alignment after Person 2 code landed

See GPU_CONTRACT_AUDIT.md. The inference JPEG wire flow matches dev_app.py. Active holds now end at14s to stay within reader.py's15s/375-frame cap including pre/post roll. Sampling keeps a25fps timeline rather than skipping duplicate camera timestamps. Server details report the actual adapter or base-model fallback. This section records the earlier JPEG-only integration; the WebM path above supersedes it.
