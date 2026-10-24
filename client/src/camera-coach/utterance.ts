// Camera coach, per-utterance part: was the recording complete, how long and how fast was the mouthing,
// what did the camera look like meanwhile. Runs once when a capture ends (and again with the outcome), never
// per frame, and only over numbers the app already has: no frames are kept.
import type {FaceSample} from '../capture/hands-free';
import type {CameraIssue, UtteranceIssue} from './detectors';

export type Trigger = 'key' | 'nod' | 'mouth';
export type ClipInfo = {
  id: string; firstMs: number; lastMs: number;  // first and last frame sent (pre-roll included)
  pressedAtMs: number; releasedAtMs: number; endedBy: 'release' | 'limit'; frames: number;
};
/** The server's quality report for the utterance (server/lipread/frames.py quality()). */
export type ServerQuality = {n_frames?: number; face_rate?: number; eye_dist_frac?: number; mouth_brightness?: number;
  mouth_contrast?: number; mouth_motion?: number; flags?: string[]};
export type UtteranceReport = {
  id: string;
  trigger: Trigger;
  frames: number;
  durationMs: number;            // the recording, pre- and post-roll included
  activeMs: number;              // time the mouth was moving
  swings: number;                // jaw opening/closing turns: a rough count of visible syllables
  onsetMs: number;               // first movement, from the start of the recording
  tailMs: number;                // last movement, before the end of the recording
  faceRate: number;              // share of face samples with a face
  camera: Partial<Record<CameraIssue, number>>;  // mean camera scores over the recording
  issues: Partial<Record<UtteranceIssue, number>>;
  server?: ServerQuality;
};

const EDGE_MS = 160;      // movement this close to either end of the recording means it was probably cut
const MIN_ACTIVE = 300;   // less mouthing than this cannot hold a phrase
const SWING = 0.03;       // as in hands-free.ts: a lip-gap change this big counts as a turn

/** Mouth activity threshold from resting movement (the median of idle readings), as hands-free does. */
export const activeLevel = (noise: number) => Math.max(1.0, 2.5 * noise);

/** Analyse one recording from the face samples (hands-free's stream, ~15/s) and the camera scores in it. */
export function analyzeClip(clip: ClipInfo, trigger: Trigger, face: FaceSample[], camera: Partial<Record<CameraIssue, number>>[],
  noise: number, server?: ServerQuality): UtteranceReport {
  const inside = face.filter(s => s.t >= clip.firstMs && s.t <= clip.lastMs);
  const seen = inside.filter(s => s.face);
  const level = activeLevel(noise);
  let activeMs = 0, first = -1, last = -1, prev = clip.firstMs;
  for (const s of seen) {
    const dt = Math.min(200, s.t - prev); prev = s.t;
    if (s.mouth >= level) { activeMs += dt; if (first < 0) first = s.t; last = s.t; }
  }
  let swings = 0, dir = 0, extreme = NaN;
  for (const s of seen) {
    if (Number.isNaN(extreme)) { extreme = s.open; continue; }
    if (dir === 0) { if (Math.abs(s.open - extreme) >= SWING) { dir = Math.sign(s.open - extreme); extreme = s.open; } }
    else if (dir * (s.open - extreme) > 0) extreme = s.open;
    else if (Math.abs(s.open - extreme) >= SWING) { swings++; dir = -dir; extreme = s.open; }
  }
  const mean: Partial<Record<CameraIssue, number>> = {};
  for (const row of camera) for (const [k, v] of Object.entries(row) as [CameraIssue, number][]) mean[k] = (mean[k] ?? 0) + v / camera.length;
  const durationMs = clip.lastMs - clip.firstMs;
  const onsetMs = first < 0 ? durationMs : first - clip.firstMs, tailMs = last < 0 ? durationMs : clip.lastMs - last;
  const faceRate = inside.length ? seen.length / inside.length : server?.face_rate ?? 0;
  const issues: Partial<Record<UtteranceIssue, number>> = {};
  // Clipped only when the face was tracked at the edge (no samples there says nothing) and the mouth was
  // moving right at it. A short word leaves quiet frames at both ends, so it does not count.
  const trackedAt = (t: number) => seen.some(s => Math.abs(s.t - t) <= EDGE_MS);
  if (first >= 0 && onsetMs <= EDGE_MS && trackedAt(clip.firstMs)) issues.clipped_start = 1;
  if (last >= 0 && tailMs <= EDGE_MS && trackedAt(clip.lastMs) && clip.endedBy === 'release') issues.clipped_end = 1;
  if (clip.endedBy === 'limit') issues.held_too_long = 1;
  if (clip.frames < 20 || (seen.length >= 5 && activeMs < MIN_ACTIVE)) issues.too_few_frames = 1;
  if ((mean.moving ?? 0) >= 0.5) issues.held_still = mean.moving;
  if (server?.mouth_motion !== undefined && server.mouth_motion < 2.0 && activeMs >= MIN_ACTIVE) issues.low_motion = 0.7;
  return {id: clip.id, trigger, frames: clip.frames, durationMs, activeMs, swings, onsetMs, tailMs, faceRate, camera: mean, issues, server};
}

const words = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;

/** Words per second of mouthing, once the sentence is known (the confirmed or top candidate). */
export function pace(report: UtteranceReport, text: string): number | null {
  if (report.activeMs < MIN_ACTIVE) return null;
  return words(text) / (report.activeMs / 1000);
}

/** The recording holds far less movement than the sentence needs: likely clipped, not a pace problem. */
export function tooShortFor(report: UtteranceReport, text: string): boolean {
  const n = words(text);
  return n >= 3 && report.activeMs / n < 120;
}

/** How much the top three guesses agree (shared words / all words): low agreement means the video was
 * ambiguous, whatever the confidence says. */
export function agreement(texts: string[]): number {
  const sets = texts.slice(0, 3).map(t => new Set(t.toLowerCase().split(/\s+/).filter(Boolean)));
  if (sets.length < 2) return 1;
  const all = new Set(sets.flatMap(s => [...s]));
  const shared = [...all].filter(w => sets.every(s => s.has(w)));
  return all.size ? shared.length / all.size : 1;
}
