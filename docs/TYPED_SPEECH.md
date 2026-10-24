# Typed speech into a meeting

This increment uses Nilesh's existing **local** protocol (`silentcalls/protocol.py`), unchanged. It does not implement the draft GPU `/ws/session` protocol or send webcam frames. No tests, builds, service calls or app launches were performed for this change, at the user's request.

## Start the local Python voice service

From the repository root, install Python requirements if they are not already installed and configure `.env` as shown by `.env.example`. You need a working Cartesia key, the cloned voice ID, and a virtual output device.

On macOS:

```dotenv
CARTESIA_API_KEY=<your key>
CARTESIA_VOICE_ID=<your cloned voice ID>
VIRTUAL_MIC_DEVICE=BlackHole 2ch
```

Then:

```sh
.venv/bin/python -m silentcalls.app --no-captions --no-jev --no-claude
```

These flags skip call-audio capture and the decision/repair services while retaining real voice output. Do not use `--no-voice` for meeting audio: that mode acknowledges commands without playing sound. Run the service on its default loopback host and port 8765, or choose the matching local port in the app. Restart it after changing environment/device settings.

On Windows use `.venv\Scripts\python` and `VIRTUAL_MIC_DEVICE=CABLE Input`. Existing audio/Python driver prerequisites still apply.

## Start Electron

In another terminal:

```sh
cd client
npm ci
npm run dev
```

If Electron is already running, quit and restart it: main/preload changes do not hot-reload. Open **Meeting audio setup** from onboarding, Training & settings, or the widget's Type to speak panel.

Click Connect, type a phrase, then click **Speak now** or use Cmd/Ctrl+Enter. Quick phrases also require explicit clicks. The camera can remain off. Text is sent to the local service and that existing service sends it to Cartesia for synthesis. API keys remain in the Python process; the renderer never reads `.env`.

## Meeting routing

| Platform | Python output (`VIRTUAL_MIC_DEVICE`) | Meeting microphone | Meeting speaker |
| --- | --- | --- | --- |
| macOS | BlackHole 2ch | BlackHole 2ch | Headphones/normal speakers |
| Windows | CABLE Input | CABLE Output | Headphones/normal speakers |

- Install [BlackHole](https://existential.audio/blackhole/) or [VB-Cable](https://vb-audio.com/Cable/) using the official installer. The app opens setup links only; it does not install drivers or change audio settings.
- Zoom: Settings → Audio → Microphone. [Official Zoom instructions](https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0060836).
- Meet: Settings → Audio → Microphone, with browser microphone permission. [Official Meet instructions](https://support.google.com/meet/answer/10409699).
- FaceTime on Mac: Video menu → Microphone section. [Official FaceTime instructions](https://support.apple.com/guide/facetime/fctm26739220/mac).
- Keep the meeting unmuted when sending generated speech. Own-voice monitoring is not implemented; lack of playback in your headphones does not mean virtual-mic output failed.

Send the visible setup phrase and watch the meeting's mic meter or ask the other participant whether they heard it. The user-confirmed checkbox is a manual check, not automatic audio verification. Incoming-call captions require a separate loopback capture path; keep `--no-captions` until that is configured to avoid feedback.

## Bridge behavior and limits

`client/electron/local-voice.cjs` owns one shared WebSocket to `ws://127.0.0.1:<port>`. Only explicit connect actions open it. A trusted renderer can submit text of 1–5000 characters through narrow preload methods; it cannot supply a remote host or arbitrary network URL. Renderer CSP was not broadened.

The bridge sends `{type:"say",text}` and consumes existing `spoken`, `caption`, and `error` events. It sends no `utterance.*`, video or training data. Socket status and the last three caption lines are shared with the main window and widget. A pending phrase blocks all additional speech submissions across both windows, so there is no hidden speech queue.

The legacy `spoken` event has no request ID. The bridge matches the pending text and supports one in-flight phrase; use a single desktop controller for this development service. A 45-second missing acknowledgement marks output uncertain and keeps retries blocked until completion or explicit disconnect. Reconnect does not replay text. Disconnect closes the socket, allowing the existing server to cancel its connection-owned tasks; sound already heard cannot be undone.

A connected WebSocket does not prove a valid Cartesia voice/device, and a `spoken` acknowledgement does not prove delivery through Zoom/Meet/FaceTime. The setup page deliberately keeps those claims separate. Python still controls output device selection via `.env`; no device-selection or stop command was added to either protocol.
