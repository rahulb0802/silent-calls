# Meeting key and required onboarding actions

Onboarding always begins at Welcome when its component opens. Previous saved completion/progress keys do not select the initial step. Continue is gated by explicit actions:

- Camera: successfully open the preview, or explicitly choose Use typing instead of the camera.
- Meeting audio: Check audio device must find BlackHole 2ch/CABLE Output, then confirm that it is selected in the meeting and the meeting is unmuted.
- Voice: connect the local service, use an existing voice or create one, explicitly send the setup phrase during this onboarding visit, wait for the spoken acknowledgement and confirm meeting delivery. An old acknowledgement from a previous phrase cannot unlock the step. There is no Set up voice later bypass.
- Companion: explicitly open the widget. Individual microphone/camera permissions and driver installation remain system/user actions.

## Global T in Meet / Zoom

Enable camera & meeting key is an explicit combined opt-in. Once the camera warms up, the widget arms the existing isolated uiohook-napi listener. Stopping the camera, sleep/lock and lost GPU connection still disarm it; nothing silently rearms after those safety stops. When needed, Enable global key retries listener startup. A native down/up updates the native-listener status separately from focused renderer key events. Listener startup alone is not claimed as successful cross-app delivery. Only the selected key transitions leave the native worker; no unrelated keyboard events are stored or forwarded.

The capture window sets backgroundThrottling=false at construction and keeps the existing webContents setting. Electron also disables renderer background scheduling reductions so camera/frame timers continue when Chrome is foreground. No Chrome automation or meeting API integration is used.

On macOS, enabling the key requests the Accessibility prompt if permission is absent. Separate Accessibility and Input Monitoring links remain available if the listener has not yet received its selected key. Permission changes may require a complete Electron quit/restart; the app cannot grant those permissions itself.

Holding T records webcam mouthing. It does not toggle Google Meet's mic or transmit raw microphone audio. Leave Meet unmuted, with BlackHole 2ch as input (Windows: CABLE Output) and normal headphones/speakers as output. GPU inference runs after release; selecting a candidate sends confirmed speech through the local voice service.

## Manual restart and validation

No agent-run tests, builds, app launches or live key tests were performed.

1. Fully quit Electron (Cmd+Q), then restart `npm run dev` from `~/Desktop/Projects/calhacks/client`.
2. The first screen should be Welcome. Continue should stay disabled on later steps until the actions above are complete.
3. In the widget, connect lip-reading with the SSH tunnel open, then choose Enable camera & meeting key. Wait for a warmed camera and listener-started status.
4. Allow Electron in System Settings → Privacy & Security → Accessibility AND Input Monitoring. If changed, quit and reopen Electron; repeat the explicit camera/key action.
5. Focus the actual Meet call, outside any chat/search text field. Hold T and mouth a short phrase. The widget should report Global T received and Recording, then released/finishing on key-up. If not, report both the native-listener status and the camera error, if any. These changes do not establish that macOS permission delivery is already working.
6. After inference, select a phrase. Another participant should hear the generated voice through the meeting mic. T is not suppressed in other apps, so it can type into a focused chat field.
