# Consumer desktop experience

The cream/forest visual language is retained, with fewer simultaneous decisions and technical settings disclosed on demand. This increment changes renderer interactions and presentation; recognition, decision ranking, voice cloning, speech confirmation, enrollment storage, training and protocol contracts remain the existing implementations.

## Home

Returning users see a calm home screen with one primary Open companion action. Home shows the selected profile and whether a local calibration receipt exists; this does not claim live server connectivity. My voice & practice opens the existing guided calibration and saved completion surface. My words opens the existing personal library. Preferences contains meeting audio and setup review, with profile/endpoint fields inside Advanced connection settings. Saved calibration and environment files are preserved.

## Companion

Four labeled tools replace the long stack of developer panels: Talk, Type, Suggestions and Settings.

Talk leads with a short status, camera preview and Start companion. This explicit action connects the configured voice service and recognition service (including the existing tunnel helper), then enables the camera and requests the global meeting key using the existing permission flow. It never records or speaks just because the widget was opened. A timeout releases the pending start state and allows retry. Pause cancels a pending start intent. Camera remains mounted while switching tools. Mouth a phrase, release, then confirm a candidate to speak; low-confidence repairs are also explicit choices. Alternative candidates, corrections and editing sit under a secondary disclosure. Saved phrases and conversation captions remain accessible below the main action.

Type shows the existing voice composer, quick replies and saved phrases, with a single connection action. Port/disconnect controls and detailed service status move under Voice connection settings. Draft text remains mounted across tool changes. Sending speech remains explicit. Suggestions keeps the existing co-pilot and optional post-call review; tool traces and latency no longer dominate the surface. Provenance remains available. Settings holds camera/key choices, keyboard permissions, audio and personal-library links, plus connection diagnostics, movement feedback and optional MediaPipe model selection. Frame timelines/replay controls are removed from the consumer view; capture buffering and inference remain unchanged.

## Onboarding and motion

The six-step flow remains, including explicit permissions, audio routing, voice consent and 30–60 accepted calibration sentences. An existing voice is presented as ready; creating or changing it is a secondary disclosure. Step transitions use a brief masked reveal, candidates arrive in a short capped sequence, camera activity responds with a small signal, and saved sentence changes animate without delaying capture. Home wave bars animate once rather than continuously. Activity animation pauses when the document is hidden or the Talk tool is hidden. Reduced-motion preferences disable spatial animation and retain clear text/state feedback. No motion adds an artificial wait or fabricates progress.

## Delivery

No tests, builds, typechecks, app launches, previews, screenshots or verification passes were run, per the user's instruction. This is an implementation-only increment. Native permissions, installed audio drivers and existing backend availability are still required; the new interface does not silently install or bypass them. No credentials or .env files were changed.
