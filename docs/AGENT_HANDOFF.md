# Silent Calls — agent handoff

## User, scope, and working rules

- User is Person 1 (Sarvajith): desktop frontend, webcam capture, global hold-to-talk, onboarding, overlay, enrollment/settings UI. Rahul owns Person 2 GPU lip-reading/training. Nilesh owns Person 3 voice/decision/captions.
- Real repo: `/Users/sarvajithkarun/Desktop/Projects/calhacks`, remote `https://github.com/rahulb0802/voice.git`. The Codex chat cwd `/Users/sarvajithkarun/Documents/ChatGPT/calhacks13` is NOT this repo. Desktop path may need filesystem escalation.
- Repeated explicit preference: do NOT run tests. For recent work user also said no double-checking; do not run builds, typechecks, app launches, live GPU calls, speech requests or verification passes without revised authorization. Source inspection needed for implementation is fine. Report unverified work honestly.
- Do not connect to Chrome/browser UI. User runs manual flows and sends screenshots.
- Commit sequentially by feature, not one large mixed commit. This preference is in AGENTS.md. Short-lived feature branches; fetch/rebase onto origin/main before integrating; no force push. No PR needed. Latest request authorizes pushing ALL current work.
- Keep provider keys in ignored root `.env`; do not print, read out, embed, or commit secrets. Do not access private SSH key material. Do not send teammate messages without user authorization.
- No speech unless explicitly confirmed (or approved high-confidence backend flow). Current GPU stand-in always needs a user choice. No meeting video on disk/logs; capture memory only. Enrollment upload is separately consented and unfinished.
- Read root AGENTS.md, docs/ARCHITECTURE.md, docs/PROTOCOL.md and relevant docs/specs. Do not unilaterally alter protocol. User-supplied GPU instructions authorize the existing stand-in integration described below.

## Product and hardware

Silent Calls lets someone mouth a phrase at a webcam, choose a recognized sentence, and speak it in a cloned voice into an ordinary meeting app via a virtual microphone. Typed speech and saved phrases also work without the camera. macOS/Windows Electron + React + TypeScript + Vite; Python local voice service. User has a webcam (Logitech planned) and is 3D-printing a stand. Calm cream/forest main window, dark green floating always-on-top widget, DM Sans and Lucide icons. Preserve the visual world; docs/client design sidecar is known stale. No screenshots/previews have been run for recent changes.

## What actually worked vs what is not verified

- User successfully typed a sentence and heard their Cartesia cloned voice in a REAL Google Meet call via BlackHole 2ch. This is the strongest confirmed end-to-end path.
- User created a private voice in Cartesia, saved their real key/voice ID in root `.env`, installed Python dependencies, and installed BlackHole. Do not ask them to repeat account setup or paste secrets.
- User opened the SSH tunnel and got `{"ok":true,"device":"cuda:0","load_s":5.5}` from localhost:8000/health.
- After GPU integration user said it was "decent", but reported F8/T not triggering capture. T mapping and focused-widget fallback/feedback were changed afterward. Latest global key behavior remains unconfirmed. Do not claim it was tested or solved on their machine.
- Personal library was just added at user's request, intentionally empty. No tests or runtime verification.
- All recent implementation changes were source-only, not built/tested/launched by the agent.

## Repository / runtime layout

- `client/`: Electron+React frontend. `client/electron/main.cjs`, `preload.cjs`; renderer `client/src/main.tsx`.
- `silentcalls/`: Nilesh's existing interim local components 7–9. `app.py`, `voice.py`, `pipeline.py`, `config.py`.
- `.venv/` is root Python environment, installed by the user. `client/node_modules/` installed. No new dependencies for recent features.
- `docs/PROTOCOL.md`: draft full orchestrator wire contract; the actual local voice protocol differs (`silentcalls/protocol.py`). Both preserved.
- `server/` GPU code was NOT in GitHub when Rahul sent instructions; don't assume server source is available locally. `EnrollmentPort` UI is not connected to live training.
- macOS Electron launcher scripts use LaunchServices to preserve permission identity. Fully quit/restart Electron after main/preload changes; Vite hot reload alone is insufficient.
- Packaged app scheme is `silent://app/index.html`; development is loopback Vite. Renderer CSP already permits `ws://127.0.0.1:*`. No broad remote CSP relaxations were added.

## Launch commands for the USER (don't execute automatically)

From root:
```
cd ~/Desktop/Projects/calhacks
.venv/bin/python -m silentcalls.app
```
In another terminal:
```
cd ~/Desktop/Projects/calhacks/client
npm run dev
```
No sudo. If setting up a fresh machine: `python3 -m venv .venv` then `.venv/bin/python -m pip install -r requirements.txt`. User has already done it. `config.py` uses `load_dotenv()`: root `.env`, NOT `.env.local`.

Root `.env` contains CARTESIA_API_KEY, CARTESIA_VOICE_ID and VIRTUAL_MIC_DEVICE=BlackHole 2ch on Mac. Windows voice output is CABLE Input and meeting microphone is CABLE Output. Mac meeting mic is BlackHole 2ch; meeting stays unmuted and speaker/headphones stay normal. Generated voice may not be audible locally. Incoming captions need a separate loopback path; currently disabled to avoid feedback.

## Local voice integration

- `client/electron/local-voice.cjs`: shared main-process WebSocket to 127.0.0.1, default 8765. IPC is restricted to app windows; no provider keys or frames cross this bridge.
- Existing input `{type:"say",text}`; output `spoken {text,first_audio_ms}`, caption and error. Legacy output has no request ID. One in-flight speech globally; text/revision matching acknowledges it. No automatic speech retry/replay. Reply timeout creates an uncertain state that blocks duplicates until completion or explicit disconnect.
- `client/electron/setup-service.cjs`: on request tries existing service, otherwise starts fixed checkout `.venv` Python with voice-only CLI args, fixed loopback host/port and platform virtual output. No shell/executable path from UI; child output ignored. Only its own child is killed on app quit; externally started service belongs to its terminal.
- Startup is unavailable in packaged builds: signed bundled Python/runtime is TODO. Installer is not turnkey yet. Does not install driver/change meeting settings itself.
- Earlier encrypted API-key form was REMOVED after user objected. No onboarding key inputs or save-credential IPC remain; backend `.env` is used automatically. Do not reintroduce asking end users for developer provider keys. Distribution later needs authenticated hosted provider access, not embedding a shared key in the desktop bundle.
- `use-local-voice.ts` shares status with main/widget. `components/voice-panel.tsx` handles typed text, fixed quick phrases, connection and acknowledgements.

## Routes and onboarding

- Default: guided five steps welcome / optional camera / meeting audio / voice / companion. Progress in `silent-calls:setup-step:v2`; legacy completion key `silent-calls:onboarding`.
- Voice step attempts connect/start automatically once per visit, never automatically speaks. Setup phrase has an explicit Send button; user manually confirms meeting delivery.
- `#/widget`: live companion; `#/demo-widget`: explicitly separate demo; `#/workspace`: training/settings; `#/audio-setup`: detailed routing guide; `#/library`: personal words and phrases.
- `showMain` route allowlist includes workspace, audio-setup and library. main/preload/API type must remain in sync.
- Audio setup opens allowlisted official docs (BlackHole/VB-Cable/Zoom/Meet/FaceTime/Cartesia). Driver enumeration asks temporary microphone permission on button click, saves no audio. Native approvals/installer/meeting mic choice require user interaction.

## GPU / SSH details

User owns `~/.ssh/silentcalls`; Rahul added the PUBLIC key to root access on 144.202.96.192. Never read or copy their private key. User keeps this tunnel open:
```
ssh -i ~/.ssh/silentcalls -N -o ExitOnForwardFailure=yes -L 127.0.0.1:8000:localhost:8000 root@144.202.96.192
```
GPU health has already succeeded. Endpoint: `ws://127.0.0.1:8000/ws/session?user_id=<profile>`. Default profile is `sarvajith` for this checkout; explicit user profiles retained, old generated `local-*` placeholders migrated. Personal library remains EMPTY despite this existing backend profile default.

Rahul's supplied wire contract:
1. `session.start {user_id,use_adapter:true}` on every connection.
2. `utterance.start {utt_id,fps:25,t_press_ms}` on hold.
3. One binary JPEG per frame at 25fps target, ~480p, quality .8, including .5s pre-roll.
4. .3s after release, `utterance.end {utt_id,n_frames,t_release_ms}`.
5. Receive candidates top ten `{text,lip_score}`, confidence/timings/quality. Stand-in route is always pick. Errors `no_face`, `crop_failed`, `too_short`.
6. No audio, captions, Jev or repair from this endpoint. GPU candidates are not spoken until user selects; selected text uses local Nilesh service.
Venue Wi-Fi uploads can take 10s+. Do not interpret that as measured model latency. Future webm encoding requires agreement; not implemented. Server may restart.

## Capture and transport code

- `client/src/capture/buffer.ts`: FrameBuffer, 25fps target, .5s pre-roll/.3s tail, 30s hold and memory bounds, monotonic timestamps. Meeting clips replay in memory only, never exported.
- `capture/use-capture.ts`: webcam width640, height480 ideal, source aspect ratio preserved, JPEG .8. Camera loss stops hook. MediaPipe mouth feedback is separate and needs a local .task model; not required for GPU JPEG capture. WASM assets are copied by existing postinstall.
- `services/lipread-port.ts`: MeetingPort implementation. Explicit Connect lip-reading required; constructor doesn't open network. Accepts only ws loopback /ws/session (localhost normalized to127), injects configured profile in query/session. Frame-byte conversion isolated for future encoding replacement.
- Browser WebSocket preserves ordered JPEG/end messages; max12MiB browser send buffer aborts instead of dropping frames. Epoch wire timestamps derived from performance.timeOrigin. Actual sent frame count included. Queue display isn't server receipt progress.
- Two-minute GPU response timeout; reconnect delays1/2/4/8/15s. Lost/in-flight captures discarded, never replayed. Camera/global key stop on lost connection and user must re-enable. Cancel pending inference closes socket instead of assuming server supports cancel. Stale utterance results ignored.
- `use-meeting-port.ts`: shared UI phase/state, top10 candidates/metadata, upload queue and confirmation. `widget.tsx` renders top3, extra guesses, editable text, reported confidence/timings/quality and local captions. Never labels server confidence as accuracy.
- Clicking a candidate / Speak edited phrase sends exactly one explicit local voice request. It can connect/start the local voice service. Voice error/uncertain acknowledgement is not retried. Already submitted speech can finish after GPU connection loss.

## Current hold-key situation (important)

- User requested T instead of F8. Native allowlists include T and UiohookKey.T exists in installed uiohook-napi. Renderer uses KeyT. Hold selection storage is v2 so earlier F8 default doesn't persist into T rollout.
- `electron/hook-worker.cjs`: native key repeat gate in `hold-key.cjs`; only selected key events leave worker. Cmd/Ctrl/Alt+T ignored. Escape cancels held capture. Keys aren't suppressed in other apps: T will type in a focused meeting chat field.
- `electron/global-hold.cjs`: uiohook isolated child, mac Accessibility check, start/status callbacks, safety timeout, stop on sleep/lock/window loss. Still needs user Enable global key, Accessibility/Input Monitoring and full Electron restart.
- Latest fix: focused widget handles its own down/up EVEN IF native hook reports active. Begin/release transitions idempotent. Native events ignore focused app text fields. Visible key feedback explains camera-off/warming/previous-request blocks; global enable focuses widget away from inputs. Clicking/holding the on-screen capture button provides a separate path.
- No latest user confirmation that T works globally. Don't mistake fallback-in-focused-widget for proven capture while Meet is focused. Ask for actual widget state if debugging; no speculative claim that permissions are solved.

## Personal vocabulary and saved phrases (latest feature)

- User explicitly requested no prefilled name or data. Both collections empty by default.
- `services/personal-library.ts`: versioned localStorage `silent-calls:personal-library:v1`. Up to100 vocabulary entries and50 phrases; term max120, up to8 comma/newline-separated alternate readings; phrase max5000. Add/edit/delete, validation, read latest before mutation, no optimistic success before storage write. Invalid stored data is reported without overwriting. Custom same-window and storage cross-window events update all views. Same-origin local persistence survives restarts, not app-data clearing or origin changes; no cloud backup.
- `src/personal-library.tsx`: #/library management page. Link from workspace/widget. Each word has correct spelling + optional Often mistaken for entries. These are explicit user mappings, NOT fuzzy inference, GPU hints or training.
- Candidate suggestions use escaped case-insensitive Unicode-aware word-boundary matching on alternate readings in the top3 candidates. Original results retained. From your vocabulary suggestion copies corrected text into editor only; Speak edited phrase is still required. Terms also appear as insertion buttons.
- `components/saved-phrases.tsx`: exact-text one-click speech buttons (widget, VoicePanel, optional library preview). Explicit click can connect/start local voice service then say; respects native one-flight guard. Never automatically retries. Save/edit/delete never speaks.
- Neither vocabulary list nor aliases go to GPU; only explicitly selected speech text reaches local service/Cartesia.

## Git / docs navigation

Feature commits on `codex/gpu-lipreading-integration` at handoff creation:
- fb0defa GPU transport / capture integration
- 1719971 candidate selection and edited speech UI
- e89ad36 GPU documentation
- 34eb4d1 T hold key
- 0a7c9c9 focused fallback/key feedback
- 9b06de8 persistent personal library
- 614abc2 library UI / confirmed corrections
- dbb0000 library docs
A handoff-doc commit follows, then latest user-authorized integration/push to main. Refer to actual Git state rather than assuming hashes after any rebase.

Useful docs: TYPED_SPEECH.md, GUIDED_ONBOARDING.md, GPU_LIPREADING_CLIENT.md, PERSONAL_LIBRARY.md, MERGE_AUDIT.md, root/client READMEs, client/DESIGN.md, client/PRODUCT.md, client/docs/person-1-status.md. Some historical sections describe prior intermediate states; newest feature-specific docs and implementation are more specific. The GitHub default branch was previously `nilesh`; the gh account lacked admin permission to change it. Main has combined frontend/Nilesh work; repository owner must change default if still needed.

## Remaining work / next-agent priorities

1. Let user manually confirm latest T/global capture behavior. No agent tests unless authorized. Keep on-screen hold and typed/saved phrase fallbacks usable.
2. Integrate finalized model/enrollment/training endpoints once Rahul pushes code. No fake accuracy/training claims. Incoming captions/Jev/Claude/full GPU orchestrator are not done on client.
3. Improve per-user vocabulary biasing with backend only after agreeing schema; current suggestions are explicit local mappings.
4. Finish real installer distribution: bundled signed Python service/runtime, code signing/notarization, stable app permission/Keychain identity, guided driver flow. Do not call current checkout launcher a standalone packaged runtime.
5. Don't start autonomous agents or unrelated features; user's requests and source instructions govern scope.

## Final sync note

During the authorized final push, `git fetch` found shared main had advanced from 439950b to 62e3800 and discovered `origin/p2/lipread-service`. All nine local feature/doc commits rebased onto the new origin/main without conflicts. Their commit hashes consequently changed; use current Git history. The statements above about Person 2 source not yet being pushed describe the earlier implementation context. The next agent should inspect the newly available branch/source before assuming GPU code remains unavailable or planning further backend integration. No runtime verification or model calls were performed during this sync.

## Latest: finish in-app voice recording and cloning

The interrupted work was the onboarding microphone-to-Cartesia personal voice flow, distinct from GPU camera enrollment/LoRA training. It is now implemented with local clone IPC, mono-WAV conversion in memory, review/consent, sample limits, microphone/recorder error cleanup, recording duration/input feedback, voice profile persistence in ~/.silentcalls/voice-profile.json, clone timeout/late-success handling and explicit reconnect recovery. Existing backend-configured voices remain usable without forcing replacement. Optional opener TTS is lazy so startup does not require a successful provider request. Shared GPU protocol was not edited. See docs/VOICE_ONBOARDING.md for restart steps. No tests/builds/app launches/live provider calls were made. The Impeccable design sidecar remains stale; it was not regenerated as unrelated work.

## Latest: meeting key and onboarding gates

See docs/MEETING_KEY_SETUP.md. Onboarding now starts at Welcome regardless of saved completion, requires an explicit camera-or-typing choice, audio-device discovery plus meeting-mic confirmation, and a current-visit test-phrase acknowledgement plus heard confirmation. The later-voice bypass is removed. Widget camera enable explicitly arms the global listener after warm-up; native key receipt is distinct from renderer fallback, with macOS Accessibility/Input Monitoring links and background capture scheduling fixes. The app cannot grant OS permissions or unmute Meet. No tests/builds/app launches/live keyboard verification were performed.
