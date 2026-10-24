// Camera coach personalization: the person's baseline view, a rolling history of utterance outcomes (numbers
// only: no video, no sentence text), how each piece of advice has worked for them, and their preferences.
// Stored locally per profile; nothing here leaves the machine.
import type {Baseline, IssueId} from './detectors';

export type Intensity = 'minimal' | 'adaptive' | 'practice';
export type Prefs = {
  intensity: Intensity;
  posture: boolean;      // posture suggestions (otherwise camera-setup alternatives)
  keepHistory: boolean;  // keep the outcome history between sessions
  shadow: boolean;       // evaluation: detect and log, but show nothing (a session without coaching)
};
export const DEFAULT_PREFS: Prefs = {intensity: 'adaptive', posture: true, keepHistory: true, shadow: false};

/** Outcome of one utterance, from what the person did with the options. */
export type Outcome = 'top' | 'alt' | 'edited' | 'rejected' | 'failed';
export const success = (o: Outcome) => o === 'top' || o === 'alt';
export type Conditions = {dim: boolean; headDown: boolean; unstable: boolean; long: boolean};
export type HistoryEntry = {
  at: number;            // Date.now()
  outcome: Outcome;
  lipTop: boolean;       // the pick was also the lip-reader's own first guess (reranking didn't change it)
  words: number;
  activeMs: number;
  rate: number | null;   // words per second of mouthing
  confidence?: number;
  agreement: number;
  coached: boolean;      // advice was shown in the 60 s before
  shadow: boolean;
  cond: Conditions;
};
export type AdviceStats = {shown: number; resolved: number; resolveMs: number; dismissed: number; helped: number; notHelped: number; recent: boolean[]};
export type Stored = {prefs: Prefs; baseline: Baseline | null; history: HistoryEntry[]; advice: Partial<Record<IssueId, AdviceStats>>;
  pace?: {rates: number[]}};  // words per second of the calibration phrases (a reference, not a target)

const MAX_HISTORY = 200;
const BASE = 'silent-calls:camera-coach:v1';
export function storageKey(profile: string): string {
  const p = profile.trim().toLowerCase();
  return p ? `${BASE}:${encodeURIComponent(p)}` : BASE;
}
export function emptyStore(): Stored { return {prefs: {...DEFAULT_PREFS}, baseline: null, history: [], advice: {}}; }
export function loadStore(key: string): Stored {
  try {
    const v = JSON.parse(localStorage.getItem(key) || 'null');
    if (!v || typeof v !== 'object') return emptyStore();
    return {prefs: {...DEFAULT_PREFS, ...(v.prefs ?? {})}, baseline: v.baseline ?? null,
      history: Array.isArray(v.history) ? v.history.slice(-MAX_HISTORY) : [], advice: v.advice ?? {},
      ...(v.pace && Array.isArray(v.pace.rates) ? {pace: {rates: v.pace.rates}} : {})};
  } catch { return emptyStore(); }
}
export function saveStore(key: string, s: Stored) {
  const out = s.prefs.keepHistory ? s : {...s, history: []};
  try { localStorage.setItem(key, JSON.stringify(out)); } catch { /* kept for this session only */ }
}
export function addHistory(s: Stored, e: HistoryEntry) { s.history.push(e); if (s.history.length > MAX_HISTORY) s.history.splice(0, s.history.length - MAX_HISTORY); }

export function stats(s: Stored, id: IssueId): AdviceStats {
  return (s.advice[id] ??= {shown: 0, resolved: 0, resolveMs: 0, dismissed: 0, helped: 0, notHelped: 0, recent: []});
}
/** Record whether following a piece of advice was followed by a better result. */
export function recordEffect(s: Stored, id: IssueId, helped: boolean) {
  const a = stats(s, id);
  if (helped) a.helped++; else a.notHelped++;
  a.recent = [...a.recent, helped].slice(-5);
}
/** Advice that has had its chance and rarely helps this person is held back. */
export function unhelpful(a: AdviceStats | undefined): boolean {
  if (!a) return false;
  const tries = a.helped + a.notHelped + a.resolved;
  if (a.recent.length >= 2 && a.recent.slice(-2).every(x => !x)) return true;  // the last two didn't help
  return a.shown >= 4 && tries >= 4 && (a.helped + a.resolved) / Math.max(1, a.shown) < 0.25;
}

// Baseline -----------------------------------------------------------------------------------------------
export type BaselineInput = Omit<Baseline, 'n'>;
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[s.length >> 1] : 0; };

/** Calibration: the medians of a few seconds of still, good samples. */
export function baselineFrom(samples: BaselineInput[]): Baseline | null {
  if (samples.length < 8) return null;
  const pick = (k: keyof BaselineInput) => median(samples.map(s => s[k]));
  return {faceH: pick('faceH'), cx: pick('cx'), cy: pick('cy'), yaw: pick('yaw'), pitch: pick('pitch'), roll: pick('roll'),
    faceMean: pick('faceMean'), mouthCheek: pick('mouthCheek'), mouthStd: pick('mouthStd'), sharp: pick('sharp'), n: samples.length};
}
/** Learn slowly from moments that led to a confirmed sentence: a bad session can't drag it far. */
export function nudgeBaseline(base: Baseline, x: BaselineInput, rate = 0.02): Baseline {
  const out = {...base, n: base.n + 1};
  for (const k of Object.keys(x) as (keyof BaselineInput)[]) {
    const step = rate * (x[k] - base[k]);
    // never move more than a small fixed amount in one step, whatever the reading
    const cap = k === 'yaw' || k === 'pitch' || k === 'roll' ? 0.5 : k === 'faceMean' || k === 'mouthStd' ? 1 : 0.01;
    out[k] = base[k] + Math.max(-cap, Math.min(cap, step));
  }
  return out;
}

// Patterns -----------------------------------------------------------------------------------------------
export type Pattern = {condition: keyof Conditions | 'fast' | 'slow'; withRate: number; withoutRate: number; nWith: number; nWithout: number; z: number};
const MIN_EACH = 6, MIN_GAP = 0.2, MIN_Z = 1.64;  // ~one-sided 95%: don't read a pattern into a handful of examples

/** Two-proportion z statistic (pooled). */
export function zScore(a: number, na: number, b: number, nb: number): number {
  const p = (a * na + b * nb) / (na + nb), se = Math.sqrt(p * (1 - p) * (1 / na + 1 / nb));
  return se > 0 ? (b - a) / se : 0;
}
/** The person's typical words per second when it worked, once there are enough successes. */
export function usualRate(h: HistoryEntry[]): number | null {
  const rates = h.filter(e => success(e.outcome) && e.rate !== null).map(e => e.rate as number);
  return rates.length >= 8 ? median(rates) : null;
}
/** Conditions under which this person's recognition is reliably worse. */
export function findPatterns(h: HistoryEntry[]): Pattern[] {
  const usual = usualRate(h);
  const tests: [Pattern['condition'], (e: HistoryEntry) => boolean | null][] = [
    ['dim', e => e.cond.dim], ['headDown', e => e.cond.headDown], ['unstable', e => e.cond.unstable], ['long', e => e.cond.long],
    ['fast', e => usual === null || e.rate === null ? null : e.rate > usual * 1.25],
    ['slow', e => usual === null || e.rate === null ? null : e.rate < usual * 0.8],
  ];
  const out: Pattern[] = [];
  for (const [condition, has] of tests) {
    const yes: HistoryEntry[] = [], no: HistoryEntry[] = [];
    for (const e of h) { const v = has(e); if (v === true) yes.push(e); else if (v === false) no.push(e); }
    if (yes.length < MIN_EACH || no.length < MIN_EACH) continue;
    const rate = (xs: HistoryEntry[]) => xs.filter(e => success(e.outcome)).length / xs.length;
    const withRate = rate(yes), withoutRate = rate(no), z = zScore(withRate, yes.length, withoutRate, no.length);
    if (withoutRate - withRate >= MIN_GAP && z >= MIN_Z) out.push({condition, withRate, withoutRate, nWith: yes.length, nWithout: no.length, z});
  }
  return out;
}
