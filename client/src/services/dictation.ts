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

const QUESTION = /^(what|why|how|when|where|who|whom|whose|which|can|could|would|will|wo|do|does|did|are|is|was|were|should|shall|have|has|had|may|might|am|isn't|aren't|don't|doesn't|didn't|can't|won't|wouldn't|couldn't|shouldn't)\b/i;
const SPLIT = /\b(i|you|we|they|he|she|it|that|there|what|let|don|can|won|isn|aren|didn|doesn|wasn|weren|couldn|wouldn|shouldn|haven|hasn) (m|ll|ve|d|re|s|t)\b/gi;

/** Dictated text as it should be written: the lip-reader's words, unchanged, with sentence casing, "I",
 * contractions rejoined ("i m" -> "I'm"), names and your words spelled as you saved them, and a full stop or
 * question mark. No rewording. `names`: terms with their spelling (your words; call names, capitalized). */
export function formatDictation(text: string, names: string[] = []): string {
  let out = text.trim().replace(/\s+/g, ' ');
  if (!out) return out;
  out = out.replace(SPLIT, (_, a: string, b: string) => `${a}'${b}`);
  out = out.replace(/\bi('(m|ll|ve|d))?\b/g, (_, rest = '') => `I${rest}`);
  for (const name of [...names].sort((a, b) => b.length - a.length)) {
    const plain = name.trim();
    if (!plain || plain.length > 60) continue;
    const escaped = plain.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp(`(^|[^\\p{L}'])${escaped}(?=$|[^\\p{L}'])`, 'giu'), (_, before: string) => `${before}${plain}`);
  }
  out = out[0].toUpperCase() + out.slice(1);
  if (!/[.!?]$/.test(out)) out += QUESTION.test(out) ? '?' : '.';
  return out;
}

/** Spellings for formatDictation: saved words as typed, call names (lowercase from the service) capitalized. */
export function dictationNames(saved: string[], callNames: string[]): string[] {
  const cap = (w: string) => w.replace(/(^|[\s-])(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toUpperCase());
  return [...saved, ...callNames.map(cap)];
}
