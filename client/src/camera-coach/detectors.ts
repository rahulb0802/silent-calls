// Camera coach detectors: one camera sample (and the person's baseline, when calibrated) -> a 0..1 score
// per problem. Scores are evidence, not decisions: engine.ts smooths them over time and decides what to say.
import type {CameraSample} from './signals';

export type CameraIssue =
  | 'tracking_lost' | 'camera_stalled' | 'out_of_frame' | 'mouth_cut_off' | 'mouth_covered'
  | 'too_far' | 'too_close' | 'off_center'
  | 'too_dark' | 'backlit' | 'uneven_light' | 'glare'
  | 'turned_away' | 'head_down' | 'head_tilt' | 'slouch'
  | 'moving' | 'blurry' | 'low_fps';
export type UtteranceIssue =
  | 'clipped_start' | 'clipped_end' | 'too_few_frames' | 'held_too_long' | 'held_still'
  | 'fast_pace' | 'slow_pace' | 'long_phrases' | 'low_motion' | 'repeat' | 'articulation' | 'clear';
export type IssueId = CameraIssue | UtteranceIssue;
export type Category = 'visibility' | 'framing' | 'lighting' | 'posture' | 'stability' | 'timing' | 'pace' | 'articulation';
export type Severity = 'serious' | 'issue' | 'info';
export type Icon = 'eye' | 'move' | 'sun' | 'user' | 'camera' | 'clock' | 'gauge' | 'repeat' | 'check';

export type Advice = {
  text: string;
  category: Category;
  severity: Severity;  // serious: shown even in minimal mode, and during a capture
  icon: Icon;
  persistMs: number;   // how long the problem must last before it is mentioned
  alt?: string;        // camera-setup alternative when posture tips are off or posture advice did not help
};

// Category order is the order problems are fixed in: no point commenting on pace while the mouth is hidden.
export const CATEGORY_RANK: Record<Category, number> = {visibility: 0, framing: 1, lighting: 2, posture: 3, stability: 4, timing: 5, pace: 6, articulation: 7};

export const ADVICE: Record<IssueId, Advice> = {
  tracking_lost: {text: 'Move back into frame.', category: 'visibility', severity: 'serious', icon: 'eye', persistMs: 1500},
  camera_stalled: {text: 'Check your camera.', category: 'visibility', severity: 'serious', icon: 'camera', persistMs: 1000},
  out_of_frame: {text: 'Keep your face in frame.', category: 'visibility', severity: 'serious', icon: 'move', persistMs: 1000},
  mouth_cut_off: {text: 'Keep your mouth in frame.', category: 'visibility', severity: 'serious', icon: 'eye', persistMs: 1000},
  mouth_covered: {text: 'Keep your mouth visible.', category: 'visibility', severity: 'serious', icon: 'eye', persistMs: 1200},
  too_far: {text: 'Move a little closer.', category: 'framing', severity: 'issue', icon: 'move', persistMs: 3000, alt: 'Bring the camera a little closer.'},
  too_close: {text: 'Move slightly farther back.', category: 'framing', severity: 'issue', icon: 'move', persistMs: 3000, alt: 'Move the camera a little farther away.'},
  off_center: {text: 'Center your face.', category: 'framing', severity: 'issue', icon: 'move', persistMs: 3000, alt: 'Point the camera at your face.'},
  too_dark: {text: 'More light needed.', category: 'lighting', severity: 'serious', icon: 'sun', persistMs: 3000},
  backlit: {text: 'Try facing the light.', category: 'lighting', severity: 'issue', icon: 'sun', persistMs: 3000},
  uneven_light: {text: 'Light your face more evenly.', category: 'lighting', severity: 'issue', icon: 'sun', persistMs: 4000},
  glare: {text: 'Reduce the glare.', category: 'lighting', severity: 'issue', icon: 'sun', persistMs: 3000},
  turned_away: {text: 'Turn slightly toward the camera.', category: 'posture', severity: 'issue', icon: 'user', persistMs: 2500, alt: 'Move the camera so it faces you.'},
  head_down: {text: 'Raise your head slightly.', category: 'posture', severity: 'issue', icon: 'user', persistMs: 4000, alt: 'Try placing the camera at eye level.'},
  head_tilt: {text: 'Keep your head level.', category: 'posture', severity: 'issue', icon: 'user', persistMs: 4000, alt: 'Level the camera with your face.'},
  slouch: {text: 'Sit a little more upright.', category: 'posture', severity: 'issue', icon: 'user', persistMs: 6000, alt: 'Tilt the camera down a little.'},
  moving: {text: 'Hold still for a moment.', category: 'stability', severity: 'issue', icon: 'move', persistMs: 2500},
  blurry: {text: 'Improve the camera focus.', category: 'stability', severity: 'issue', icon: 'camera', persistMs: 4000},
  low_fps: {text: 'Check your camera.', category: 'stability', severity: 'issue', icon: 'camera', persistMs: 5000},
  clipped_start: {text: 'Start recording a little earlier.', category: 'timing', severity: 'issue', icon: 'clock', persistMs: 0},
  clipped_end: {text: 'Finish the whole phrase before releasing.', category: 'timing', severity: 'issue', icon: 'clock', persistMs: 0},
  too_few_frames: {text: 'Try that sentence again.', category: 'timing', severity: 'issue', icon: 'repeat', persistMs: 0},
  held_too_long: {text: 'Keep each phrase under 14 seconds.', category: 'timing', severity: 'issue', icon: 'clock', persistMs: 0},
  held_still: {text: 'Hold still while you mouth.', category: 'stability', severity: 'issue', icon: 'move', persistMs: 0},
  fast_pace: {text: 'Try mouthing that a little slower.', category: 'pace', severity: 'issue', icon: 'gauge', persistMs: 0},
  slow_pace: {text: 'Try your natural pace.', category: 'pace', severity: 'issue', icon: 'gauge', persistMs: 0},
  long_phrases: {text: 'Pause briefly between phrases.', category: 'pace', severity: 'issue', icon: 'gauge', persistMs: 0},
  low_motion: {text: 'Try a more deliberate mouth movement.', category: 'articulation', severity: 'issue', icon: 'repeat', persistMs: 0},
  repeat: {text: 'Try repeating that phrase.', category: 'articulation', severity: 'info', icon: 'repeat', persistMs: 0},
  articulation: {text: 'Try a slightly clearer mouth movement.', category: 'articulation', severity: 'issue', icon: 'repeat', persistMs: 0},
  clear: {text: 'That one was clear.', category: 'articulation', severity: 'info', icon: 'check', persistMs: 0},
};

/** Hold-to-talk and hands-free say "start" and "finish" differently. */
export function timingText(issue: 'clipped_start' | 'clipped_end', trigger: 'key' | 'nod' | 'mouth'): string {
  if (trigger === 'nod') return issue === 'clipped_start' ? 'Nod first, then start mouthing.' : 'Finish the phrase before you nod again.';
  if (trigger === 'mouth') return issue === 'clipped_start' ? 'Pause a moment before you start mouthing.' : 'Keep the final mouth movement in frame.';
  return ADVICE[issue].text;
}

/** The person's usual camera view, from calibration (or learned slowly from good moments). */
export type Baseline = {
  faceH: number; cx: number; cy: number;
  yaw: number; pitch: number; roll: number;
  faceMean: number; mouthCheek: number; mouthStd: number; sharp: number;
  n: number;  // samples behind it
};

/** 0 below `a`, 1 above `b`, linear between (a > b flips the direction). */
export const ramp = (v: number, a: number, b: number) => Math.max(0, Math.min(1, (v - a) / (b - a)));

// Thresholds. Framing ones come from the server's crop (it flags eye distance under 4% of the frame width,
// and fails when the face is too near an edge); lighting ones are on exposure (percentiles, clipping), not
// on a target brightness, so a darker or lighter skin tone in good light scores the same.
const EYE_FAR = 0.07, EYE_VERY_FAR = 0.045;   // fraction of frame width
const MOUTH_PX_MIN = 36;                       // mouth width in source pixels below which detail is lost
const FACE_CLOSE = 0.75, FACE_VERY_CLOSE = 0.92;

/** Score every camera problem in one sample. */
export function scoreCamera(s: CameraSample, base: Baseline | null): Partial<Record<CameraIssue, number>> {
  const out: Partial<Record<CameraIssue, number>> = {};
  out.camera_stalled = s.frozen ? 1 : 0;
  out.low_fps = s.fps > 0 ? ramp(s.fps, 18, 10) : 0;
  if (!s.face || !s.faceBox || !s.mouthBox) { out.tracking_lost = 1; return out; }
  out.tracking_lost = 0;
  const f = s.faceBox, m = s.mouthBox;
  // how far the face and the mouth run past the frame's edges
  const over = (b: typeof f) => Math.max(0, -b.x, b.x + b.w - 1, -b.y, b.y + b.h - 1) / Math.max(0.01, Math.min(b.w, b.h));
  out.out_of_frame = ramp(over(f), 0.08, 0.3);
  out.mouth_cut_off = ramp(over(m), 0, 0.15);
  const eye = s.eyeDist ?? 0.1;
  out.too_far = Math.max(ramp(eye, EYE_FAR, EYE_VERY_FAR), s.mouthPx !== undefined ? ramp(s.mouthPx, MOUTH_PX_MIN, MOUTH_PX_MIN * 0.6) : 0);
  out.too_close = ramp(f.h, FACE_CLOSE, FACE_VERY_CLOSE);
  const cx = f.x + f.w / 2, cy = f.y + f.h / 2;
  out.off_center = Math.max(ramp(Math.abs(cx - (base?.cx ?? 0.5)), 0.2, 0.32), ramp(Math.abs(cy - (base?.cy ?? 0.5)), 0.22, 0.34));

  // pose relative to the person's usual pose: a laptop camera sees most people from below, and that is fine
  const yaw = (s.yaw ?? 0) - (base?.yaw ?? 0), pitch = (s.pitch ?? 0) - (base?.pitch ?? 0), roll = (s.roll ?? 0) - (base?.roll ?? 0);
  const slack = base ? 1 : 1.5;  // wider margins until we know their usual pose
  out.turned_away = ramp(Math.abs(yaw), 20 * slack, 32 * slack);
  out.head_down = ramp(pitch, 12 * slack, 22 * slack);
  out.head_tilt = ramp(Math.abs(roll), 14 * slack, 24 * slack);
  // slouching shows as the face sinking in the frame and growing (closer, lower) with the head tipped down;
  // only judged against a baseline: a face alone says nothing about how someone sits
  out.slouch = base ? Math.min(ramp(cy - base.cy, 0.08, 0.16), ramp(pitch, 3, 10)) : 0;

  const L = s.light;
  if (L) {
    // dark: little light reaches the face (exposure percentiles), or much less than their calibrated light
    const dim = Math.max(ramp(L.face.p90, 90, 55), base ? ramp(L.face.mean / Math.max(1, base.faceMean), 0.6, 0.4) : 0);
    out.too_dark = dim;
    // backlight: the frame is much brighter than the face, and the face itself is on the dark side
    out.backlit = Math.min(ramp(L.frameMean - L.face.mean, 35, 70), ramp(L.face.p90, 150, 110));
    out.uneven_light = ramp(L.cheekRatio, 0.55, 0.35);
    out.glare = ramp(L.face.clip, 0.06, 0.18);
    // covered mouth: the mouth stops looking like a mouth (as dark as cheeks, flat) next to the usual view.
    // Without a baseline, only a flat mouth patch that matches the cheeks counts.
    const ratioShift = Math.abs(L.mouthCheek - (base?.mouthCheek ?? 0.8));
    const flat = base ? ramp(L.mouth.std / Math.max(1, base.mouthStd), 0.6, 0.35) : ramp(L.mouth.std, 14, 7);
    out.mouth_covered = Math.min(ramp(ratioShift, 0.12, 0.25), Math.max(flat, base ? 0.4 : 0));
    out.blurry = base && base.sharp > 0 ? ramp(L.mouth.sharp / base.sharp, 0.55, 0.35) : ramp(L.mouth.sharp, 0.12, 0.06);
  }
  return out;
}

/** Head and face motion between samples, as a share of the face height per second. */
export function motion(prev: CameraSample | undefined, s: CameraSample): number {
  if (!prev?.faceBox || !s.faceBox) return 0;
  const dt = Math.max(1, s.t - prev.t) / 1000;
  const dx = (s.faceBox.x + s.faceBox.w / 2) - (prev.faceBox.x + prev.faceBox.w / 2);
  const dy = (s.faceBox.y + s.faceBox.h / 2) - (prev.faceBox.y + prev.faceBox.h / 2);
  return Math.hypot(dx, dy) / Math.max(0.05, s.faceBox.h) / dt;
}
export const movingScore = (speed: number) => ramp(speed, 0.6, 1.4);
