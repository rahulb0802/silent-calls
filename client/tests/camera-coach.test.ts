import {test} from 'node:test';
import assert from 'node:assert/strict';
import {scoreCamera, type Baseline} from '../src/camera-coach/detectors';
import {CoachEngine, adviseOnOutcome, adviseOnResult} from '../src/camera-coach/engine';
import {DEFAULT_PREFS, emptyStore, findPatterns, nudgeBaseline, unhelpful, type HistoryEntry, type Prefs} from '../src/camera-coach/profile';
import {measurePatch, type CameraSample, type Patch} from '../src/camera-coach/signals';
import {agreement, analyzeClip, tooShortFor, type ClipInfo, type UtteranceReport} from '../src/camera-coach/utterance';
import type {FaceSample} from '../src/capture/hands-free';

const patch = (p: Partial<Patch> = {}): Patch => ({mean: 140, p10: 80, p90: 190, clip: 0.01, std: 30, sharp: 0.3, ...p});
/** A well-lit, centred, frontal face. */
function good(t: number, over: Partial<CameraSample> = {}, light: Partial<NonNullable<CameraSample['light']>> = {}): CameraSample {
  return {t, face: true, frameW: 854, frameH: 480, fps: 25, frozen: false,
    faceBox: {x: 0.35, y: 0.25, w: 0.3, h: 0.45}, mouthBox: {x: 0.43, y: 0.56, w: 0.14, h: 0.07}, eyeDist: 0.12, mouthPx: 90,
    yaw: 0, pitch: 0, roll: 0,
    light: {face: patch(), frameMean: 130, cheekRatio: 0.9, mouth: patch({mean: 100, std: 25}), mouthCheek: 0.75, ...light}, ...over};
}
const base: Baseline = {faceH: 0.45, cx: 0.5, cy: 0.475, yaw: 0, pitch: 0, roll: 0, faceMean: 140, mouthCheek: 0.75, mouthStd: 25, sharp: 0.3, n: 20};
const high = (scores: Record<string, number | undefined>) => Object.entries(scores).filter(([, v]) => (v ?? 0) >= 0.5).map(([k]) => k);

// Pixels --------------------------------------------------------------------------------------------------
function rgba(w: number, h: number, f: (x: number, y: number) => number) {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const v = f(x, y), i = (y * w + x) * 4; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; }
  return d;
}
test('patch statistics: exposure, clipping and sharpness', () => {
  const flat = measurePatch(rgba(20, 10, () => 100), 20, 10);
  assert.equal(Math.round(flat.mean), 100); assert.equal(flat.std, 0); assert.equal(flat.sharp, 0);
  const blown = measurePatch(rgba(20, 10, x => x < 10 ? 255 : 120), 20, 10);
  assert.ok(Math.abs(blown.clip - 0.5) < 0.01);
  const edges = measurePatch(rgba(32, 16, (x, y) => (x + y) % 2 ? 200 : 60), 32, 16);
  const soft = measurePatch(rgba(32, 16, x => 60 + x * 140 / 31), 32, 16);
  assert.ok(edges.sharp > soft.sharp * 5, `${edges.sharp} vs ${soft.sharp}`);
});

// Detectors -----------------------------------------------------------------------------------------------
test('a good view raises nothing', () => {
  assert.deepEqual(high(scoreCamera(good(0), null)), []);
  assert.deepEqual(high(scoreCamera(good(0), base)), []);
});
test('lighting is judged on exposure, not skin tone', () => {
  // darker skin in good light: lower mean, but highlights and contrast are there
  const darker = good(0, {}, {face: patch({mean: 75, p10: 40, p90: 125, std: 28}), frameMean: 110, mouth: patch({mean: 50, std: 18}), mouthCheek: 0.7});
  assert.deepEqual(high(scoreCamera(darker, null)), []);
  const dim = good(0, {}, {face: patch({mean: 35, p10: 15, p90: 52, std: 10}), frameMean: 40});
  assert.ok(high(scoreCamera(dim, null)).includes('too_dark'));
  const backlit = good(0, {}, {face: patch({mean: 60, p90: 100}), frameMean: 170});
  assert.ok(high(scoreCamera(backlit, null)).includes('backlit'));
  assert.ok(high(scoreCamera(good(0, {}, {cheekRatio: 0.3}), null)).includes('uneven_light'));
  assert.ok(high(scoreCamera(good(0, {}, {face: patch({clip: 0.2})}), null)).includes('glare'));
});
test('framing: distance, centre, edges', () => {
  assert.ok(high(scoreCamera(good(0, {eyeDist: 0.04, mouthPx: 20}), null)).includes('too_far'));
  assert.ok(high(scoreCamera(good(0, {faceBox: {x: 0.05, y: 0.02, w: 0.9, h: 0.95}}), null)).includes('too_close'));
  assert.ok(high(scoreCamera(good(0, {faceBox: {x: 0.85, y: 0.25, w: 0.3, h: 0.45}}), null)).includes('out_of_frame'));
  assert.ok(high(scoreCamera(good(0, {mouthBox: {x: 0.43, y: 0.95, w: 0.14, h: 0.08}}), null)).includes('mouth_cut_off'));
  assert.ok(high(scoreCamera(good(0, {faceBox: {x: 0.02, y: 0.25, w: 0.3, h: 0.45}}), null)).includes('off_center'));
  assert.deepEqual(high(scoreCamera({t: 0, face: false, frameW: 854, frameH: 480, fps: 25, frozen: false}, null)), ['tracking_lost']);
});
test('pose is relative to the person, and posture needs a baseline', () => {
  // a laptop camera looking up at someone: 15 degrees is their normal, not a problem
  const lookingDown = good(0, {pitch: 15});
  assert.deepEqual(high(scoreCamera(lookingDown, {...base, pitch: 15})), []);
  assert.ok(high(scoreCamera(good(0, {pitch: 30}), base)).includes('head_down'));
  assert.ok(high(scoreCamera(good(0, {yaw: 35}), base)).includes('turned_away'));
  const sunk = good(0, {pitch: 12, faceBox: {x: 0.35, y: 0.42, w: 0.3, h: 0.45}});
  assert.ok(high(scoreCamera(sunk, base)).includes('slouch'));
  assert.ok(!high(scoreCamera(sunk, null)).includes('slouch'), 'no slouch claim without a baseline');
});
test('a covered mouth stops looking like a mouth', () => {
  const hand = good(0, {}, {mouth: patch({mean: 140, std: 7}), mouthCheek: 1.02});
  assert.ok(high(scoreCamera(hand, base)).includes('mouth_covered'));
  assert.ok(high(scoreCamera(hand, null)).includes('mouth_covered'));
});

// Engine --------------------------------------------------------------------------------------------------
function engine(prefs: Partial<Prefs> = {}) { const store = emptyStore(); return new CoachEngine({...DEFAULT_PREFS, ...prefs}, store); }
/** Feed samples every 200 ms from `from` for `ms`; returns the last recommendation. */
function feed(e: CoachEngine, from: number, ms: number, make: (t: number) => CameraSample, b: Baseline | null = base) {
  let shown = null;
  for (let t = from; t < from + ms; t += 200) { e.camera(make(t), b); shown = e.current(t); }
  return shown as ReturnType<CoachEngine['current']>;
}
const dark = (t: number) => good(t, {}, {face: patch({mean: 30, p10: 10, p90: 45, std: 8}), frameMean: 35});
const covered = (t: number) => good(t, {}, {mouth: patch({mean: 140, std: 6}), mouthCheek: 1.05});

test('a brief problem is not mentioned; a lasting one is', () => {
  const e = engine();
  feed(e, 0, 2000, good);
  assert.equal(feed(e, 2000, 1000, dark), null, 'one second of dark is not worth a tip');
  assert.equal(feed(e, 3000, 2000, good), null);
  const shown = feed(e, 5000, 5000, dark);
  assert.equal(shown?.id, 'too_dark');
  assert.equal(shown?.text, 'More light needed.');
});
test('hysteresis: a score hovering between the thresholds does not flicker', () => {
  const e = engine();
  feed(e, 0, 5000, dark);
  assert.equal(e.current(5000)?.id, 'too_dark');
  // light comes up partway: the score sits between EXIT and ENTER, the tip stays
  const partial = (t: number) => good(t, {}, {face: patch({mean: 60, p10: 30, p90: 73, std: 15}), frameMean: 60});
  assert.equal(feed(e, 5000, 4000, partial)?.id, 'too_dark');
  assert.equal(feed(e, 9000, 3000, good), null, 'resolved once the light is good');
  assert.equal(e.store.advice.too_dark?.resolved, 1);
});
test('visibility comes before lighting', () => {
  const e = engine();
  const both = (t: number) => ({...dark(t), light: {...dark(t).light!, mouth: patch({mean: 30, std: 3}), mouthCheek: 1.1}});
  assert.equal(feed(e, 0, 6000, both)?.id, 'mouth_covered');
});
test('dismissed tips stay away for a while', () => {
  const e = engine();
  feed(e, 0, 5000, dark);
  e.dismiss(5000);
  assert.equal(feed(e, 5000, 60_000, dark), null);
  assert.equal(e.store.advice.too_dark?.dismissed, 1);
  assert.equal(feed(e, 65_000, 245_000, dark)?.id, 'too_dark', 'back after the cooldown');
});
test('nothing new interrupts a sentence, except serious visibility problems', () => {
  const e = engine();
  feed(e, 0, 1000, good);
  e.startCapture();
  const far = (t: number) => good(t, {eyeDist: 0.035, mouthPx: 18});
  assert.equal(feed(e, 1000, 6000, far), null);
  e.endCapture();
  assert.equal(e.current(7000)?.id, 'too_far');
  const f = engine(); f.startCapture();
  assert.equal(feed(f, 0, 4000, covered)?.id, 'mouth_covered');
});
test('minimal mode only shows serious problems; shadow mode shows nothing', () => {
  const far = (t: number) => good(t, {eyeDist: 0.035, mouthPx: 18});
  assert.equal(feed(engine({intensity: 'minimal'}), 0, 8000, far), null);
  assert.equal(feed(engine({intensity: 'minimal'}), 0, 8000, dark)?.id, 'too_dark');
  const shadow = engine({shadow: true});
  assert.equal(feed(shadow, 0, 8000, dark), null);
  assert.equal(shadow.decided?.id, 'too_dark', 'shadow sessions still decide, for comparison');
});
test('posture off: camera placement instead of telling them how to sit', () => {
  const down = (t: number) => good(t, {pitch: 30});
  assert.equal(feed(engine(), 0, 8000, down)?.text, 'Raise your head slightly.');
  const alt = feed(engine({posture: false}), 0, 8000, down);
  assert.equal(alt?.text, 'Try placing the camera at eye level.');
  assert.equal(alt?.alt, true);
});
test('a tip that is not acted on stops after a while', () => {
  const e = engine();
  const far = (t: number) => good(t, {eyeDist: 0.035, mouthPx: 18});
  assert.equal(feed(e, 0, 10_000, far)?.id, 'too_far');
  assert.equal(feed(e, 10_000, 45_000, far), null);
  assert.equal(e.store.advice.too_far?.notHelped, 1);
});

// Utterances ----------------------------------------------------------------------------------------------
const clip = (over: Partial<ClipInfo> = {}): ClipInfo => ({id: 'u', firstMs: 0, lastMs: 3000, pressedAtMs: 500, releasedAtMs: 2700, endedBy: 'release', frames: 75, ...over});
/** Face samples every 66 ms; mouthing between `from` and `to`. */
function faces(from: number, to: number, end = 3000): FaceSample[] {
  const out: FaceSample[] = [];
  for (let t = 0; t <= end; t += 66) {
    const on = t >= from && t <= to;
    out.push({t, face: true, mouth: on ? 4 : 0.3, open: on ? 0.15 + 0.12 * Math.sin(t / 45) : 0.05, yaw: 0, pitch: 0, brows: 0, blink: 0});
  }
  return out;
}
test('a complete recording has quiet at both ends', () => {
  const r = analyzeClip(clip(), 'key', faces(700, 2300), [], 0.3);
  assert.deepEqual(r.issues, {});
  assert.ok(r.activeMs > 1400 && r.activeMs < 1800, `${r.activeMs}`);
  assert.ok(r.swings >= 5);
});
test('clipped recordings: movement at the very start or end', () => {
  assert.equal(analyzeClip(clip(), 'key', faces(0, 2000), [], 0.3).issues.clipped_start, 1);
  assert.equal(analyzeClip(clip(), 'key', faces(800, 3000), [], 0.3).issues.clipped_end, 1);
  assert.equal(adviseOnResult(analyzeClip(clip(), 'key', faces(800, 3000), [], 0.3), 'see you', 'key')?.id, 'clipped_end');
  assert.equal(adviseOnResult(analyzeClip(clip(), 'nod', faces(0, 2000), [], 0.3), 'see you', 'nod')?.text, 'Nod first, then start mouthing.');
});
test('a short word is not a clipped recording', () => {
  const r = analyzeClip(clip({lastMs: 1600, releasedAtMs: 1300}), 'key', faces(700, 1100, 1600), [], 0.3);
  assert.equal(r.issues.clipped_start, undefined); assert.equal(r.issues.clipped_end, undefined);
  assert.equal(r.issues.too_few_frames, undefined);
  assert.equal(tooShortFor(r, 'yes'), false);
  assert.equal(tooShortFor(r, 'can we move the meeting to next thursday afternoon'), true);
});
test('no face samples at the edge: nothing is claimed about clipping', () => {
  const lostAtEdge = faces(0, 2000).map(s => s.t < 400 ? {...s, face: false} : s);
  assert.equal(analyzeClip(clip(), 'key', lostAtEdge, [], 0.3).issues.clipped_start, undefined);
});
test('a visual problem during the utterance is named before timing', () => {
  const r = analyzeClip(clip(), 'key', faces(0, 2000), [{too_dark: 0.9}, {too_dark: 0.8}], 0.3);
  assert.equal(adviseOnResult(r, 'hello', 'key')?.id, 'too_dark');
  assert.equal(adviseOnResult(analyzeClip(clip(), 'key', faces(700, 2300), [], 0.3), 'hi', 'key', 'no_face')?.id, 'out_of_frame');
  assert.equal(adviseOnResult(analyzeClip(clip(), 'key', faces(700, 2300), [], 0.3), 'hi', 'key'), null);
});
test('candidate agreement', () => {
  assert.equal(agreement(['see you then', 'see you then', 'see you then']), 1);
  assert.ok(agreement(['see you then', 'free tea hen', 'sea view them']) < 0.3);
});

// Learning ------------------------------------------------------------------------------------------------
const entry = (outcome: HistoryEntry['outcome'], over: Partial<HistoryEntry> = {}): HistoryEntry => ({at: 0, outcome, lipTop: true, words: 4, activeMs: 1500, rate: 2.7,
  agreement: 1, coached: false, shadow: false, cond: {dim: false, headDown: false, unstable: false, long: false}, ...over});
const report = (): UtteranceReport => analyzeClip(clip(), 'key', faces(700, 2300), [], 0.3);
test('patterns need evidence', () => {
  const few = [...Array(3)].map(() => entry('rejected', {cond: {dim: true, headDown: false, unstable: false, long: false}}));
  assert.deepEqual(findPatterns([...few, ...Array(10).fill(entry('top'))]), []);
  const dimFails = [...Array(8)].map((_, i) => entry(i < 6 ? 'rejected' : 'top', {cond: {dim: true, headDown: false, unstable: false, long: false}}));
  const patterns = findPatterns([...dimFails, ...[...Array(12)].map((_, i) => entry(i < 10 ? 'top' : 'rejected'))]);
  assert.deepEqual(patterns.map(p => p.condition), ['dim']);
});
test('pace advice only when this person does worse at speed', () => {
  const normal = [...Array(12)].map(() => entry('top', {rate: 2.5}));
  const fast = entry('rejected', {rate: 4});
  assert.notEqual(adviseOnOutcome(report(), 'rejected', fast, normal, findPatterns(normal), true)?.id, 'fast_pace');
  const fastFails = [...Array(7)].map(() => entry('rejected', {rate: 4}));
  const history = [...normal, ...fastFails];
  assert.equal(adviseOnOutcome(report(), 'rejected', fast, history, findPatterns(history), true)?.id, 'fast_pace');
});
test('repeated misses with no known cause: a neutral nudge, then a sparing hint', () => {
  const ok = [...Array(5)].map(() => entry('top'));
  assert.equal(adviseOnOutcome(report(), 'rejected', entry('rejected'), ok, [], true), null, 'one miss: just let them retry');
  assert.equal(adviseOnOutcome(report(), 'rejected', entry('rejected'), [...ok, entry('rejected')], [], true)?.id, 'repeat');
  const misses = [...ok, entry('rejected'), entry('edited')];
  assert.equal(adviseOnOutcome(report(), 'rejected', entry('rejected'), misses, [], true)?.id, 'articulation');
  assert.equal(adviseOnOutcome(report(), 'rejected', entry('rejected'), misses, [], false)?.id, 'repeat');
});
test('utterance advice waits for the end of the capture, and learns whether it helped', () => {
  const e = engine();
  feed(e, 0, 1000, good);
  e.result(1000, analyzeClip(clip(), 'key', faces(800, 3000), [], 0.3), 'see you then');
  assert.equal(e.current(1200)?.id, 'clipped_end');
  e.startCapture();
  assert.equal(e.current(1400), null);
  e.endCapture();
  e.outcome(5000, report(), 'top', entry('top'), []);
  assert.equal(e.store.advice.clipped_end?.helped, 1);
});
test('advice that keeps failing is held back', () => {
  assert.equal(unhelpful({shown: 2, resolved: 0, resolveMs: 0, dismissed: 0, helped: 0, notHelped: 2, recent: [false, false]}), true);
  assert.equal(unhelpful({shown: 6, resolved: 3, resolveMs: 0, dismissed: 0, helped: 1, notHelped: 2, recent: [true, false]}), false);
});
test('the baseline moves slowly and boundedly', () => {
  const moved = nudgeBaseline(base, {...base, pitch: 40, faceMean: 20, cy: 0.9});
  assert.ok(moved.pitch <= 0.5 && moved.faceMean >= 139 && moved.cy - base.cy <= 0.01);
});
