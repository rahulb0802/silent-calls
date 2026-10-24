import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HandsFree, calibratedThreshold, headPose, mouthMovement, type FaceSample, type HandsFreeEvent, type HandsFreePhase } from '../src/capture/hands-free';

const STEP = 66;
const rest = {face: true, mouth: 0.3, open: 0.05, yaw: 2, pitch: 10, brows: 0.1, blink: 0};
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
// silent speech: lots of mouth movement, the jaw opening and closing a few times a second
const mouthing = (t: number) => ({mouth: 4 + 2 * Math.sin(t / 50), open: 0.15 + 0.12 * Math.sin(t / 45)});
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
  const gappy = (t: number) => (t % 700) < 450 ? mouthing(t) : {};  // 0.45 s of words, 0.25 s pauses
  const events = run([{ms: 2000, phase: 'idle'}, {ms: 700, phase: 'idle', at: mouthing}, {ms: 3000, phase: 'capturing', at: gappy}, {ms: 1500, phase: 'capturing'}]);
  assert.deepEqual(names(events), ['start', 'stop']);
  assert.ok(events[1][0] >= 5700, `stopped mid-sentence at ${events[1][0]}`);
});

test('a twitch, smile or swallow (the jaw moves once) does not start a capture, however strong', () => {
  const once = (t: number) => ({mouth: 5, open: t < 2300 ? 0.3 : 0.05});
  assert.deepEqual(names(run([{ms: 2000, phase: 'idle'}, {ms: 700, phase: 'idle', at: once}, {ms: 1500, phase: 'idle'}])), []);
});

test('a capture with hardly any mouthing is dropped instead of read', () => {
  const events = run([{ms: 2000, phase: 'idle'}, {ms: 700, phase: 'idle', at: mouthing}, {ms: 200, phase: 'capturing', at: mouthing}, {ms: 1500, phase: 'capturing'}]);
  assert.deepEqual(names(events), ['start', 'discard']);
});

test('while suggested replies show, a turn picks one and a nod says it; without them gestures do nothing', () => {
  const hf = new HandsFree({mode: 'head'});
  const out: HandsFreeEvent[] = [];
  for (let t = 0; t < 3600; t += STEP) {
    const pose = t >= 1000 && t < 1500 ? {yaw: 22} : t >= 2200 && t < 2600 ? {pitch: 28} : {};
    out.push(...hf.push({t, ...rest, ...pose}, 'idle', false, true));
  }
  assert.deepEqual(out, ['next', 'send']);
  assert.deepEqual(names(run([{ms: 1000, phase: 'idle'}, {ms: 1000, phase: 'idle', at: turn(1050)}])), []);
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

test('nod mode: a nod starts reading and a second nod finishes it; mouthing alone does nothing', () => {
  const hf = new HandsFree({mode: 'head', startBy: 'nod'});
  const out: [number, HandsFreeEvent][] = [];
  for (let t = 0; t < 6000; t += STEP) {
    const phase: HandsFreePhase = t < 1500 ? 'idle' : t < 5000 ? 'capturing' : 'idle';
    const pose = (t >= 1000 && t < 1350) || (t >= 4000 && t < 4350) ? {pitch: 28} : {};
    const mouth = t >= 300 && t < 900 || (t >= 1600 && t < 3800) ? mouthing(t) : {};
    for (const e of hf.push({t, ...rest, ...mouth, ...pose}, phase)) out.push([t, e]);
  }
  assert.deepEqual(names(out), ['send', 'stop']);  // the widget turns an idle 'send' into a start (or says a picked reply)
});

test('the first readings after the face comes back are ignored', () => {
  const events = run([{ms: 2000, phase: 'idle'}, {ms: 300, phase: 'idle', at: {face: false}}, {ms: 350, phase: 'idle', at: mouthing}, {ms: 1500, phase: 'idle'}]);
  assert.deepEqual(names(events), []);
});
