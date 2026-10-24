import {loadSettings} from './settings';

/** Dictation mode: picked phrases are typed into the app you're in (wherever the cursor is) instead of
 * spoken into a call. Per profile. */
const key = () => `silent-calls:dictation:v1:${encodeURIComponent(loadSettings().profileId.trim().toLowerCase())}`;
export const DICTATION_CHANGED = 'silent-calls:dictation';
export function dictationOn(): boolean { try { return localStorage.getItem(key()) === '1'; } catch { return false; } }
export function setDictation(on: boolean) {
  try { if (on) localStorage.setItem(key(), '1'); else localStorage.removeItem(key()); } catch { /* this session only */ }
  window.dispatchEvent(new Event(DICTATION_CHANGED));
}
