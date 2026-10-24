import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HandsFree, calibratedThreshold, headPose, mouthMovement, type FaceSample, type HandsFreeEvent, type HandsFreePhase } from '../src/capture/hands-free';

const STEP = 66;
const rest = {face: true, mouth: 0.3, yaw: 2, pitch: 10, brows: 0.1, blink: 0};
type Script = {ms: number; phase: HandsFreePhase; talking?: boolean; at?: Partial<FaceSample> | ((t: number) => Partial<FaceSample>)}[];

/** Run a script of segments through a HandsFree; returns [time, event] pairs. */
function run(script: Script, hf = new HandsFree({mode: 'head'})) {
  const out: [number, HandsFreeEvent][] = [];
  let t = 0;
  for (const seg of script) {
    for (const end = t + seg.ms; t < end; t += STEP) {
      const extra = typeof seg.at === 'function' ? seg.at(t) : seg.at;
      for (const e of hf.push({t, ...rest, ...extra}, seg.phase, seg.talking)) out.push([t, e]);
    }
  }
  return out;
}
const mouthing = (t: number) => ({mouth: 4 + 2 * Math.sin(t / 50)});
const names = (events: [number, HandsFreeEvent][]) => events.map(([, e]) => e);

test('mouthing starts a capture, stillness ends it', () => {
  const events = run([
    {ms: 2000, phase: 'idle'},
    {ms: 700, phase: 'idle', at: mouthing},
    {ms: 1500, phase: 'capturing', at: mouthing},
    {ms: 1200, phase: 'capturing'},
  ]);
  assert.deepEqual(names(events), ['start', 'stop']);
  assert.ok(events[1][0] - 4200 >= 800 && events[1][0] - 4200 <= 1300, `stop ${events[1][0]}`);
});

test('pauses between words do not end a capture', () => {
  const gappy = (t: number) => ({mouth: (t % 700) < 450 ? 4 : 0.3});  // 0.45 s of words, 0.25 s pauses
  const events = run([{ms: 2000, phase: 'idle'}, {ms: 700, phase: 'idle', at: mouthing}, {ms: 3000, phase: 'capturing', at: gappy}, {ms: 1500, phase: 'capturing'}]);
  assert.deepEqual(names(events), ['start', 'stop']);
  assert.ok(events[1][0] >= 5700, `stopped mid-sentence at ${events[1][0]}`);
});

test('scattered twitches (about a third of the time) do not start a capture', () => {
  assert.deepEqual(names(run([{ms: 2000, phase: 'idle'}, {ms: 3000, phase: 'idle', at: t => ({mouth: (t % 600) < 200 ? 4 : 0.3})}])), []);
});

test('a short mouth movement (a smile, "mm-hm") does not start a capture', () => {
  assert.deepEqual(names(run([{ms: 2000, phase: 'idle'}, {ms: 200, phase: 'idle', at: mouthing}, {ms: 2000, phase: 'idle'}])), []);
});

test('no start while the other person is talking, or while looking away', () => {
  assert.deepEqual(names(run([{ms: 2000, phase: 'idle'}, {ms: 1500, phase: 'idle', talking: true, at: mouthing}])), []);
  assert.deepEqual(names(run([{ms: 2000, phase: 'idle'}, {ms: 1500, phase: 'idle', at: t => ({...mouthing(t), yaw: 50})}])), []);
});

test('a capture started by the hold key is not ended by stillness', () => {
  assert.deepEqual(names(run([{ms: 2000, phase: 'idle'}, {ms: 2000, phase: 'capturing'}])), []);
});

const nod = (start: number) => (t: number) => ({pitch: 10 + (t - start < 400 ? 18 : 0)});
const turn = (start: number) => (t: number) => ({yaw: 2 + (t - start < 500 ? 20 : 0)});
const shake = (start: number) => (t: number) => ({yaw: 2 + (t - start < 250 ? 20 : t - start < 500 ? -20 : 0)});

test('choosing: turn moves to the next option, nod sends', () => {
  const events = run([
    {ms: 1000, phase: 'idle'},
    {ms: 600, phase: 'choosing'},
    {ms: 1000, phase: 'choosing', at: turn(1650)},
    {ms: 1000, phase: 'choosing', at: nod(2650)},
  ]);
  assert.deepEqual(names(events), ['next', 'send']);
});

test('choosing: a head shake cancels', () => {
  assert.deepEqual(names(run([{ms: 1000, phase: 'idle'}, {ms: 600, phase: 'choosing'}, {ms: 1200, phase: 'choosing', at: shake(1650)}])), ['cancel']);
});

test('choosing: mouthing again discards the options and reads again', () => {
  assert.deepEqual(names(run([{ms: 1000, phase: 'idle'}, {ms: 600, phase: 'choosing'}, {ms: 800, phase: 'choosing', at: mouthing}])), ['restart']);
});

test('gestures do nothing outside choosing', () => {
  assert.deepEqual(names(run([{ms: 1000, phase: 'idle'}, {ms: 1000, phase: 'idle', at: nod(1050)}, {ms: 1000, phase: 'busy', at: turn(2050)}])), []);
});

test('face mode: raised brows send, a long blink moves on; normal blinks do nothing', () => {
  const hf = new HandsFree({mode: 'face'});
  const events = run([
    {ms: 1000, phase: 'idle'},
    {ms: 600, phase: 'choosing'},
    {ms: 600, phase: 'choosing', at: t => ({blink: t < 1900 ? 1 : 0})},  // ~180 ms: a normal blink
    {ms: 1200, phase: 'choosing', at: t => ({blink: t < 2900 ? 1 : 0})},  // ~700 ms: deliberate
    {ms: 800, phase: 'choosing', at: t => ({brows: t < 4100 ? 0.6 : 0.1})},
  ], hf);
  assert.deepEqual(names(events), ['next', 'send']);
});

test('options left alone are cancelled after 30 s', () => {
  assert.deepEqual(names(run([{ms: 1000, phase: 'idle'}, {ms: 31000, phase: 'choosing'}])), ['cancel']);
});

test('losing the face ends a hands-free capture', () => {
  const events = run([{ms: 2000, phase: 'idle'}, {ms: 700, phase: 'idle', at: mouthing}, {ms: 300, phase: 'capturing', at: mouthing}, {ms: 200, phase: 'capturing', at: {face: false}}]);
  assert.deepEqual(names(events), ['start', 'stop']);
});

test('helpers: mouth movement, head pose, calibration', () => {
  assert.equal(mouthMovement(null, {jawOpen: 1}, 66), 0);
  assert.ok(Math.abs(mouthMovement({jawOpen: 0.1, mouthSmileLeft: 0}, {jawOpen: 0.3, mouthSmileLeft: 0.9}, 100) - 2) < 1e-9);
  const a = 20 * Math.PI / 180;  // a 20-degree turn about the vertical axis, column-major
  const pose = headPose([Math.cos(a), 0, -Math.sin(a), 0, 0, 1, 0, 0, Math.sin(a), 0, Math.cos(a), 0, 0, 0, 0, 1]);
  assert.ok(Math.abs(Math.abs(pose.yaw) - 20) < 1e-6 && Math.abs(pose.pitch) < 1e-6);
  assert.equal(calibratedThreshold([0.2, 0.3], [5]), null);
  const th = calibratedThreshold(Array(30).fill(0.3), Array(30).fill(5))!;
  assert.ok(th > 0.3 && th < 5);
});
