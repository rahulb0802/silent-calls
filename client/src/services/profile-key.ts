import {loadSettings, saveSettings} from './settings';

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

/** The code to paste into another computer's Silent Calls: "<profile name>:<secret>", so pasting it there opens
 * exactly this profile (no need to set the name first). */
export function exportProfileKey(): string { const name = loadSettings().profileId.trim(); return `${name}:${profileSecret(name)}`; }

/** Switch this computer to the profile in a code from exportProfileKey (its name and key). A bare key (no
 * name) applies to the current profile. The companion then reconnects as that profile. Returns the name. */
export function importProfileKey(code: string): string | null {
  const value = code.trim();
  const cut = value.lastIndexOf(':');
  const name = cut > 0 ? value.slice(0, cut).trim() : loadSettings().profileId.trim();
  const secret = cut > 0 ? value.slice(cut + 1).trim() : value;
  if (!name || name.length > 80 || !VALID.test(secret)) return null;
  try {
    localStorage.setItem(keyFor(name), secret);
    const settings = loadSettings();
    if (settings.profileId.trim() !== name) saveSettings({...settings, profileId: name});
    window.dispatchEvent(new Event(KEY_CHANGED));
    return name;
  } catch { return null; }
}
export const KEY_CHANGED = 'silent-calls:profile-key';
