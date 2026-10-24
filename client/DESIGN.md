---
name: Silent Calls
description: Calm light onboarding and a compact dark meeting companion.
colors:
  accent: "#315e4d"
  accent-hover: "#234c3d"
  canvas: "#f7f8f4"
  sidebar: "#eef1e9"
  text: "#253d36"
  muted: "#60736b"
  line: "#dce3db"
  progress-active: "#e0e8d9"
  widget: "#1c2624"
  widget-text: "#ecf1e9"
  widget-line: "#35403c"
  hold: "#c9dda9"
  hold-hover: "#dcebc5"
  held: "#e0bcb0"
  candidate: "#2e3d34"
  candidate-border: "#516449"
  candidate-text: "#e0ebd8"
  focus: "#88bfa4"
  status: "#9ec58d"
  paused: "#d8b06a"
  error: "#9c3d30"
  white: "#ffffff"
typography:
  display:
    fontFamily: "DM Sans, sans-serif"
    fontSize: "clamp(36px, 4.2vw, 60px)"
    fontWeight: 500
    lineHeight: 1.08
    letterSpacing: "-0.04em"
  widget-title:
    fontFamily: "DM Sans, sans-serif"
    fontSize: "26px"
    fontWeight: 500
    lineHeight: 1.08
    letterSpacing: "-0.035em"
  body:
    fontFamily: "DM Sans, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.8
  button:
    fontFamily: "DM Sans, sans-serif"
    fontSize: "12px"
    fontWeight: 500
rounded:
  button: "7px"
  progress: "8px"
  camera: "15px"
  preview: "16px"
spacing:
  widget-body: "22px"
  column-gap: "45px"
  page-inset: "45px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.white}"
    typography: "{typography.button}"
    rounded: "{rounded.button}"
    padding: "14px 18px"
  button-primary-hover:
    backgroundColor: "{colors.accent-hover}"
  hold-button:
    backgroundColor: "{colors.hold}"
    textColor: "#253829"
    rounded: "{rounded.button}"
    padding: "13px 12px"
  hold-button-held:
    backgroundColor: "{colors.held}"
  candidate:
    backgroundColor: "{colors.candidate}"
    textColor: "{colors.candidate-text}"
    rounded: "{rounded.button}"
    padding: "11px"
---

# Design System: Silent Calls

## Overview

Silent Calls pairs the user-approved calm light onboarding with a compact dark meeting widget. Muted green surfaces, generous onboarding space, and restrained line icons make the core action easy to find. The widget compresses this language into a focused companion beside a meeting.

**Key Characteristics:**
- Soft green neutrals and forest green actions.
- Large conversational onboarding headlines; small, dense widget controls.
- Explicit demo and service status beside the relevant interaction.

## Colors

Forest green is the primary action color. The light canvas and sidebar distinguish workspace from progress navigation; muted text supports instructions and secondary labels. Borders provide quiet separation. The dark widget uses pale green text, a light green hold control, and a warm held state. Green and amber status dots always appear with status text. Red is used for error copy and the practice recording action.

## Typography

DM Sans is bundled locally in weights 400, 500, 600, and 700. Most interface text uses 400 or 500; branding and active progress use 600. Headlines balance their text and preserve intentional line breaks. The onboarding lead is limited to 40ch. Widget instructions use 12px text at 1.7 line height; status and secondary controls use 9–11px. Keyboard badges inherit DM Sans rather than switching to monospace.

## Layout

The main app uses a 255px sidebar and flexible content area. An 88px top bar sits above a centered two-column content area, capped at 1300px with a 45px gap and 45px horizontal inset. Copy and visual occupy equal columns. The footer separates navigation with a top border.

At 1050px and below, the sidebar becomes 215px, content uses 30px horizontal padding and a 26px gap, and the headline becomes 40px. At 720px and below, the layout stacks, the progress list and sidebar note disappear, the headline becomes 42px, visuals cap at 420px, and the footer sticks to the bottom. From 1400px, content uses 70px padding, an 80px gap, and 64px headlines. The native main window starts at 1160×800 with a 900×690 minimum, so the narrow stacked layout primarily serves browser previews.

The native widget is a non-resizable, frameless 390×600 always-on-top window. Its header is 59px high and draggable; controls opt out of dragging. Its body has 22px padding. The browser popup also requests 390×600.

## Elevation & Depth

Most surfaces are flat, separated by tone and one-pixel borders. The onboarding sample widget alone floats with a shadow (`0 24px 55px -22px #19332669`) and a −3° rotation. The live widget has no CSS shadow.

## Shapes

Buttons and candidate rows have gently rounded corners. Progress selection is slightly softer; camera and illustration panels use the largest corners. Circular status dots and numbered progress circles provide compact state cues. Camera framing uses a dashed oval guide.

## Components

- **Primary and text actions:** Filled forest green advances setup; a quieter text action goes back. Hover darkens the filled action. Disabled buttons use 0.45 opacity and a not-allowed cursor. Recording disables setup navigation. Practice can be skipped, and voice setup can proceed without speech.
- **Progress navigation:** Five ordered stages show active and completed treatment; the current stage has `aria-current="step"`. These rows are indicators, not clickable controls.
- **Camera panel:** Off, loading, on, and recoverable error states begin with an explicit Enable camera action. Video is mirrored and requests no audio. Camera tracks stop on dismissal or unmount. Camera errors are announced as alerts; the framing guide is decorative.
- **Hold control:** Pointer press captures the pointer; release, cancellation, or blur ends capture. While the widget is focused, Space starts on keydown and finishes on keyup. A focused hold button also supports Enter. Global keydown ignores form controls and buttons. These are focused-window shortcuts, not system-wide shortcuts.
- **Candidate review:** Demo states are ready → capturing → processing → choosing → speaking → ready; Pause enters paused and Resume returns to ready. Three candidates support click or keys 1–3 when focus is outside form controls. Try again returns to ready. Quick phrases work only in ready. Processing lasts 900ms; selected text previews for 1800ms with no voice output. Selection and footer actions return focus to the widget container.
- **Feedback:** The widget heading and last preview use polite live regions. Decorative waveforms are hidden from assistive technology. Icon-only controls have accessible labels. Buttons and links have a 3px focus outline with 4px offset. Background/color transitions last 150ms; busy waveform bars pulse over 700ms. Reduced-motion preference removes animations and transitions.

## Do's and Don'ts

- Do preserve the light onboarding and dark widget distinction.
- Do keep keyboard focus visible and communicate status with text.
- Do label demo behavior and disconnected services where they appear.
- Don't imply sample candidates are camera inference or spoken audio.
- Don't require audible speech to complete onboarding.

## Person 1 local workspace and capture extensions
The main window exposes Training & settings at `#/workspace`. It uses the existing cream/forest system, two desktop columns, native form controls, six calibration prompts, and distinct training/held-out clips. Training progress and accuracy render only adapter-reported values. The live widget uses a 390px-wide window up to 740px tall; its body scrolls while its header and footer stay visible. Local camera replay, MediaPipe mouth feedback and backend-controlled conversation UI share the body. The old sample flow remains at `#/demo-widget`; live capture never fabricates guesses.

The meter samples normalized lip separation changes with MediaPipe at five passes per second, separately from the 25fps capture target. It is movement feedback, not speech recognition. Model selection is local and in memory. Callback interfaces carry utterance IDs, frames and cancellation to a future approved adapter. Backend controls are disabled without one. The current native launcher uses macOS LaunchServices to preserve the app permission identity.

## Typed speech and meeting audio setup

The live widget leads with a camera-independent Type to speak form. Its explicit Connect, Speak now and quick-phrase controls share one local voice connection with the main setup window. The dark form inherits widget colors and uses the existing pale-green primary action. The new `#/audio-setup` main-window route inherits the cream/forest workspace, with numbered routing instructions on the left and the light speech form on the right. Native textarea/number controls have visible focus rings, connection and pending/uncertain states use text alongside status dots, and long phrases wrap. Setup confirmation is labeled as the user's manual observation, never an automatically verified route. No actual UI verification was performed for this increment, per user instruction.

## Guided first-run setup

The default route now presents five focused steps: welcome, optional camera framing, virtual microphone / meeting routing, real voice connection and a final companion summary. It preserves the cream/forest identity and gives each step one primary footer action. Functional camera, automatic voice connection, bounded local service startup and a user-triggered setup phrase replace placeholder voice/practice claims. Optional details disclose advanced troubleshooting only when needed. Provider credentials never appear in onboarding. Progress persists without secrets; route delivery is confirmed by the user, never inferred from a socket acknowledgement. Native approvals and driver installation remain explicit. No tests, builds, previews or service launches were run for this change at the user's direction.

## GPU lip-reading connection

The live widget leads with an explicit GPU connection action, followed by pending upload/inference state and confirmed candidate selection. Top three results support local 1/2/3 keys; remaining results and reported server details are disclosed on demand. An editable phrase is a separate explicit speech action. Typed speech remains available under Type instead / quick phrases. Existing dark widget colors, spacing, focused controls and native text inputs are preserved. No preview or verification pass was run, per user instruction.

## Personal library

Vocabulary & saved phrases opens a dedicated cream/forest main-window route with two labeled forms and editable lists. Both start empty. Compact dark saved-phrase buttons appear directly in the meeting widget; matching vocabulary corrections are visually separate from original GPU candidates and only populate the editor until explicitly spoken. Library edits persist locally and update across windows. Native inputs, readable wrapping, labeled edit/delete controls, focus rings and visible storage errors preserve the existing interaction patterns. No preview or verification pass was performed, per user instruction.

## Live enrollment and training

Training & settings now leads with the enrollment workflow, with optional connection settings above and a fixed-profile session during capture/upload. Camera and clip review sit beside consent, authoritative accepted-count, training stages and results. Prompts come from the GPU; the server chooses held-out splits. WER is explicitly lower-is-better and may exceed100%, top-five match is higher-is-better. Progress uses real steps only during training and an indeterminate state while loading/evaluating. Local clips are reviewed before explicit upload and server quality rejection leads to a retake. Existing cream/forest typography and control styling is preserved. No visual or runtime verification was performed per user preference.

## Personal voice onboarding completion

The voice step now records or imports a reviewed audio sample, asks for explicit upload consent, and creates a Cartesia voice through the local service without exposing provider keys. Recording status, playback, voice-name input, recoverable errors and status reconnect use the existing cream/forest controls and responsive layout. An existing configured voice remains usable; a newly created voice ID/name persists outside the repo. No automated or visual validation was run per user request. See docs/VOICE_ONBOARDING.md for the exact restart/manual-use flow.

## Required calibration onboarding (current behavior)

The six-step setup adds a full-width calibration surface within the existing cream/forest design. A compact 30/45/60 sentence selector precedes consent. During capture, a mirrored webcam preview sits beside one large sentence and the saved-count progress bar; Space toggles capture, Restart begins the same sentence again, and accepted uploads advance automatically. Narrow widths stack the camera and prompt. Recording state uses explicit text, elapsed seconds and a stop icon. Processing uses a restrained progress bar and one short stage description, with approximate remaining time and elapsed time. Training starts automatically and successful completion moves to the final companion step. Current setup requires camera, routing/test-phrase confirmation and calibration; earlier optional/eight-clip documentation is historical. Focus rings, real buttons, alerts and reduced-motion-compatible native progress controls preserve the existing accessibility patterns. No preview or runtime verification was performed, per user instruction.


## Direct voice setup continuation

The required meeting test-phrase panel and its acknowledgement checkbox have been removed from onboarding at user request. Voice setup now continues once a configured or newly created voice is connected and idle. The earlier meeting-device selection step remains; the final summary describes that selection without claiming audible delivery. Voice creation uses one column without an empty test panel. Detailed audio setup still offers manual speech checks. No tests or previews were run.
