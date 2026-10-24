import {loadSettings} from './settings';

/** Opt-in: when you correct a phrase in a call (choose another option, edit it, or take Claude's suggestion),
 * the lip-reader keeps that capture's mouth crop with the text you confirmed, for your next personal
 * training. Off unless you turn it on; per profile. */
const key = () => `silent-calls:learn-corrections:v1:${encodeURIComponent(loadSettings().profileId.trim().toLowerCase())}`;
export const LEARNING_CHANGED = 'silent-calls:learn-corrections';
export const LEARNED = 'silent-calls:learned';  // detail: how many corrections are saved now
export function learningOn(): boolean { try { return localStorage.getItem(key()) === '1'; } catch { return false; } }
export function setLearning(on: boolean) {
  try { if (on) localStorage.setItem(key(), '1'); else localStorage.removeItem(key()); } catch { /* this session only */ }
  window.dispatchEvent(new Event(LEARNING_CHANGED));
}
