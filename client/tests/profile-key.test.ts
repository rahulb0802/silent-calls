import { test } from 'node:test';
import assert from 'node:assert/strict';

const store: Record<string, string> = {};
const events: string[] = [];
Object.assign(globalThis, {
  localStorage: { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; }, removeItem: (k: string) => { delete store[k]; } },
  window: { dispatchEvent: (e: Event) => { events.push(e.type); return true; } },
});
const { exportProfileKey, importProfileKey, profileSecret } = await import('../src/services/profile-key');
const { loadSettings, saveSettings } = await import('../src/services/settings');

test('a profile code carries the name: pasting it switches to that profile with that key', () => {
  saveSettings({...loadSettings(), profileId: 'Rahul'});
  const code = exportProfileKey();
  assert.match(code, /^Rahul:[0-9a-f]{48}$/);
  const rahulSecret = profileSecret('Rahul');
  saveSettings({...loadSettings(), profileId: 'sarvajith'});
  const mine = profileSecret('sarvajith');
  assert.equal(importProfileKey(code), 'Rahul');
  assert.equal(loadSettings().profileId, 'Rahul');
  assert.equal(profileSecret('Rahul'), rahulSecret);
  assert.equal(profileSecret('sarvajith'), mine);  // your own profile's key is untouched
  assert.ok(events.includes('silent-calls:profile-key'));
  assert.equal(importProfileKey('not a key'), null);
});
