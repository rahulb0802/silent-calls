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
