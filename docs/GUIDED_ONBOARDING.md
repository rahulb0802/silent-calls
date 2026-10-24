# Guided onboarding

The default Electron route has five steps. Welcome explains typed speech; Camera is optional and uses the existing memory-only preview; Meeting audio opens official installers, checks enumerated input devices on explicit microphone permission, and gives platform/app-specific instructions; Your voice automatically connects the local service and sends only a confirmed setup phrase; Your companion shows actual connection status and the user's audio-route confirmation.

Progress is saved under `silent-calls:setup-step:v2`. Legacy onboarding completion still opens the final step; Run setup again restarts the flow. No completion flag implies a live model, training, camera or audio route.

## Native service convenience

`setup-service.cjs` tries the existing localhost service first. If unreachable, it can spawn the checkout's fixed `.venv` Python executable with `-m silentcalls.app`. It does not invoke a shell, install dependencies or accept an executable path from the renderer. Host/port are fixed to loopback/8765. Output is ignored to avoid leaking provider details. Existing external services remain owned by their terminal; only the managed child is stopped at Electron quit. Connection attempts are bounded and never replay speech.

On entering Your voice, the app automatically connects or starts the service once per visit. Connection failures expose a retry button; speech still requires the user to click Send. No provider account details appear in onboarding. The Python service uses the developer-managed process environment or root `.env`; no key is copied into the renderer, bundle, localStorage or repository. The old encrypted credential form and save IPC have been removed. Existing encrypted files from earlier versions are not read or migrated.

For distribution to other users, provider credentials belong in an authenticated hosted backend; do not ship a shared API key inside an Electron build. Automatic per-user voice cloning is separate unfinished work. This change reuses the configured backend voice.

## Remaining packaging work

TODO(hackathon): distribute a signed Python runtime/service with the Electron installer; the managed launcher is deliberately unavailable in packaged builds until then. Finish code signing/notarization and stable Keychain identity. Driver installers and meeting microphone selection still need user clicks; the UI opens the official instructions and detects devices but does not install drivers or control other apps. Voice cloning still happens in Cartesia. Webcam model/enrollment/training integration remains separate.

No tests, builds, previews, actual credential saves, process launches or live device checks were performed while implementing this change, per the user's instruction.
