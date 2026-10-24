import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dictationNames, formatDictation } from '../src/services/dictation';

test('dictation formatting: casing, I, contractions, names, punctuation; no rewording', () => {
  const names = dictationNames(['Figma', 'GitHub'], ['rahul', 'priya']);
  assert.equal(formatDictation('we finished the integrations', names), 'We finished the integrations.');
  assert.equal(formatDictation('can you send the figma file to priya', names), 'Can you send the Figma file to Priya?');
  assert.equal(formatDictation('i m sure i ll be there and it s fine', names), "I'm sure I'll be there and it's fine.");
  assert.equal(formatDictation("i'm on github as rahul", names), "I'm on GitHub as Rahul.");
  assert.equal(formatDictation('Sounds good!', names), 'Sounds good!');  // already written: left alone
  assert.equal(formatDictation('this is it', names), 'This is it.');  // "is" mid-sentence isn't a question
  assert.equal(formatDictation('  ', names), '');
});
