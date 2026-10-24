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
