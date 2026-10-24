import { test } from 'node:test';
import assert from 'node:assert/strict';
import { transition } from '../src/demo';
test('capture requires confirmation before speaking', () => {
  assert.equal(transition('ready', 'release'), 'ready');
  assert.equal(transition('ready', 'start'), 'capturing');
  assert.equal(transition('capturing', 'release'), 'processing');
  assert.equal(transition('processing', 'result'), 'choosing');
  assert.equal(transition('choosing', 'result'), 'choosing');
  assert.equal(transition('choosing', 'select'), 'speaking');
  assert.equal(transition('speaking', 'done'), 'ready');
});
test('late async events cannot resume paused output', () => {
  assert.equal(transition('processing', 'pause'), 'paused');
  assert.equal(transition('paused', 'result'), 'paused');
  assert.equal(transition('paused', 'select'), 'paused');
  assert.equal(transition('paused', 'done'), 'paused');
  assert.equal(transition('paused', 'resume'), 'ready');
});
