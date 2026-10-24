// Hands-free control from the face: mouthing starts and stops a capture, head (or brow/eye) gestures pick
// among the options. Pure logic over face samples (MediaPipe blendshapes + head pose), so it is testable
// without a camera; use-hands-free.ts feeds it and the widget acts on the events.

export type FaceSample = {
  t: number;          // ms
  face: boolean;      // a face was found
  mouth: number;      // mouth movement, summed blendshape change per second
  open: number;       // lip gap / mouth width, smoothed (speech opens and closes it a few times a second)
  yaw: number;        // head turn, degrees
  pitch: number;      // head nod, degrees
  brows: number;      // brow raise, 0..1
  blink: number;      // both eyes closed, 0..1
  debug?: Record<string, number>;  // raw readings, kept only in tuning recordings
};
export type HandsFreePhase = 'idle' | 'capturing' | 'choosing' | 'busy';
export type HandsFreeEvent = 'start' | 'stop' | 'discard' | 'next' | 'send' | 'cancel' | 'restart';
export type GestureMode = 'head' | 'face';
export type StartBy = 'nod' | 'mouth';
export type HandsFreeConfig = {
  mode: GestureMode;
  // 'nod': nod (or raise your brows) to start reading and again to finish: reliable on any face.
  // 'mouth': start by mouthing, finish by stopping; needs clearly visible mouth movement.
  startBy?: StartBy;
  mouthOn?: number;         // fixed start threshold from calibration; otherwise adaptive
};

// Mouthing
// Decisions look at a window of recent samples, not single readings: mouthing has short gaps between
// words, and a single twitch shouldn't count.
const START_WIN = 600, START_FRAC = 0.75;  // most of the last 0.6 s mouthing starts a capture (it keeps 0.5 s from before)
const STOP_WIN = 900, STOP_FRAC = 0.15;    // almost no mouthing for 0.9 s ends it
const MIN_CAPTURE_MS = 900;                // never end a capture sooner than this
const SPEECH_SWINGS = 3;                   // jaw open/close turns in the start window: speech has several, a twitch one or two
const SWING = 0.03;                        // change in the lip gap (gap / mouth width) that counts as a turn
const MIN_ACTIVE_MS = 700;                 // a capture with less mouthing than this is dropped, not read
const RESTART_WIN = 700;                   // mouthing this long while options are shown discards them and reads again
const MIN_ON = 1.2;         // floor for the adaptive start threshold
const NOISE_GAIN = 3;       // adaptive threshold: this many times the resting noise
const STILL_HEAD = 45;      // deg/s: faster head motion is a gesture, not mouthing
const FACING = 30;          // deg from the resting pose: beyond this the user looked away
// Head gestures
// A natural nod is small: about 4-6 degrees in a recording of a real face (head still to ~0.5 degree at rest).
const YAW_T = 10, PITCH_T = 4.5;     // deg from the resting pose to count as a turn / nod
const RETURN = 0.4;                  // back within this fraction of the threshold = returned
const NOD_MAX_MS = 1200, TURN_MIN_MS = 120, TURN_MAX_MS = 2500;
const REFRACTORY_MS = 450;
// Face gestures (brows, eyes)
const BROW_T = 0.25, BROW_MS = 250;
const BLINK_T = 0.5, BLINK_MIN_MS = 500, BLINK_MAX_MS = 1800;
const CHOOSE_TIMEOUT_MS = 30000;

export class HandsFree {
  config: HandsFreeConfig;
  noise = 0.4;                         // resting mouth movement: the median of recent idle readings
  private idle: number[] = [];
  mouth = 0;                           // smoothed
  private last?: FaceSample;
  private headSpeed = 0;
  private baseYaw?: number; private basePitch?: number; private baseBrows?: number;
  private started = 0;  // when this started a capture (0: it didn't)
  private recent: {t: number; on: boolean; off: boolean; open: number}[] = [];  // on: mouthing (and facing, head still); off: any movement
  private activeMs = 0;  // mouthing during the capture this started
  private lostAt = -1e9;  // when the face was last lost
  private out: null | {axis: 'yaw' | 'pitch'; since: number; side: number; flips: number; peak: number} = null;
  private rebase = false;  // a head movement never came back: take the current pose as the new rest
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
    if (!s.face) { this.last = undefined; this.recent = []; this.out = null; this.lostAt = s.t; if (this.started && phase === 'capturing') { this.started = 0; events.push('stop'); } return events; }
    if (this.last) {
      const speed = Math.hypot(s.yaw - this.last.yaw, s.pitch - this.last.pitch) * 1000 / dt;
      this.headSpeed = 0.6 * this.headSpeed + 0.4 * speed;
    }
    this.last = s;
    // the first readings after the face comes back jump (tracking settles): ignore them
    if (s.t - this.lostAt < 400) { this.mouth = 0; return events; }
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

    if (this.config.startBy === 'nod' && (phase === 'idle' || phase === 'capturing')) {
      // nod (or raise your brows) to start, again to finish; a turn picks a suggested reply
      const gesture = this.config.mode === 'head' ? this.head(s.t, dyaw, dpitch) : this.face(s);
      if (this.rebase) { this.rebase = false; this.baseYaw = s.yaw; this.basePitch = s.pitch; }
      if (gesture && s.t >= this.quietUntil) {
        this.quietUntil = s.t + REFRACTORY_MS;
        if (phase === 'idle') { if (gesture === 'send') this.started = s.t; events.push(gesture); }
        else if (this.started && gesture === 'send') { this.started = 0; events.push('stop'); }
      }
      if (phase === 'idle' && this.started && s.t - this.started > 1000) this.started = 0;
      return events;
    }
    if (phase === 'idle') {
      if (this.share(s.t, START_WIN, 'on') < 0.3) {  // resting (not partway into mouthing)
        this.idle.push(this.mouth);
        if (this.idle.length > 150) this.idle.shift();  // the last ~10 s
        if (this.idle.length % 15 === 0) this.noise = [...this.idle].sort((a, b) => a - b)[this.idle.length >> 1];
      }
      if (!otherTalking && this.share(s.t, START_WIN, 'on') >= START_FRAC && this.swings(s.t, START_WIN) >= SPEECH_SWINGS) {
        this.recent = []; this.started = s.t; this.activeMs = 0; events.push('start');
      }
      if (this.started && s.t - this.started > 1000) this.started = 0;  // the capture never began
      if (suggestions && !events.length) {
        const gesture = this.config.mode === 'head' ? this.head(s.t, dyaw, dpitch) : this.face(s);
      if (this.rebase) { this.rebase = false; this.baseYaw = s.yaw; this.basePitch = s.pitch; }
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
      if (this.rebase) { this.rebase = false; this.baseYaw = s.yaw; this.basePitch = s.pitch; }
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
        this.out = {axis, since: t, side: Math.sign(axis === 'yaw' ? y : p), flips: 0, peak: Math.abs(axis === 'yaw' ? y : p)};
      }
      return null;
    }
    const value = this.out.axis === 'yaw' ? y : p;
    this.out.peak = Math.max(this.out.peak, Math.abs(value));
    if (Math.abs(value) >= 1 && Math.sign(value) !== this.out.side) { this.out.side = Math.sign(value); this.out.flips++; }
    if (t - this.out.since > TURN_MAX_MS) { this.out = null; this.rebase = true; return null; }  // settled somewhere new
    // back: a nod counts once the head is halfway back (people rarely land exactly where they started); a
    // turn must come right back, or a shake (through the middle to the other side) would read as a turn
    const back = this.out.axis === 'pitch' ? Math.max(RETURN, 0.5 * this.out.peak) : RETURN;
    if (Math.abs(value) >= back || Math.abs(this.out.axis === 'yaw' ? p : y) >= 1) return null;
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

const quantile = (xs: number[], f: number) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(f * s.length))] ?? 0; };

/** Calibration from a few seconds at rest and a few mouthing. Mouthing is told apart from rest by either
 * signal: more mouth movement than rest's typical (not its occasional twitches), or the lips opening and
 * closing over a wider range. ok=false only when neither separates. The start level is set only when
 * the movement signal separates (otherwise the adaptive one is kept). */
export function calibrate(rest: FaceSample[], mouthing: FaceSample[]) {
  const r = rest.filter(x => x.face), m = mouthing.filter(x => x.face);
  const restMove = quantile(r.map(x => x.mouth), 0.75), move = quantile(m.map(x => x.mouth), 0.5);
  const spread = (xs: FaceSample[]) => quantile(xs.map(x => x.open), 0.9) - quantile(xs.map(x => x.open), 0.1);
  const restOpen = spread(r), open = spread(m);
  const byMovement = move > restMove * 1.3, byLips = open > Math.max(0.02, restOpen * 2);
  const ok = r.length >= 10 && m.length >= 10 && (byMovement || byLips);
  return {ok, threshold: ok && byMovement ? Math.max(MIN_ON * 0.5, restMove + 0.4 * (move - restMove)) : null,
    measured: {restMove, move, restOpen, open, restSamples: r.length, mouthSamples: m.length}};
}

/** The start threshold from calibration, or null when mouthing can't be told from rest. */
export function calibratedThreshold(rest: number[], mouthing: number[]): number | null {
  const sample = (mouth: number) => ({t: 0, face: true, mouth, open: 0, yaw: 0, pitch: 0, brows: 0, blink: 0});
  return calibrate(rest.map(sample), mouthing.map(sample)).threshold;
}

// The shapes speech moves (jaw, lip closure and rounding, lips parting); expression shapes (smile, press,
// stretch, sideways) are left out: they twitch while listening.
// mouthPucker is left out too: on a resting face it swings widely from frame to frame.
const MOUTH_SHAPES = ['jawOpen', 'mouthClose', 'mouthFunnel', 'mouthRollLower', 'mouthRollUpper',
  'mouthLowerDownLeft', 'mouthLowerDownRight', 'mouthUpperUpLeft', 'mouthUpperUpRight'];

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
