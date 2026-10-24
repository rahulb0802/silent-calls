# Local capture bundle v1

Export is an explicit user action. It downloads a JSON file, not a video container. Each `frames` element contains a complete JPEG data URL and its monotonic `timestampMs`. Base64-decode the part after `data:image/jpeg;base64,` to obtain the JPEG bytes. Frames are full-face camera images, unmirrored; only the UI preview is mirrored.

Top-level fields: `schemaVersion`, `id`, `width`, `height`, `targetFps`, `pressedAtMs`, `releasedAtMs`, `preRollMs`, `postRollMs`, `endedBy` (`release` or `limit`), and `frames`.

Timestamps use `performance.now()` in the capture renderer, not wall-clock/Unix time. Normalize against the first frame for playback. Capture width is 640px; height preserves the camera's aspect ratio. Requested rate is 25fps; use timestamps and observed rate rather than assuming the hardware delivered every requested frame. Pre/post-roll values report actual sampled boundaries.

Only the latest utterance is retained. Starting another capture replaces it; stopping camera, closing/reloading the widget, or native-hook cancellation discards it. Active frame storage has a roughly 48MiB string-memory limit; holds also stop after at most 30 seconds. The 500ms idle ring is memory-only. No microphone is requested.

Native key messages crossing preload contain only `down`, `up` or `cancel` for the configured key. Other keyboard input is neither forwarded nor stored. The selected key is not suppressed in other applications, so choose one that does not conflict with the meeting app.

This bundle is an inspectable local handoff, not an agreed WebSocket protocol. See backend-contract.md for the proposal that still needs team agreement.
