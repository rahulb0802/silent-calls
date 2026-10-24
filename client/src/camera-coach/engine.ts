// Camera coach decisions: smooth the detector scores over time, decide when a problem is real (persistence,
// hysteresis), pick the one thing worth saying (fix visibility before framing, lighting before posture, all
// of them before pace), and keep quiet otherwise (cooldowns, suppression of advice that hasn't helped this
// person, nothing new while they are mouthing). Rules only: no model, nothing on the lip-reading path.
import {ADVICE, CATEGORY_RANK, motion, movingScore, scoreCamera, timingText,
  type Baseline, type CameraIssue, type Icon, type IssueId, type Severity, type UtteranceIssue} from './detectors';
import {CoachMetrics} from './metrics';
import {recordEffect, stats, success, unhelpful, usualRate, type HistoryEntry, type Outcome, type Pattern, type Prefs, type Stored} from './profile';
import type {CameraSample} from './signals';
import {tooShortFor, type UtteranceReport} from './utterance';

export const ENTER = 0.65, EXIT = 0.35;     // hysteresis on the smoothed score
const ALPHA = 0.35;                          // smoothing per sample (~5 samples a second)
const MIN_SHOW_MS = 4000;                    // a message stays at least this long unless something serious comes up
const MAX_SHOW_MS = 45_000;                  // ...and at most this long if it isn't being fixed
const UTTERANCE_TTL_MS = 25_000;             // advice about the last utterance expires
const COOLDOWN = {resolved: 20_000, dismissed: 5 * 60_000, ignored: 3 * 60_000, repeatDismissed: 30 * 60_000};

export type Status = 'off' | 'paused' | 'ready' | 'adjusting' | 'degraded' | 'mouth' | 'lost';
export type Shown = {id: IssueId; text: string; severity: Severity; icon: Icon; since: number; source: 'camera' | 'utterance'; alt: boolean};
type Track = {score: number; above: number; active: boolean; since: number};

export class CoachEngine {
  readonly tracks = new Map<CameraIssue, Track>();
  readonly metrics = new CoachMetrics();
  private cooldown = new Map<IssueId, number>();
  private pending: {id: IssueId; conf: number; at: number; text?: string} | null = null;
  private shown: Shown | null = null;
  private lastSample?: CameraSample;
  private speed = 0;
  private lastArticulation = -1e12;
  private awaiting: IssueId | null = null;  // utterance advice shown; the next outcome tells whether it helped
  lastVisibleAt = -1e12;
  pausedUntil = 0;
  capturing = false;

  constructor(public prefs: Prefs, public store: Stored, public trigger: () => 'key' | 'nod' | 'mouth' = () => 'key') {}

  private track(id: CameraIssue): Track {
    let t = this.tracks.get(id);
    if (!t) { t = {score: 0, above: 0, active: false, since: 0}; this.tracks.set(id, t); }
    return t;
  }
  private persistMs(id: IssueId) { return ADVICE[id].persistMs * (this.prefs.intensity === 'practice' ? 0.6 : 1); }

  /** One camera sample (a few per second). Returns the raw scores, for the utterance window. */
  camera(s: CameraSample, base: Baseline | null): Partial<Record<CameraIssue, number>> {
    const raw = scoreCamera(s, base);
    if (s.face) { this.speed = 0.6 * this.speed + 0.4 * motion(this.lastSample, s); raw.moving = movingScore(this.speed); }
    if (s.face) this.lastSample = s;
    const started: IssueId[] = [];
    for (const [id, value] of Object.entries(raw) as [CameraIssue, number][]) {
      const t = this.track(id);
      t.score += ALPHA * (value - t.score);
      if (!t.active) {
        if (t.score >= ENTER) { t.above ||= s.t; if (s.t - t.above >= this.persistMs(id)) { t.active = true; t.since = s.t; started.push(id); } }
        else t.above = 0;
      } else if (t.score < EXIT) { t.active = false; t.above = 0; this.resolved(id, s.t); }
    }
    // a lost face says nothing about lighting or pose: those keep their state until the face is back
    const active = [...this.tracks].filter(([, t]) => t.active).map(([id]) => id);
    this.metrics.tick(s.t, this.status(s.t) === 'ready', active, started);
    return raw;
  }

  private resolved(id: CameraIssue, t: number) {
    if (this.shown?.id !== id) return;
    const ms = t - this.shown.since;
    if (this.visible(t)) { stats(this.store, id).resolved++; stats(this.store, id).resolveMs += ms; this.metrics.resolve(id, ms); }
    this.cooldown.set(id, t + COOLDOWN.resolved * (this.prefs.intensity === 'practice' ? 0.4 : 1));
    this.shown = null;
  }

  status(t: number): Status {
    if (this.paused(t)) return 'paused';
    const on = (id: CameraIssue) => this.tracks.get(id)?.active;
    if (on('tracking_lost') || on('camera_stalled')) return 'lost';
    if (on('mouth_covered') || on('mouth_cut_off') || on('out_of_frame')) return 'mouth';
    const active = [...this.tracks.values()].some(x => x.active);
    if (active) return 'degraded';
    if ([...this.tracks.values()].some(x => x.score >= ENTER)) return 'adjusting';
    return 'ready';
  }
  paused(t: number) { return t < this.pausedUntil; }

  /** Is this advice allowed now, with these preferences and this person's history with it? */
  private allowed(id: IssueId, t: number, fresh: boolean): boolean {
    const a = ADVICE[id];
    if ((this.cooldown.get(id) ?? 0) > t) return false;
    if (this.prefs.intensity === 'minimal' && a.severity !== 'serious') return false;
    if (a.severity === 'info' && this.prefs.intensity !== 'practice' && id !== 'repeat') return false;
    if (this.capturing && fresh && a.severity !== 'serious') return false;  // don't interrupt a sentence
    if (a.severity !== 'serious' && unhelpful(this.store.advice[id]) && !(a.alt && a.category === 'posture')) return false;
    return true;
  }
  private text(id: IssueId, override?: string): {text: string; alt: boolean} {
    const a = ADVICE[id];
    const useAlt = Boolean(a.alt) && a.category === 'posture' && (!this.prefs.posture || unhelpful(this.store.advice[id]));
    const framingAlt = Boolean(a.alt) && a.category === 'framing' && unhelpful(this.store.advice[id]);
    return useAlt || framingAlt ? {text: a.alt!, alt: true} : {text: override ?? a.text, alt: false};
  }

  /** The one recommendation to show now (null: say nothing). Shadow mode decides the same but shows nothing. */
  current(t: number): Shown | null {
    if (this.paused(t)) { this.shown = null; return null; }
    if (this.pending && t - this.pending.at > UTTERANCE_TTL_MS) this.pending = null;
    // the current message: keep it while it is still true, for a while at least
    let keep = this.shown && (this.shown.source === 'camera' ? this.tracks.get(this.shown.id as CameraIssue)?.active : this.pending?.id === this.shown.id);
    if (this.shown && keep && this.shown.source === 'camera' && t - this.shown.since > MAX_SHOW_MS) {
      // shown for long and not fixed: they can't or won't; stop nagging and learn from it
      recordEffect(this.store, this.shown.id, false); this.cooldown.set(this.shown.id, t + COOLDOWN.ignored); keep = false;
    }
    if (!keep) this.shown = null;
    const options: {id: IssueId; score: number; source: 'camera' | 'utterance'; text?: string}[] = [];
    for (const [id, tr] of this.tracks) if (tr.active && this.allowed(id, t, this.shown?.id !== id)) options.push({id, score: tr.score, source: 'camera'});
    if (this.pending && !this.capturing && this.allowed(this.pending.id, t, this.shown?.id !== this.pending.id)) options.push({id: this.pending.id, score: this.pending.conf, source: 'utterance', text: this.pending.text});
    const rank = (o: {id: IssueId; score: number}) => CATEGORY_RANK[ADVICE[o.id].category] * 10 - o.score;
    options.sort((a, b) => rank(a) - rank(b));
    const best = options[0];
    if (this.shown) {
      const better = best && best.id !== this.shown.id && CATEGORY_RANK[ADVICE[best.id].category] < CATEGORY_RANK[ADVICE[this.shown.id].category]
        && (t - this.shown.since >= MIN_SHOW_MS || ADVICE[best.id].severity === 'serious');
      if (!better) return this.output(t);
    }
    if (!best) return this.output(t);
    const {text, alt} = this.text(best.id, best.text);
    const a = ADVICE[best.id];
    this.shown = {id: best.id, text, severity: a.severity, icon: a.icon, since: t, source: best.source, alt};
    if (!this.prefs.shadow) { stats(this.store, best.id).shown++; this.metrics.show(best.id); }
    if (best.source === 'utterance') this.awaiting = best.id;
    return this.output(t);
  }
  private output(t: number): Shown | null {
    if (!this.shown || this.prefs.shadow) return null;
    this.lastVisibleAt = t;
    return this.shown;
  }
  private visible(t: number) { return !this.prefs.shadow && !this.paused(t); }
  /** What the coach would say, shown or not (debug panel, shadow sessions). */
  get decided() { return this.shown; }

  dismiss(t: number) {
    const s = this.shown; if (!s) return;
    const a = stats(this.store, s.id); a.dismissed++;
    this.metrics.dismiss(s.id);
    this.cooldown.set(s.id, t + (a.dismissed >= 3 ? COOLDOWN.repeatDismissed : COOLDOWN.dismissed) * (this.prefs.intensity === 'practice' ? 0.4 : 1));
    if (s.source === 'utterance') { this.pending = null; this.awaiting = null; }
    this.shown = null;
  }

  // Utterances ---------------------------------------------------------------------------------------------
  startCapture() { this.capturing = true; if (this.shown?.source === 'utterance') this.shown = null; this.pending = null; }
  endCapture() { this.capturing = false; }

  /** Right when the lip-reader answers (or fails): was the recording itself sound? */
  result(t: number, r: UtteranceReport, topText: string, errorCode?: string) {
    const advice = adviseOnResult(r, topText, this.trigger(), errorCode);
    if (advice) this.pending = {...advice, at: t};
  }

  /** What the person did with the options: learn from it, and maybe advise on pace or articulation. */
  outcome(t: number, r: UtteranceReport, outcome: Outcome, entry: HistoryEntry, patterns: Pattern[]) {
    if (this.awaiting) { recordEffect(this.store, this.awaiting, success(outcome)); this.awaiting = null; }
    if (success(outcome)) { if (this.pending && ADVICE[this.pending.id].category !== 'timing') this.pending = null; }
    const advice = adviseOnOutcome(r, outcome, entry, this.store.history, patterns, t - this.lastArticulation > 5 * 60_000);
    if (!advice) return;
    if (advice.id === 'articulation') this.lastArticulation = t;
    // advice about the recording itself, given with the results, comes first
    if (this.pending && CATEGORY_RANK[ADVICE[this.pending.id].category] <= CATEGORY_RANK[ADVICE[advice.id].category]) return;
    this.pending = {...advice, at: t};
  }

  /** Did advice show in the last minute (for before/after comparisons)? */
  coachedRecently(t: number) { return t - this.lastVisibleAt < 60_000; }
  /** Scores and states for the debug panel. */
  debug() { return [...this.tracks].map(([id, tr]) => ({id, score: tr.score, active: tr.active})).sort((a, b) => b.score - a.score); }
}

const SEEN = 0.6;  // mean camera score over an utterance that counts as "it was like that during it"

/** Advice from the recording alone: a visual problem during it, then completeness. */
export function adviseOnResult(r: UtteranceReport, topText: string, trigger: 'key' | 'nod' | 'mouth', errorCode?: string): {id: IssueId; conf: number; text?: string} | null {
  // only blame a visual problem that was actually there while they mouthed
  const visual: CameraIssue[] = ['tracking_lost', 'mouth_covered', 'mouth_cut_off', 'out_of_frame', 'too_dark', 'backlit', 'too_far', 'glare'];
  for (const id of visual) if ((r.camera[id] ?? 0) >= SEEN) return {id, conf: r.camera[id]!};
  if (errorCode === 'no_face' || errorCode === 'crop_failed') return {id: 'out_of_frame', conf: 0.7, text: 'Keep your whole face in frame.'};
  if (r.issues.held_too_long) return {id: 'held_too_long', conf: 1};
  if (r.issues.clipped_start) return {id: 'clipped_start', conf: 0.8, text: timingText('clipped_start', trigger)};
  if (r.issues.clipped_end) return {id: 'clipped_end', conf: 0.8, text: timingText('clipped_end', trigger)};
  if (r.issues.too_few_frames || errorCode === 'too_short') return {id: 'too_few_frames', conf: 0.8};
  // far less movement than the sentence needs: the recording missed part of it
  if (topText && tooShortFor(r, topText)) return {id: 'clipped_end', conf: 0.6, text: timingText('clipped_end', trigger)};
  if (r.issues.held_still) return {id: 'held_still', conf: r.issues.held_still};
  return null;
}

/** Advice once we know whether it worked. Pace and articulation only with evidence for this person. */
export function adviseOnOutcome(r: UtteranceReport, outcome: Outcome, entry: HistoryEntry, history: HistoryEntry[],
  patterns: Pattern[], articulationAllowed: boolean): {id: UtteranceIssue | CameraIssue; conf: number} | null {
  if (success(outcome)) return {id: 'clear', conf: 0.5};
  const has = (c: Pattern['condition']) => patterns.find(p => p.condition === c);
  const usual = usualRate(history);
  const rate = entry.rate;
  if (usual !== null && rate !== null && rate > usual * 1.25 && has('fast')) return {id: 'fast_pace', conf: Math.min(1, has('fast')!.z / 3)};
  if (usual !== null && rate !== null && rate < usual * 0.8 && has('slow')) return {id: 'slow_pace', conf: Math.min(1, has('slow')!.z / 3)};
  if (entry.cond.long && has('long')) return {id: 'long_phrases', conf: 0.7};
  if (entry.cond.dim && has('dim')) return {id: 'too_dark', conf: 0.7};
  if (entry.cond.headDown && has('headDown')) return {id: 'head_down', conf: 0.7};
  if (entry.cond.unstable && has('unstable')) return {id: 'held_still', conf: 0.7};
  if (r.issues.low_motion) return {id: 'low_motion', conf: r.issues.low_motion};
  // no known cause: after repeated misses, a neutral nudge; after many, a sparing articulation hint
  const recent = [...history.slice(-3), entry];  // `entry` is not in the history yet
  const misses = recent.filter(e => !success(e.outcome)).length;
  if (misses >= 3 && articulationAllowed) return {id: 'articulation', conf: 0.6};
  if (misses >= 2) return {id: 'repeat', conf: 0.5};
  return null;
}

