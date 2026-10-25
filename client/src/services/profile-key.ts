import {loadSettings} from './settings';

/** A random secret per profile, kept on this computer: the GPU stores everything for a profile under its
 * name plus this secret (server/lipread/identity.py), so typing someone's name doesn't open their model or
 * corrections. "Profile key" = the secret, to use the same profile on another computer. */
const keyFor = (name: string) => `silent-calls:profile-secret:v1:${encodeURIComponent(name.trim().toLowerCase())}`;
const VALID = /^[A-Za-z0-9_-]{32,128}$/;

export function profileSecret(name = loadSettings().profileId): string {
  const k = keyFor(name);
  try {
    const saved = localStorage.getItem(k);
    if (saved && VALID.test(saved)) return saved;
    const bytes = crypto.getRandomValues(new Uint8Array(24));
    const fresh = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
    localStorage.setItem(k, fresh);
    return fresh;
  } catch { return ''; }
}

/** The key to type into another computer's Silent Calls to use this profile there. */
export function exportProfileKey(): string { return profileSecret(); }

/** Use a profile key from another computer for this profile name (its data then opens here). */
export function importProfileKey(code: string): boolean {
  const value = code.trim();
  if (!VALID.test(value)) return false;
  try { localStorage.setItem(keyFor(loadSettings().profileId), value); window.dispatchEvent(new Event('silent-calls:settings')); return true; }
  catch { return false; }
}
