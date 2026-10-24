import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FrameBuffer, MAX_HOLD_MS } from '../src/capture/buffer';
const frame = (timestampMs: number) => ({ timestampMs, jpeg: 'data:image/jpeg;base64,test' });
test('captures pre-roll and tail with monotonic timestamps, without idle history', () => {
  const buffer = new FrameBuffer();
  for (let t=0;t<=1000;t+=40) buffer.push(frame(t));
  assert.equal(buffer.begin(1000),true);
  for (let t=1040;t<=1200;t+=40) buffer.push(frame(t));
  buffer.release(1200);
  for (let t=1240;t<=1520;t+=40) buffer.push(frame(t));
  assert.equal(buffer.poll(1499,640,360),null);
  const clip=buffer.poll(1520,640,360)!;
  assert.equal(clip.frames[0].timestampMs,520);
  assert.equal(clip.frames.at(-1)!.timestampMs,1480);
  assert.equal(clip.preRollMs,480);
  assert.equal(clip.postRollMs,280);
  assert.equal(clip.endedBy,'release');
  assert.ok(clip.frames.every((item,i,list)=>i===0 || item.timestampMs>list[i-1].timestampMs));
  assert.equal(buffer.poll(1560,640,360),null);
});
test('rejects stale cameras, duplicate start, and preserves first release', () => {
  const buffer=new FrameBuffer();buffer.push(frame(0));
  assert.equal(buffer.begin(250),false);
  buffer.push(frame(1000));assert.equal(buffer.begin(1000),true);
  assert.equal(buffer.begin(1010),false);
  buffer.release(1100);buffer.release(1300);
  assert.equal(buffer.poll(1400,640,360)?.releasedAtMs,1100);
});
test('cancel discards active clip and pre-roll; no late completion', () => {
  const buffer=new FrameBuffer();buffer.push(frame(1000));buffer.begin(1000);buffer.release(1100);buffer.cancel();
  assert.equal(buffer.poll(1500,640,360),null);assert.equal(buffer.begin(1500),false);
});
test('limits a missing release and starts cleanly for the next clip', () => {
  const buffer=new FrameBuffer();buffer.push(frame(1000));buffer.begin(1000);
  buffer.push(frame(1000+MAX_HOLD_MS));
  assert.equal(buffer.poll(1000+MAX_HOLD_MS,640,360)?.endedBy,'limit');
  buffer.push(frame(32000));assert.equal(buffer.begin(32000),true);
});
