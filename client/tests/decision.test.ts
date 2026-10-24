import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rankByDecision } from '../src/services/lipread-port';
import type { Decision } from '../src/desktop';

const lip = [
  {id: 'u1:0', text: "i'll fall you back", lipScore: -1},
  {id: 'u1:1', text: "i'll call you back", lipScore: -1.2},
  {id: 'u1:2', text: 'all of you back', lipScore: -3},
];
const decision = (texts: string[], route: Decision['route'] = 'choose'): Decision => ({
  utteranceId: 'u1', route, jev: true, timings: {jev: 90},
  options: texts.map((text, index) => ({text, prob: [0.7, 0.2, 0.1][index], jev: true})),
});

test('no decision keeps the lip-reading order', () => {
  assert.deepEqual(rankByDecision('u1', lip, null), {candidates: lip, ranker: 'lip'});
});

test('decision order first, then the remaining lip candidates, ids kept', () => {
  const out = rankByDecision('u1', lip, decision(["I'll call you back", "i'll fall you back"]));
  assert.deepEqual(out.candidates.map(c => c.id), ['u1:1', 'u1:0', 'u1:2']);
  assert.equal(out.candidates[0].prob, 0.7);
  assert.equal(out.confidence, 0.7);
  assert.equal(out.ranker, 'jev');
});

test('an option the lip list lacks gets its own id; duplicates are dropped', () => {
  const out = rankByDecision('u1', lip, decision(['hi sarvajith', "i'll call you back"], 'repeat'));
  assert.deepEqual(out.candidates.map(c => c.text), ['hi sarvajith', "i'll call you back", "i'll fall you back", 'all of you back']);
  assert.equal(out.candidates[0].id, 'u1:d0');
  assert.equal(out.route, 'repeat');
});
