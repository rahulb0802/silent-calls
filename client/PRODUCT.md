# Silent Calls
<!-- impeccable:product-schema 1 -->
## Platform
web
Desktop renderer hosted in Electron on macOS and Windows.
## Stack
User requested Electron + React. TypeScript and Vite support development.
## Users
People taking calls without audible speech, including people who cannot speak.
## Product Purpose
Mouthed webcam input becomes candidate sentences and eventually synthesized speech in a meeting.
## Operating Context
Guided onboarding and an always-on-top meeting widget with hold-to-talk and candidate confirmation.
## Capabilities and Constraints
Frontend-first build; backend inference, voice cloning, training, virtual microphone routing, and system-wide hold detection are integration work. Demo data must be identified. Low confidence requires confirmation. Camera access is explicit.
## Brand Commitments
Working name: Silent Calls. User selected direct implementation with a calm light main app and compact dark widget.
## Product Principles
Keep the core loop obvious. Preserve control over what is spoken. Make errors recoverable. Never imply mock inference is real.
## Accessibility & Inclusion
Keyboard controls, readable contrast, reduced motion, and speech-optional onboarding.

## Person 1 implementation boundary
Capture and native key hooks are implemented. MediaPipe mouth feedback accepts a local model file. The main app includes calibration recording, service settings, and adapter-training/accuracy UI; live widget includes caption/candidate/quick-phrase controls. Network transports are not installed. MeetingPort and EnrollmentPort define the integration interfaces; backend actions stay disabled until adapters are supplied. No automatic model download or video upload occurs.

## Local typed-speech increment

Typed speech and quick phrases connect, after an explicit user action, to Nilesh's loopback voice service on 127.0.0.1 with a configurable local port (default 8765). The existing Python service sends confirmed text to Cartesia and handles virtual-device output. Webcam frames and training video never use this bridge. Provider keys remain server-side. The BlackHole/VB-Cable setup screen explains output-device and meeting-microphone selection for Zoom, Meet and FaceTime. No driver installation or audio setting is changed automatically. Connection and acknowledgement are not treated as proof that the other participant heard audio. Lip-reading and training adapters remain unconnected.

## Guided onboarding increment

First-run setup leads to real typed speech, with optional camera framing and later model enrollment. In a repository checkout with Python dependencies installed, the desktop can start the fixed voice-only service on user request and stop only its own child at app quit. Existing externally started services are reused. Cartesia credentials stay in the developer-managed backend environment / root `.env`. The onboarding never asks users for provider keys; entering the voice step automatically attempts a connection without speaking. A signed bundled Python runtime, automatic driver installation, in-app voice cloning, and automatic selection inside meeting apps are not shipped. Camera permission, temporary microphone enumeration and sending speech require explicit user action.

## GPU stand-in client

The widget can explicitly connect to the SSH-tunneled lip-reading service on loopback port 8000. Held captures send ordered JPEG frames with the existing pre/post buffers. The lip-reading-only stand-in provides candidates, not speech; the user selects or edits a phrase and the local voice service speaks it. Interrupted capture/inference never replays. The socket reconnects automatically, but the user re-enables camera/global capture after a lost connection. Model training, enrollment uploads and the full decision/caption orchestrator remain separate integrations.

## Personal vocabulary and phrases

Users can maintain a locally persistent personal library, initially empty. Explicit alternate readings produce reviewable spelling corrections for top-three GPU candidates; terms can also be inserted into the editable phrase. This is not model training or server vocabulary biasing. Saved phrases speak their exact text only on explicit click through the existing local service. No provider credentials, automatic utterances, seeded personal names or new backend protocol fields are introduced. The library is shared between app windows at the same origin and survives restarts until app data is cleared.

## Live training increment

User-authorized integration now uses the existing GPU enrollment and training HTTP endpoints, preserving the server contract. Eight accepted clips unlock explicit training; progress can be resumed across page/app visits, since data and the job live on the GPU. Recording does not upload, upload requires consent, and unuploaded video stays in memory. Actual held-out WER, top-five match and per-sentence results are displayed without inventing accuracy or guaranteed improvement. Backend identity/authentication and GPU process scheduling remain server responsibilities.

## Personal voice onboarding completion

The voice step now records or imports a reviewed audio sample, asks for explicit upload consent, and creates a Cartesia voice through the local service without exposing provider keys. Recording status, playback, voice-name input, recoverable errors and status reconnect use the existing cream/forest controls and responsive layout. An existing configured voice remains usable; a newly created voice ID/name persists outside the repo. No automated or visual validation was run per user request. See docs/VOICE_ONBOARDING.md for the exact restart/manual-use flow.

## Required guided calibration (current behavior)

The current onboarding supersedes the earlier optional-camera/eight-clip flow: Welcome/profile, camera, meeting audio, voice/test phrase, 30–60 mouth-calibration sentences, then companion. Users choose 30/45/60 accepted prompts, consent once, use Space start/stop, and advance automatically after each accepted upload. Training begins automatically at the chosen count and advances setup only after a saved adapter and enough reported training/validation/test clips are confirmed. Saved server enrollment resumes by profile; fresh profiles are unique. Consumer progress shows brief stages, a stage-based bar and clearly approximate timing, without model metrics. The same saved profile drives widget inference with use_adapter=true. OS permissions and meeting routing remain explicit. No tests or runtime validation were run for this increment.


## Direct voice setup continuation

The required meeting test-phrase panel and its acknowledgement checkbox have been removed from onboarding at user request. Voice setup now continues once a configured or newly created voice is connected and idle. The earlier meeting-device selection step remains; the final summary describes that selection without claiming audible delivery. Voice creation uses one column without an empty test panel. Detailed audio setup still offers manual speech checks. No tests or previews were run.

## Remembered personal setup

A completed onboarding session is remembered per profile and enrollment server. Subsequent launches land in the workspace, with an explicit action to open the meeting widget. Successful calibration stores a local completion receipt (count, goal and date), so the calibration view shows saved readiness rather than asking the user to record again. Accepted data and trained weights remain on the GPU. Reviewing setup preserves that training, and new profiles retain the full first-run flow. OS/device capture permissions remain explicit. No tests or runtime validation were run for this change.
