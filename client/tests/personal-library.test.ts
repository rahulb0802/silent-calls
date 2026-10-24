import { test } from 'node:test';
import assert from 'node:assert/strict';

const store: Record<string, string> = {};
Object.assign(globalThis, {
  localStorage: { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; } },
  window: { dispatchEvent: () => true },
});
const { ensureOwnName, vocabularyTerms } = await import('../src/services/personal-library');

test('your profile name is added to your words once; ids that are not names are not', () => {
  ensureOwnName('Rahul');
  ensureOwnName('rahul');
  ensureOwnName('person-ab12cd34');
  assert.deepEqual(vocabularyTerms(), ['Rahul']);
});
