# In-app personal voice setup

The onboarding voice step can record a microphone sample or accept an existing audio file. Review the sample, enter a voice name and explicitly agree to send it to Cartesia, then choose **Create my voice**. The backend uses its existing Cartesia API key; the app never asks end users for it.

Microphone recording stops after 15 seconds. Imported files must be under 10 MB and decode to 3–20 seconds of audio. The reviewed recording is converted in memory to mono 44.1 kHz PCM16 WAV. Silent/very quiet audio is rejected. If the system input is BlackHole/VB-Cable, recording attempts to select an available physical microphone instead. The input label appears while recording. Microphone permission, missing devices, recorder errors, provider rejection and connection loss have visible recovery messages.

Only Create my voice uploads the sample. Raw audio is not written to disk by Silent Calls. Cartesia receives the reviewed sample to create the voice; provider retention is governed by its service. The returned voice ID and display name are stored outside the repository in `~/.silentcalls/voice-profile.json` using an atomic replacement. They are loaded on service restart and override the configured fallback voice. This interim service is single-user per computer, not a multi-account voice store. Existing configured voices remain usable without requiring a clone.

Clone requests do not retry automatically. A timeout prevents another clone until the user reconnects to check status. A late success on the existing socket still completes setup. If a provider network request fails after upload, check the Cartesia voice library before creating another clone. Disconnecting does not prove that Cartesia canceled an accepted request.

## Exact restart steps for manual use

1. Quit Electron completely with Cmd+Q (close the floating widget too).
2. If the local Python service runs in a terminal, stop it with Ctrl+C. An app-owned service stops when Electron quits.
3. From the repo root, start the updated local service:
   ```sh
   cd ~/Desktop/Projects/calhacks
   .venv/bin/python -m silentcalls.app
   ```
4. In another terminal, start Electron:
   ```sh
   cd ~/Desktop/Projects/calhacks/client
   npm run dev
   ```
5. Choose **Run setup again** if onboarding already finished, then advance to **Your voice**. Allow microphone access, record 8–15 seconds, stop and listen. Alternatively choose an existing recording.
6. Set the voice name, check the upload consent and click **Create my voice** once. Wait for the personal-voice-ready status. No test phrase is spoken automatically.
7. In the meeting choose BlackHole 2ch as microphone on Mac, or CABLE Output on Windows; leave the meeting unmuted and use normal speakers/headphones. Click **Send this phrase to my meeting**, then confirm someone heard it.
8. After a later Python restart, returning to the voice step should report the saved personal voice. Verify that it speaks with the selected voice. Use advanced **Reconnect and check voice status** to recover from interrupted setup before retrying a clone.

The SSH/GPU tunnel is needed for lip-reading and model enrollment, not for this microphone-to-Cartesia voice setup. GPU enrollment/training remains a separate camera workflow under Training & settings.

## Local bridge implementation

The pre-existing in-progress implementation adds local-only `voice.clone` (name and base64 WAV), `voice.status`, `voice.ready` and `voice.clone.error` messages on the interim port-8765 service. They are not changes to the shared GPU `/ws/session` contract. Main-process IPC carries bounded WAV bytes; provider credentials remain in Python. Optional opener synthesis is lazy, so an unavailable provider or invalid fallback voice does not prevent the local setup service from opening.

Implementation was inspected and edited without tests, builds, previews, live recording, Cartesia requests or training runs, as requested. Manual validation remains with the user.

## Clone rejection follow-up

The original UI hid every non-auth/non-rate-limit Cartesia rejection under a generic message, so it did not establish that the recording was at fault. Clone requests now explicitly use the documented 2026-08-14 API contract and private access independently of the TTS version. No unsupported legacy `mode` parameter is added. Audio conversion preserves 44.1 kHz bandwidth instead of reducing a voice-cloning sample to speech-recognition rate. The bounded local message size now accommodates the corresponding WAV; old 16 kHz recordings remain accepted.

Failures report the HTTP status and bounded, redacted `error`/`message`/`detail` text when Cartesia supplies it. Billing (402), permission/plan (403), format and request rejection are distinguished. No raw response body, headers, API keys or samples are logged. The Electron IPC wrapper is removed from the displayed error. The real cause of the user's reported rejection was not observable in the old message; a successful clone has not been verified.

Onboarding now includes an original conversational read-aloud script with normal-accent/pacing guidance. A script does not guarantee the best imitation; recording quality and natural delivery matter. Current Cartesia guidance: https://docs.cartesia.ai/build-with-cartesia/capability-guides/clone-voices and https://docs.cartesia.ai/api-reference/voices/clone. No tests, app launch or provider calls were performed.
