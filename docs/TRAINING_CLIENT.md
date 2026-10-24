# Guided personal calibration

Onboarding now includes personal lip-reading calibration as a required step before the final companion screen. The same guided component is available in Training & settings. It uses Rahul's existing enrollment and training HTTP endpoints; WebSocket message formats are unchanged.

## Consumer flow

1. Start at Welcome and choose your own profile name. Existing explicit profile settings are retained; a fresh install gets a unique local profile rather than another person's name.
2. Enable and frame the camera. Check the virtual microphone, choose it inside the meeting app, and confirm routing.
3. Connect or create your voice; send the test phrase and confirm the meeting received it.
4. Choose 30, 45 or 60 practice sentences. Grant consent once for automatic upload after each recording and training after the chosen accepted count.
5. Press Space to start; mouth the displayed sentence naturally; press Space to stop. The visible button does the same thing. Restart this sentence discards the current recording and begins again. Accepted clips save and advance automatically. Quality rejection keeps the same prompt for a retake. Capture stops at 14 seconds.
6. Once the chosen count is accepted, training starts automatically. The consumer sees a short stage description, a progress bar, elapsed time and an explicitly approximate time estimate. Completion advances onboarding to the companion screen only after a saved adapter and sufficient report clip counts are confirmed.
7. Enable the camera/global key and connect lip-reading in the widget. It uses the saved profile with use_adapter=true. Keep the same camera position as practice. Training does not guarantee perfect recognition; candidates still require confirmation.

## Persistence and recovery

Accepted sentence IDs and mouth crops live on the GPU under the profile. Existing nine-clip enrollment resumes, requiring at least 21 more accepted prompts to reach 30. A prior nine-clip adapter does not bypass the new calibration requirement. Use the same profile to resume. Changing profiles disconnects the widget's old GPU session and disarms capture to avoid using another person's adapter.

Only one unsaved video is retained in renderer memory. No microphone audio is captured during mouth calibration. The video is uploaded after stopping, under the consent given at session start. The GPU temporarily decodes it and retains its mouth crop and sentence text. Pause releases the camera and discards unsaved video; saved clips remain. Reopening a session reads authoritative server progress.

An uncertain upload offers Check saved sentence before retrying. Training POST failures never automatically resubmit: Check progress reads the current job first. HTTP 409 resumes a running job. Polling occurs every 2.5 seconds; network errors offer recovery without claiming the job stopped. Leaving the screen or app does not cancel GPU training. Navigation/settings stay locked while active capture, upload or training is shown; Leave for now remains available after a training interruption.

Training completion counts train + validation + test enrollment clips. The full report is loaded on completion for compatibility with older status summaries that omit validation counts. An adapter and enough accepted clips are required; an unconfirmed result cannot advance onboarding. Technical metrics are absent from the consumer flow.

## Progress and estimates

The bar maps actual reported stages to fixed milestones, and uses actual step/steps within training. It is a stage-based indicator, not an exact end-to-end percentage. Initial training time is labeled roughly 5–15 minutes; it is an unmeasured planning estimate. Once training steps advance, remaining time uses observed seconds per step plus a two-minute evaluation allowance. Shared GPU load, model loading and evaluation can change timing. The bar never advances based only on a timer.

## Server rollout

The local GPU routes now require 30–60 accepted clips to start enrollment training and cap new saved enrollment prompts at 60. Uploads must use a known prompt ID and its canonical sentence. The low-level research trainer remains available for developer experiments; the consumer constraint is enforced at the HTTP entry point. Done-status summaries also include n_val. Rahul must deploy these server files and restart the GPU service to apply the server-side policy. The frontend already enforces the chosen minimum against existing endpoints.

Keep the port-8000 SSH tunnel open. Provider credentials remain in the local Python service; onboarding asks for no API key. The checkout still requires installed Python dependencies and a running/launchable voice service; OS permissions, virtual audio driver installation, and meeting microphone selection require the user's system/application clicks.

## Manual use after restart

Quit Electron completely with Cmd+Q and run npm run dev from client. Keep the local voice service and SSH tunnel available. Walk through the six setup steps. Try Space start/stop, restart, pause/resume and one rejected recording; observe saved count, automatic training and automatic transition after completion. Connect the widget with the same profile and confirm Server details reports the personal adapter on a new phrase.

No tests, builds, typechecks, app launches, live API requests or GPU training were run by the agent for this change, per user instruction. These manual steps are for the user.
