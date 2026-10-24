# Person 1 scope and push status

This increment can be shared as frontend work in progress. It must not be labeled a completed Person 1 integration. The last UI/integration edits were deliberately not tested or built at the user's request.

| Plan row | Technology | Implemented locally | Still required |
| --- | --- | --- | --- |
| 1. Capture | Electron + getUserMedia + canvas JPEG frames | 25fps request with observed fps, 500ms rolling pre-roll, 300ms tail, replay, explicit export, start/frame/end/cancel callbacks | Approved WebSocket adapter and agreed wire protocol; verify against actual lip-reading input requirements |
| 2. Global hold | uiohook-napi | Configurable key-down/up, repeat gate, isolated native worker, lifecycle cancellation, macOS LaunchServices launcher | Physical-key test with Zoom in front and Windows hardware validation |
| 3. Overlay | Electron always-on-top + React + MediaPipe Tasks Vision | Recording indication, local mouth movement/face framing with user-selected model, caption UI, top-three confirmation UI, quick phrases | Supply the compatible local model; connect MeetingPort to Person 2/3 services; no local TTS or synthetic backend results |
| 4. Main window | Electron + React | Guided setup, camera permission recovery, six calibration clips, held-out split, settings, consent, train/progress/before-after UI | Connect EnrollmentPort to Person 2; actual training and metrics belong to that service |

## Data boundary

No live backend transport is installed. Endpoint settings are inert configuration, not permission to transmit camera data. A future transport needs an approved exact destination and explicit UI connection/upload action. Until then video stays in renderer memory unless the user clicks Export. Runtime WASM is copied from the installed npm package. Face landmark models are selected from a local file; no automatic model download occurs.

The selected hold key is not suppressed in other apps. A 30-second watchdog prevents indefinite capture if release is missed. Stopping the camera, closing/reloading the widget, sleep/lock and app quit disarm the native listener. Camera or native-hook failure reports an actionable status. Input Monitoring/Accessibility are controlled by the user in macOS settings.

## Push contents

Commit source, package.json, package-lock.json, scripts, public documentation, and the existing state/buffer tests. Do not commit node_modules, dist, release packages, environment files, exported captures, logs, or generated model/runtime assets; .gitignore excludes them. No commit or push has been performed by this task.
