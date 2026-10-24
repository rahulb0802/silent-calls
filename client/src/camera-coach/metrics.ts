// Camera coach instrumentation: is the camera usable, which problems come up and for how long, what advice
// was shown, dismissed and resolved, what the coach costs per frame, and whether recognition is better with
// coaching than without (shadow sessions detect everything but show nothing).
import type {IssueId} from './detectors';
import {success, type HistoryEntry} from './profile';

type Counts = Partial<Record<IssueId, number>>;
const bump = (c: Counts, id: IssueId, by = 1) => { c[id] = (c[id] ?? 0) + by; };

export class CoachMetrics {
  cameraMs = 0; usableMs = 0;
  issueMs: Counts = {}; issueCount: Counts = {};
  shown: Counts = {}; dismissed: Counts = {}; resolved: Counts = {}; resolveMs: Counts = {}; falseAlarm: Counts = {};
  private last = 0;
  private latency: number[] = [];

  /** Once per camera sample: time with a usable view, time each problem was active. */
  tick(t: number, usable: boolean, active: IssueId[], started: IssueId[]) {
    const dt = this.last ? Math.min(1000, t - this.last) : 0; this.last = t;
    this.cameraMs += dt; if (usable) this.usableMs += dt;
    for (const id of active) bump(this.issueMs, id, dt);
    for (const id of started) bump(this.issueCount, id);
  }
  gap() { this.last = 0; }  // camera off or paused: don't count the time in between
  show(id: IssueId) { bump(this.shown, id); }
  dismiss(id: IssueId) { bump(this.dismissed, id); }
  resolve(id: IssueId, ms: number) { bump(this.resolved, id); bump(this.resolveMs, id, ms); }
  markFalseAlarm(id: IssueId) { bump(this.falseAlarm, id); }
  cost(ms: number) { this.latency.push(ms); if (this.latency.length > 300) this.latency.shift(); }

  latencyStats() {
    const s = [...this.latency].sort((a, b) => a - b);
    return {n: s.length, mean: s.length ? s.reduce((a, b) => a + b, 0) / s.length : 0, p95: s[Math.floor(s.length * 0.95)] ?? 0, max: s.at(-1) ?? 0};
  }
}

export type Comparison = {n: number; success: number; top1: number; corrected: number};
function compare(rows: HistoryEntry[]): Comparison {
  const n = rows.length, share = (f: (e: HistoryEntry) => boolean) => n ? rows.filter(f).length / n : 0;
  return {n, success: share(e => success(e.outcome)), top1: share(e => e.outcome === 'top'), corrected: share(e => e.outcome === 'edited' || e.outcome === 'rejected')};
}
/** Recognition with and without recent advice, and live against shadow (no-coaching) sessions. */
export function outcomes(history: HistoryEntry[]) {
  const live = history.filter(e => !e.shadow);
  return {
    all: compare(history),
    coached: compare(live.filter(e => e.coached)), uncoached: compare(live.filter(e => !e.coached)),
    live: compare(live), shadow: compare(history.filter(e => e.shadow)),
    meanActiveMs: history.length ? history.reduce((a, e) => a + e.activeMs, 0) / history.length : 0,
    repeatRate: history.length ? history.filter(e => e.outcome === 'rejected').length / history.length : 0,
  };
}
