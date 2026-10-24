# Silent Calls

A desktop app for taking calls without speaking. Mouth words at a webcam; the planned lip-reading service returns candidates, the decision layer uses conversation context, and a cloned voice speaks into a virtual microphone.

This repository combines the `frontend` desktop work and `nilesh` components 7–9. Their histories are preserved. **They are not connected end to end yet.**

## Layout

- `client/`: Electron + React + TypeScript onboarding, webcam capture, native hold-to-talk and meeting widget.
- `silentcalls/`: Python local captions, decision and Cartesia voice service.
- `scripts/fake_lipreader.py`: feeds candidate sentences to the local decision service; it is not a webcam lip-reader.
- `docs/`: architecture, team specs, protocol draft and merge audit.
- `tests/`: Python tests. Client state/capture tests live under `client/tests/`.

## Start the desktop client

```sh
cd client
npm ci
npm run dev
```

Enable the camera in the widget. Choose F8/F9/F10/Right Ctrl, grant Electron Accessibility permission on macOS, then enable the global key. Mac keyboards may require Fn with the function key. Escape during a global hold cancels capture and disarms the camera/key.

Capture requests 25fps with 500ms pre-roll and 300ms post-roll. The widget reports observed timing, supports in-memory replay, and discards meeting video when the camera stops. Meeting-video export was removed to follow the repository's memory-only rule.

For mouth movement feedback, select a compatible local MediaPipe `face_landmarker.task` file. `npm ci` copies the installed WASM runtime locally; it does not download a model. The main window's **Training & settings** page contains calibration, held-out clips, adapter-training and accuracy UI. Backend actions remain disabled without an approved adapter.

See [client details](client/README.md) and [Person 1 status](client/docs/person-1-status.md). Moving the app into `client/` changes its development executable path; macOS may require you to grant Accessibility to the Electron app in `client/node_modules/electron/dist/` again.

## Start components 7–9

From the repository root:

```sh
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
cp .env.example .env
# Fill in your own API keys and device/voice settings in .env.
.venv/bin/python -m silentcalls.app
```

For decision-only development without audio devices:

```sh
.venv/bin/python -m silentcalls.app --no-voice --no-captions
```

The service listens on `ws://127.0.0.1:8765`. Audio is captured and played locally by Python; this is a single-user development service, not an authenticated multi-user deployment. See [audio routing, cloning and service usage](docs/COMPONENTS_7_9.md).

## Integration boundary

The local service implements the interim messages in `silentcalls/protocol.py`. The GPU orchestrator's draft `/ws/session` and `/ws/call-audio` messages are in [docs/PROTOCOL.md](docs/PROTOCOL.md); that contract was preserved unchanged. They are different protocols. Typed speech uses a dedicated loopback bridge for the interim service; video and enrollment still have typed interfaces without installed transports.

Still needed: the real GPU lip-reading/orchestrator endpoints, approved transport adapters, per-user authentication/ownership, enrollment/training endpoints, and final client-side audio routing when the orchestrator returns PCM. Do not connect the current local decision service as though it accepts webcam frames.

See the [combined audit](docs/MERGE_AUDIT.md) for fixes and remaining gaps. No tests, builds, provider calls or device checks were run during this merge, at the user's request.

## Typed speech while the lip-reading model trains

Open **Meeting audio setup** in Electron. Connect to Nilesh's local voice service and use Type to speak or quick phrases, with the camera off if desired. The service outputs to BlackHole (Mac) or VB-Cable (Windows); select that device as the meeting microphone.

For the voice-only path, run from the repository root:

```sh
.venv/bin/python -m silentcalls.app --no-captions
```

Configure your real Cartesia key, cloned voice ID and `VIRTUAL_MIC_DEVICE` in `.env` first. In another terminal run `cd client && npm run dev`. This new typed-speech bridge connects only to localhost and sends no camera data; the GPU/lip-reading/enrollment adapters remain separate unfinished work. See [typed speech setup](docs/TYPED_SPEECH.md) for routing, Windows commands and acknowledgement limits. The feature has not been built, tested or launched during implementation.
