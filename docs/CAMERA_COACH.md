# Camera coach

Short tips that make a person's mouthing easier to lip-read: camera view (light, framing, pose, visibility,
stability) and recording timing / pace. It learns from that person's own results which conditions hurt them
and which tips help, and keeps quiet otherwise. Client-only (`client/src/camera-coach/`); no protocol change.

## Where it plugs in

```
webcam → use-capture (25 fps JPEG timeline) ──────────────→ LipreadPort → GPU → candidates (+ quality) → pick
            │ onVideoFrame                                      │ candidates / error code
            ▼                                                   ▼
   mouth-tracking (MediaPipe, ~15/s) ── landmarks ──→ CameraSampler (5/s) → detectors → CoachEngine ─→ overlay
            │ FaceSample (mouth movement, lip gap)                              ▲   ▲
            ▼                                                                   │   │ outcome (top / alt /
       hands-free ───────────────→ utterance analysis (on clip end) ────────────┘   │ edited / rejected / failed)
                                                                         widget confirmPick / retry
```

- **No new model.** The coach reuses the landmark pass hands-free already runs. Pixel statistics come from
  two tiny canvases (the frame at 160×90 and the mouth at 64×32), read five times a second and then thrown
  away. Nothing is stored or sent anywhere.
- **Per-utterance analysis** runs once when a capture ends, and again when the server's `quality` report
  arrives. It uses the hands-free mouth-movement timeline and the camera scores recorded during the clip.
- **Outcomes** come from what the person does with the options. `top` = picked the first option; `alt` =
  picked another; `edited` = typed a change or picked Claude's repair; `rejected` = "Try again" or a
  head-shake. `failed` = the server reported `no_face`, `crop_failed` or `too_short`. Network and server
  failures are not counted against the person.

## Files

| file | what |
|---|---|
| `signals.ts` | `CameraSample`, patch statistics (exposure percentiles, clipping, Laplacian sharpness), face/mouth geometry, roll |
| `detectors.ts` | issue catalog (`ADVICE`: text, category, severity, icon, persistence, camera-setup alternative) and `scoreCamera` (0..1 per issue, baseline-relative where it matters) |
| `utterance.ts` | `analyzeClip`: active mouthing time, jaw swings, onset/tail margins, clipped start/end, too few frames, held too long, low motion; pace, agreement |
| `engine.ts` | `CoachEngine`: EMA smoothing, enter/exit hysteresis (0.65/0.35), persistence, priority (visibility → framing → lighting → posture → stability → timing → pace → articulation), one message at a time, min/max display time, cooldowns, no new non-serious tips while mouthing; `adviseOnResult` / `adviseOnOutcome` |
| `profile.ts` | per-profile local store: prefs, baseline, outcome history (numbers only, max 200), per-tip stats; `findPatterns` (≥6 cases each side, ≥20-point gap, z ≥ 1.64) |
| `metrics.ts` | usable-camera time, issue counts/durations, shown/dismissed/resolved/false-alarm counts, coach cost, coached vs uncoached and live vs shadow outcomes |
| `sampler.ts`, `use-camera-coach.ts` | browser glue: canvases, hook, calibration |
| `components/coach-overlay.tsx` | status chip and tip over the preview (and in the compact strip), settings, developer panel |

## Behaviour

- **Modes:** *Minimal* shows only serious problems (tracking lost, face out of frame, mouth hidden or cut off,
  very dark, camera stalled). *Adaptive* (the default) adds tips that are likely to help. *Practice* adds
  shorter persistence and cooldowns, plus feedback between phrases ("That one was clear.").
- **Recording timing:** a tip appears only when the mouth was already moving at the first frame or still
  moving at the last frame (within 160 ms), and only if the face was tracked there. The 0.5 s pre-roll and
  0.3 s post-roll are part of the clip, so a short word with quiet at both ends doesn't count. The wording
  matches how the person starts a capture: hold-to-talk ("Start recording a little earlier"), nod ("Nod
  first, then start mouthing"), or mouthing.
- **Pace and articulation:** a pace tip appears only when this person's own history shows reliably worse
  results at that pace compared with their usual successful rate. There's no universal target speed. With
  no known cause, two misses in a row give "Try repeating that phrase", and three get "Try a slightly
  clearer mouth movement" (at most every 5 minutes).
- **Learning:** each tip records whether the problem cleared up, or whether the next utterance worked. A tip
  is held back when the last two attempts didn't help, or when it rarely helps after 4 or more showings. A
  posture tip that doesn't help switches to its camera-placement version. With posture suggestions turned
  off, the camera-placement version is always used ("Try placing the camera at eye level"). Tips shown for
  45 s without being fixed go away for 3 minutes.
- **Baseline:** *Calibrate my view* (Settings → Camera coach) takes 4 s of the usual view, then three
  mouthed phrases for reference timing. Calibration is optional. Afterwards the baseline moves only from
  calm, clean moments followed by a successful pick, and only in small, capped steps per utterance.

## Evaluating it

Open Settings → Connection & diagnostics → *Camera coach (developer)*. It shows:

- live scores, the current decision, and the coach's per-sample cost (mean and p95, canvas reads included)
- usable-camera share, and shown / dismissed / resolved / false-alarm counts
- pick, top-1 and correction rates, overall and split into coached (a tip in the previous 60 s) vs uncoached
- the same rates for live vs **shadow** sessions. A shadow session detects everything and shows nothing, so
  it's the same setup without coaching. Compare a few sessions of each.
- patterns found, and the last utterance's timing analysis

*Mark current tip as a false alarm* counts false positives per tip. False negatives need someone to label
recordings by hand. They aren't measured.

## Measured cost

The detectors plus the engine take ≈0.05 ms per sample in Node (mean; p95 0.05 ms) at 5 samples a second. Reading the two canvases in the
browser adds the rest; the developer panel reports the full in-app cost. None of it is on the lip-reading,
ranking or speech path.

## Limitations

- **Occlusion** is inferred from the mouth patch no longer looking like the person's mouth (as bright as the
  cheeks, and flat). MediaPipe keeps placing lip landmarks even under a hand. It works best after
  calibration. A dark microphone or a beard can confuse it.
- **Posture** is inferred from the face only: it sinks in the frame and tips down relative to the baseline.
  There's no body-pose model, so "Sit a little more upright" appears only with a baseline. Shoulders aren't
  observed.
- **Lighting** uses exposure measures (percentiles, clipping, face-to-frame contrast, cheek balance), not a
  target brightness. The intent is to be fair across skin tones. It hasn't been validated on a diverse
  panel.
- **Blur** is relative to the person's baseline sharpness. Without calibration it uses a loose fixed floor.
- **Thresholds** are reasoned from the server's crop requirements (eye distance under 4% of the frame width
  fails) and synthetic tests, not tuned on recorded sessions. The test matrix in the spec (lighting, camera
  height, distance, occlusion, speeds, devices, limited mobility) has not been run with real people yet.
- **Pace** needs the sentence, so it's measured after the pick: words per second of mouthing. Without at
  least 8 successful utterances there is no personal pace, and so no pace tips.
