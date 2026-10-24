// Hands-free control from the face: mouthing starts and stops a capture, head (or brow/eye) gestures pick
// among the options. Pure logic over face samples (MediaPipe blendshapes + head pose), so it is testable
// without a camera; use-hands-free.ts feeds it and the widget acts on the events.

export type FaceSample = {
  t: number;          // ms
  face: boolean;      // a face was found
  mouth: number;      // mouth movement, summed blendshape change per second
  open: number;       // how open the jaw is, 0..1 (speech opens and closes it a few times a second)
  yaw: number;        // head turn, degrees
  pitch: number;      // head nod, degrees
  brows: number;      // brow raise, 0..1
  blink: number;      // both eyes closed, 0..1
};
export type HandsFreePhase = 'idle' | 'capturing' | 'choosing' | 'busy';
export type HandsFreeEvent = 'start' | 'stop' | 'discard' | 'next' | 'send' | 'cancel' | 'restart';
export type GestureMode = 'head' | 'face';
export type HandsFreeConfig = {
  mode: GestureMode;
  mouthOn?: number;         // fixed start threshold from calibration; otherwise adaptive
};

// Mouthing
// Decisions look at a window of recent samples, not single readings: mouthing has short gaps between
// words, and a single twitch shouldn't count.
const START_WIN = 600, START_FRAC = 0.75;  // most of the last 0.6 s mouthing starts a capture (it keeps 0.5 s from before)
const STOP_WIN = 900, STOP_FRAC = 0.15;    // almost no mouthing for 0.9 s ends it
const MIN_CAPTURE_MS = 900;                // never end a capture sooner than this
const SPEECH_SWINGS = 3;                   // jaw open/close turns in the start window: speech has several, a twitch one or two
const SWING = 0.035;                       // jaw change that counts as a turn
const MIN_ACTIVE_MS = 700;                 // a capture with less mouthing than this is dropped, not read
const RESTART_WIN = 700;                   // mouthing this long while options are shown discards them and reads again
const MIN_ON = 1.2;         // floor for the adaptive start threshold
const NOISE_GAIN = 3;       // adaptive threshold: this many times the resting noise
const STILL_HEAD = 45;      // deg/s: faster head motion is a gesture, not mouthing
const FACING = 30;          // deg from the resting pose: beyond this the user looked away
// Head gestures
const YAW_T = 12, PITCH_T = 8;       // deg from the resting pose to count as a turn / nod
const RETURN = 0.4;                  // back within this fraction of the threshold = returned
const NOD_MAX_MS = 1200, TURN_MIN_MS = 120, TURN_MAX_MS = 2500;
const REFRACTORY_MS = 450;
// Face gestures (brows, eyes)
const BROW_T = 0.25, BROW_MS = 250;
const BLINK_T = 0.5, BLINK_MIN_MS = 500, BLINK_MAX_MS = 1800;
const CHOOSE_TIMEOUT_MS = 30000;

export class HandsFree {
  config: HandsFreeConfig;
  noise = 0.4;                         // resting mouth movement, adapted while idle
  mouth = 0;                           // smoothed
  private last?: FaceSample;
  private headSpeed = 0;
  private baseYaw?: number; private basePitch?: number; private baseBrows?: number;
  private started = 0;  // when this started a capture (0: it didn't)
  private recent: {t: number; on: boolean; off: boolean; open: number}[] = [];  // on: mouthing (and facing, head still); off: any movement
  private activeMs = 0;  // mouthing during the capture this started
  private out: null | {axis: 'yaw' | 'pitch'; since: number; side: number; flips: number} = null;
  private quietUntil = 0;
  private browSince = 0; private blinkSince = 0;
  private choosingSince = 0; private phase: HandsFreePhase = 'idle';

  constructor(config: HandsFreeConfig) { this.config = config; }

  /** The mouth level that starts a capture. */
  get threshold() { return this.config.mouthOn ?? Math.max(MIN_ON, NOISE_GAIN * this.noise); }

  /** Feed one face sample; returns the events it triggers. `otherTalking`: the other person is mid-line.
   * `suggestions`: the co-pilot's replies are showing, so gestures while idle pick among them (next / send /
   * cancel, as with the lip-reader's options). */
  push(s: FaceSample, phase: HandsFreePhase, otherTalking = false, suggestions = false): HandsFreeEvent[] {
    const events: HandsFreeEvent[] = [];
    const dt = this.last ? Math.max(1, s.t - this.last.t) : 66;
    if (phase !== this.phase) {
      if (phase === 'choosing') { this.choosingSince = s.t; this.recent = []; this.out = null; this.quietUntil = s.t + REFRACTORY_MS; }
      if (phase === 'choosing' || phase === 'busy') this.started = 0;
      this.phase = phase;
    }
    if (!s.face) { this.last = undefined; this.recent = []; this.out = null; if (this.started && phase === 'capturing') { this.started = 0; events.push('stop'); } return events; }
    if (this.last) {
      const speed = Math.hypot(s.yaw - this.last.yaw, s.pitch - this.last.pitch) * 1000 / dt;
      this.headSpeed = 0.6 * this.headSpeed + 0.4 * speed;
    }
    this.last = s;
    this.mouth = 0.5 * this.mouth + 0.5 * s.mouth;
    this.baseYaw ??= s.yaw; this.basePitch ??= s.pitch; this.baseBrows ??= s.brows;
    const dyaw = s.yaw - this.baseYaw, dpitch = s.pitch - this.basePitch;
    const still = this.headSpeed < STILL_HEAD;
    if (!this.out && Math.abs(dyaw) < YAW_T * RETURN && Math.abs(dpitch) < PITCH_T * RETURN) {
      // resting pose drifts slowly (posture), only while the head is near it
      this.baseYaw += 0.03 * dyaw; this.basePitch += 0.03 * dpitch;
    }
    if (phase !== 'choosing' && this.browSince === 0 && this.blinkSince === 0) this.baseBrows += 0.05 * (s.brows - this.baseBrows);
    const facing = Math.abs(dyaw) < FACING && Math.abs(dpitch) < FACING;
    const on = this.threshold, off = on / 2;
    this.recent.push({t: s.t, on: this.mouth >= on && still && facing, off: this.mouth >= off, open: s.open});
    while (this.recent.length && this.recent[0].t < s.t - STOP_WIN) this.recent.shift();

    if (phase === 'idle') {
      if (this.mouth < on) this.noise += 0.02 * (Math.min(this.mouth, on) - this.noise);
      if (!otherTalking && this.share(s.t, START_WIN, 'on') >= START_FRAC && this.swings(s.t, START_WIN) >= SPEECH_SWINGS) {
        this.recent = []; this.started = s.t; this.activeMs = 0; events.push('start');
      }
      if (this.started && s.t - this.started > 1000) this.started = 0;  // the capture never began
      if (suggestions && !events.length) {
        const gesture = this.config.mode === 'head' ? this.head(s.t, dyaw, dpitch) : this.face(s);
        if (gesture && s.t >= this.quietUntil) { events.push(gesture); this.quietUntil = s.t + REFRACTORY_MS; }
      } else if (!suggestions) this.out = null;
    } else if (phase === 'capturing') {
      // only end captures this started: a held key ends its own
      if (this.started && this.mouth >= off) this.activeMs += dt;
      if (this.started && s.t - this.started >= MIN_CAPTURE_MS && this.share(s.t, STOP_WIN, 'off') <= STOP_FRAC) {
        events.push(this.activeMs >= MIN_ACTIVE_MS ? 'stop' : 'discard'); this.started = 0;
      }
    } else if (phase === 'choosing') {
      if (s.t >= this.quietUntil && this.share(s.t, RESTART_WIN, 'on') >= START_FRAC && this.swings(s.t, RESTART_WIN) >= SPEECH_SWINGS) { this.recent = []; this.started = s.t; events.push('restart'); return events; }
      const gesture = this.config.mode === 'head' ? this.head(s.t, dyaw, dpitch) : this.face(s);
      if (gesture && s.t >= this.quietUntil) { events.push(gesture); this.quietUntil = s.t + REFRACTORY_MS; this.choosingSince = s.t; }
      else if (s.t - this.choosingSince > CHOOSE_TIMEOUT_MS) { events.push('cancel'); this.choosingSince = s.t; }
    }
    return events;
  }

  /** Turns of the jaw (opening to closing or back, by at least SWING) in the last `win` ms. */
  private swings(t: number, win: number): number {
    let turns = 0, dir = 0, extreme = NaN;
    for (const x of this.recent) {
      if (x.t <= t - win) continue;
      if (Number.isNaN(extreme)) { extreme = x.open; continue; }
      if (dir === 0) { if (Math.abs(x.open - extreme) >= SWING) { dir = Math.sign(x.open - extreme); extreme = x.open; } }
      else if (dir * (x.open - extreme) > 0) extreme = x.open;  // still going the same way
      else if (Math.abs(x.open - extreme) >= SWING) { turns++; dir = -dir; extreme = x.open; }
    }
    return turns;
  }

  /** Share of the last `win` ms of samples that were mouthing ('on') or moving at all ('off'); -1 until the
   * window is mostly covered (right after a start or a lost face). */
  private share(t: number, win: number, key: 'on' | 'off'): number {
    const xs = this.recent.filter(x => x.t > t - win);
    if (!xs.length || xs[0].t > t - win * 0.8) return key === 'on' ? -1 : 1;
    return xs.filter(x => x[key]).length / xs.length;
  }

  /** A nod (down and back) sends, a turn (one side and back) moves to the next option, a shake (both sides) cancels. */
  private head(t: number, dyaw: number, dpitch: number): HandsFreeEvent | null {
    const y = dyaw / YAW_T, p = dpitch / PITCH_T;
    if (!this.out) {
      if (Math.max(Math.abs(y), Math.abs(p)) >= 1) {
        const axis = Math.abs(y) >= Math.abs(p) ? 'yaw' : 'pitch';
        this.out = {axis, since: t, side: Math.sign(axis === 'yaw' ? y : p), flips: 0};
      }
      return null;
    }
    const value = this.out.axis === 'yaw' ? y : p;
    if (Math.abs(value) >= 1 && Math.sign(value) !== this.out.side) { this.out.side = Math.sign(value); this.out.flips++; }
    if (Math.abs(y) >= RETURN || Math.abs(p) >= RETURN) return null;
    const {axis, since, flips} = this.out; this.out = null;
    const held = t - since;
    if (axis === 'pitch') return held <= NOD_MAX_MS ? 'send' : null;
    if (flips >= 1) return 'cancel';
    return held >= TURN_MIN_MS && held <= TURN_MAX_MS ? 'next' : null;
  }

  /** For people who can't move their head much: raise your brows to send, close your eyes for a moment for the next option. */
  private face(s: FaceSample): HandsFreeEvent | null {
    let gesture: HandsFreeEvent | null = null;
    if (s.brows - (this.baseBrows ?? 0) >= BROW_T) this.browSince ||= s.t;
    else { if (this.browSince && s.t - this.browSince >= BROW_MS) gesture = 'send'; this.browSince = 0; }
    if (s.blink >= BLINK_T) this.blinkSince ||= s.t;
    else { const held = this.blinkSince ? s.t - this.blinkSince : 0; if (held >= BLINK_MIN_MS && held <= BLINK_MAX_MS) gesture ??= 'next'; this.blinkSince = 0; }
    return gesture;
  }
}

/** Calibration: resting and mouthing levels -> the start threshold (between the two, nearer the rest). */
export function calibratedThreshold(rest: number[], mouthing: number[]): number | null {
  const q = (xs: number[], f: number) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(f * s.length))] ?? 0; };
  const floor = q(rest, 0.9), active = q(mouthing, 0.5);
  if (rest.length < 10 || mouthing.length < 10 || active <= floor * 1.5) return null;
  return Math.max(MIN_ON * 0.5, floor + 0.35 * (active - floor));
}

const MOUTH_SHAPES = ['jawOpen', 'mouthClose', 'mouthFunnel', 'mouthPucker', 'mouthLeft', 'mouthRight', 'mouthRollLower',
  'mouthRollUpper', 'mouthShrugLower', 'mouthShrugUpper', 'mouthPressLeft', 'mouthPressRight', 'mouthLowerDownLeft',
  'mouthLowerDownRight', 'mouthUpperUpLeft', 'mouthUpperUpRight', 'mouthStretchLeft', 'mouthStretchRight'];

/** Mouth movement between two blendshape readings, per second (smiles left out: they're not speech). */
export function mouthMovement(previous: Record<string, number> | null, current: Record<string, number>, dtMs: number): number {
  if (!previous) return 0;
  let sum = 0;
  for (const name of MOUTH_SHAPES) sum += Math.abs((current[name] ?? 0) - (previous[name] ?? 0));
  return sum * 1000 / Math.max(1, dtMs);
}

/** Head yaw and pitch (degrees) from MediaPipe's 4x4 facial transformation matrix. */
export function headPose(m: number[]): {yaw: number; pitch: number} {
  const scale = Math.hypot(m[0], m[1], m[2]) || 1;
  const deg = (v: number) => Math.asin(Math.max(-1, Math.min(1, v / scale))) * 180 / Math.PI;
  return {yaw: deg(m[8]), pitch: deg(m[9])};
}
