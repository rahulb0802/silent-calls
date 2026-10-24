# Spec: Electron client (components 1–4) — Person 1 (Sarva)

## Scope
Capture, global hold-to-talk, overlay, main window, virtual-mic playback, and
call-audio upload. Server internals are out of scope; talk to it only via PROTOCOL.md.
Develop against `tools/mock_server.py` until the real server is up.

## Requirements
1. **Capture**: Logitech webcam at 25 fps. Keep a 0.5 s ring buffer at all times.
   On key press, send `utterance.start`, flush the buffer, then stream frames live.
   On release, keep streaming for 0.3 s, then send `utterance.end`.
   JPEG quality ~80, resolution TODO (the face must fill enough of the frame for the crop).
2. **Hold-to-talk**: uiohook-napi global key that works while Zoom is focused.
   Key configurable in settings. Esc during hold sends `utterance.cancel`.
3. **Overlay** (always-on-top, frameless, small): recording light; mouth-movement
   meter computed locally with MediaPipe Face Mesh (lip-gap ratio, no network);
   last 2–3 captions; top-3 picker with keys 1/2/3 plus the Claude repair as option 4
   when it arrives; quick-phrase buttons; "please repeat" state for `route: repeat`.
4. **Main window** (React): enrollment flow (show prompted sentence → record →
   coaching tips like "exaggerate your lip movement"), "Train adapter" button,
   before/after accuracy display, settings (server URL, key, voice, opener toggle).
5. **Audio out**: play `audio.start` → binary PCM → `audio.end` into the virtual mic
   device (VB-Cable / BlackHole), selected by device name in settings.
6. **Call audio in**: capture the call's output audio, resample to 16 kHz mono
   PCM16, and stream it to /ws/call-audio.

## Known risks (check in the first hour)
- Windows camera conflict: Zoom and our app both want the webcam. TODO: test
  whether both can open it; if not, Zoom uses a different camera or none.
- Call audio needs a second virtual device (or Stereo Mix on Windows) separate from
  the virtual mic, or our own voice loops back into the captions. Setup is in README.md.

## Done when
Holding the key while Zoom is focused, mouthing "sounds good", and releasing
produces the cloned voice heard by the other Zoom participant (using the mock
server first, then the real one).
