# Silent Calls

Electron + React + TypeScript frontend for Cal Hacks 13.0.

## Develop

Use Node 22.12+ (Node 24 LTS recommended) and npm.

```sh
npm install
npm run dev
```

`npm run dev` starts Vite at http://127.0.0.1:5173 and opens Electron. React changes reload automatically. Restart the command after editing `electron/`.

Browser-only preview: `npm run dev:web`. Open `http://127.0.0.1:5173/#/widget` to preview the widget. Browser popups cannot provide Electron's always-on-top behavior.

```sh
npm test
npm run build
npm start
```

`npm start` opens the last production build. Stop development with Ctrl+C.

## Real camera + global hold

1. Run `npm run dev`, finish or skip setup, and open the meeting widget.
2. Select a camera while it is off, then click **Enable camera**. Wait about half a second for the buffer to warm up.
3. Select **F8**, **F9**, **F10**, or **Right Ctrl**. Click **Enable global key**.
4. On macOS, use **Permissions** to open Privacy & Security → Accessibility and enable **Electron** (development) or **Silent Calls** (packaged). If requested, allow Input Monitoring too. Restart Electron after changing permissions if it still reports missing access. On a Mac keyboard you may need **Fn + F8** to send the actual function key rather than media controls.
5. Focus Zoom or another app. Hold the selected key while silently mouthing a phrase, then release it. The widget adds 300ms of post-roll and displays the clip.
6. Click **Replay**, scrub individual frames, and inspect individual frames in memory. No lip-reading or synthesized audio is connected yet.
7. **Stop camera** disarms the global hook, stops the webcam, and discards the in-memory clip. Disable before using the selected key for other purposes. The key remains visible to the foreground app; it is not suppressed.

Camera capture requests 25fps and includes 500ms pre-roll plus 300ms post-roll. The UI reports observed fps and actual buffer duration. All frames stay in memory and are never exported; there is no upload destination. A lost release is bounded by a 30-second timeout and a frame-memory cap. Closing/reloading the widget, sleeping/locking the computer and quitting disarm the hook.

Without native permission, the button and focused-window key remain available to test capture. Browser-only previews cannot run a global keyboard hook. On Windows, test the app alongside Zoom running at the same privilege level; Windows hardware and packaging have not yet been verified.

The original sample candidate-picker UI is preserved at `http://127.0.0.1:5173/#/demo-widget` for browser design tests. The native widget now uses actual capture and never substitutes sample guesses for your video.

See [Person 1 progress](docs/person-1-status.md), [export format](docs/capture-format.md), and [proposed backend boundary](docs/backend-contract.md).

## Project map

- `electron/main.cjs`: native windows, permissions and IPC handlers.
- `electron/preload.cjs`: narrow `window.desktop` API.
- `src/onboarding.tsx`: setup flow and in-memory practice recording.
- `src/camera.tsx`: webcam lifecycle and permission recovery.
- `src/widget.tsx`: live capture UI, native hold subscription, replay.
- `src/capture/`: timestamped rolling buffer and camera lifecycle.
- `electron/global-hold.cjs`: supervised native hook and lifecycle.
- `electron/hook-worker.cjs`: native key-down/up listener, isolated from the app.
- `src/demo-widget.tsx`: previous sample candidate-picker UI.
- `src/demo.ts`: sample candidates and guarded state transitions.
- `src/styles.css`: visual tokens, main app and widget styles.
- `docs/backend-contract.md`: proposed integration boundary for teammates.

## Package

```sh
npm run package:mac
npm run package:win
```

Outputs go in `release/`. These are unsigned development packages. For distribution, set up platform signing, macOS notarization and proper app icons. Build and test Windows packages on Windows; Windows has not been tested in this setup. On macOS, allow Camera in System Settings → Privacy & Security when prompted. Packaged builds include camera/microphone usage descriptions.

## Person 1 workspace and integration boundary

Open **Training & settings** from setup or the live widget. It contains six prompted calibration recordings (four training, two held out), explicit future upload consent, service URL/profile settings, adapter-training progress, and before/after accuracy fields. Values are never fabricated. With no backend adapter installed, upload/training and voice actions are disabled.

The live widget has caption, top-three candidate, confirmation and quick-phrase UI alongside real camera capture. `src/services/meeting-port.ts` defines `MeetingPort` and `EnrollmentPort`; wire implementations into the optional `service` and `backend` component props once the team supplies approved endpoints and agrees its protocol. No WebSocket or HTTP upload transport is included in this revision. Saving endpoint values performs no network request.

MediaPipe Tasks Vision provides mouth movement and face-framing feedback. `npm install` copies the installed WASM runtime locally; `npm run prepare:assets` repeats that copy without downloading a model. Select a local `face_landmarker.task` file in the widget or enrollment screen. The model stays in memory. Obtain the compatible model from the [official MediaPipe Face Landmarker guide](https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker/web_js). No model is downloaded automatically.

Use `npm run dev` on macOS: its LaunchServices launcher gives Electron its own permission identity. `npm start` uses the same launch method for the existing production build. The production renderer uses a restricted `silent://app` protocol so local model/WASM resources can load without opening arbitrary file paths.

This is an integration-ready frontend increment, not a completed end-to-end Person 1 delivery. The latest UI/adapter changes have not been built or tested, at the user's request. See `docs/person-1-status.md` for remaining work.

## Combined repository
Run client commands from `client/`; run Python commands from the repository root. Meeting-video export was removed to follow the root AGENTS.md memory-only rule; any older export description above is superseded. The former backend README is at `../docs/COMPONENTS_7_9.md`. Read `../docs/MERGE_AUDIT.md`: the interim Python service and draft GPU protocol are not interchangeable, and the frontend has no transport adapter installed.

## Local typed speech and quick phrases

**Meeting audio setup** now opens a BlackHole/VB-Cable guide and a real local voice panel. The same panel appears above camera capture in the floating widget. It connects through Electron main-process IPC to Nilesh's service on `ws://127.0.0.1:8765` (local port configurable), using the existing `say`/`spoken` messages. No camera permission is needed for typed speech. The page includes separate Zoom, Meet and FaceTime instructions and an explicitly clicked setup phrase.

Start the Python service from the repository root with real voice enabled: `.venv/bin/python -m silentcalls.app --no-captions --no-jev --no-claude`. Then restart Electron to load the new main/preload bridge. See [full setup](../docs/TYPED_SPEECH.md). Earlier statements that all voice controls are disabled are superseded for typed speech; the future lip-reading adapter remains disconnected. No tests/builds were run for this feature.

## Guided first run

Restart Electron after updating the main/preload files. The default setup route now guides camera framing, BlackHole/VB-Cable detection, meeting routing and voice connection. On Your voice, the app automatically reuses an existing local service or starts the checkout’s installed `.venv` voice-only service. Provider credentials stay in the developer-managed backend environment / root `.env`; onboarding never asks users to enter a key. Run setup again from the final page to revisit the flow. Packaged installers still need a bundled Python runtime; see [guided onboarding](../docs/GUIDED_ONBOARDING.md).

## GPU lip-reading over SSH

Keep the working port-8000 SSH tunnel open. In the widget click **Connect lip-reading**, enable the webcam and global key, hold T while mouthing a phrase, then release. Choose one of the GPU's candidates or edit it before speaking. The local voice service still outputs to BlackHole / VB-Cable; the GPU stand-in does not synthesize audio. Endpoint/profile settings are in Training & settings, defaulting to the loopback session endpoint and `sarvajith` for this checkout. See [manual steps and protocol boundaries](../docs/GPU_LIPREADING_CLIENT.md). Implementation is untested at the user's request and is not pushed until approved.
