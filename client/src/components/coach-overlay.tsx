import {useEffect, useState} from 'react';
import {AlertTriangle, Camera, Check, Clock, Eye, Gauge, Move, RotateCcw, Sun, User, X} from 'lucide-react';
import type {CameraCoach} from '../camera-coach/use-camera-coach';
import {CALIBRATION_PHRASES} from '../camera-coach/use-camera-coach';
import type {Icon} from '../camera-coach/detectors';
import type {Status} from '../camera-coach/engine';
import type {Intensity} from '../camera-coach/profile';

const ICONS: Record<Icon, typeof Eye> = {eye: Eye, move: Move, sun: Sun, user: User, camera: Camera, clock: Clock, gauge: Gauge, repeat: RotateCcw, check: Check};
const STATUS: Record<Status, string> = {off: 'Coach off', paused: 'Coaching paused', ready: 'Ready', adjusting: 'Adjusting camera',
  degraded: 'Camera quality degraded', mouth: 'Mouth visibility issue', lost: 'Tracking lost'};

/** Status chip and the one current recommendation, over the camera preview (or in the compact strip). */
export function CoachOverlay({coach, compact = false}: {coach: CameraCoach; compact?: boolean}) {
  const s = coach.shown;
  if (coach.status === 'off') return null;
  const Icon = s ? ICONS[s.icon] : null;
  return <div className={`coach-overlay ${compact ? 'is-compact' : ''}`}>
    {!compact && <span className={`coach-status status-${coach.status}`}><i/>{STATUS[coach.status]}</span>}
    {s && Icon && <div className={`coach-message severity-${s.severity}`} role={s.severity === 'serious' ? 'alert' : 'status'}>
      {s.severity === 'serious' ? <AlertTriangle size={14}/> : <Icon size={14}/>}<span>{s.text}</span>
      <button aria-label="Dismiss this tip" onClick={coach.dismiss}><X size={13}/></button>
    </div>}
  </div>;
}

/** Camera coach preferences, calibration and reset (in the companion's settings). */
export function CoachSettings({coach, cameraOn}: {coach: CameraCoach; cameraOn: boolean}) {
  const p = coach.prefs, c = coach.calibration;
  const [paused, setPaused] = useState(coach.paused());
  useEffect(() => { const timer = setInterval(() => setPaused(coach.paused()), 1000); return () => clearInterval(timer); }, [coach]);
  return <section className="hands-free coach-settings" aria-label="Camera coach">
    <h2>Camera coach</h2>
    <p className="capture-help">Short tips when your camera view or timing makes lip-reading harder. It learns what works for you. Video stays on this device; only numbers about each phrase are kept.</p>
    <div className="hands-free-row"><label htmlFor="coach-intensity">Tips</label><select id="coach-intensity" value={p.intensity} onChange={event => coach.setPrefs({intensity: event.target.value as Intensity})}>
      <option value="minimal">Minimal: only serious camera problems</option><option value="adaptive">Adaptive: when it is likely to help</option><option value="practice">Practice: more feedback between phrases</option></select></div>
    <label className="coach-check"><input type="checkbox" checked={p.posture} onChange={event => coach.setPrefs({posture: event.target.checked})}/>Posture suggestions (otherwise: camera placement tips)</label>
    <label className="coach-check"><input type="checkbox" checked={p.keepHistory} onChange={event => coach.setPrefs({keepHistory: event.target.checked})}/>Remember results between sessions (numbers only, on this device)</label>
    <div className="hands-free-row">{paused ? <button className="icon-text" onClick={coach.resume}>Resume coaching</button> : <button className="icon-text" onClick={() => coach.pause(15 * 60_000)}>Pause for 15 min</button>}</div>
    <div className="hands-free-row">{c.step === 'still' ? <strong className="hands-free-calibrating">Sit as you usually do and face the camera… {c.secondsLeft}</strong>
      : c.step === 'phrases' ? <><strong className="hands-free-calibrating">Mouth: “{CALIBRATION_PHRASES[c.phrase]}” ({c.phrase + 1}/{CALIBRATION_PHRASES.length})</strong><button className="icon-text" onClick={coach.skipCalibration}>Skip</button></>
      : <><button className="icon-text" disabled={!cameraOn} onClick={coach.calibrate}>Calibrate my view</button><button className="icon-text" onClick={() => { if (confirm('Forget your camera baseline and what the coach learned about you?')) coach.resetPersonalization(); }}>Reset what it learned</button></>}</div>
    {c.step === 'failed' && <p className="capture-error">{c.message}</p>}
    {c.step === 'done' && <p className="capture-help">{c.message || 'Saved. The coach now compares against your usual view.'}</p>}
  </section>;
}

const pct = (x: number) => `${Math.round(x * 100)}%`;
/** Developer panel: detector scores, the current decision, costs, and whether coaching helps. */
export function CoachDebug({coach}: {coach: CameraCoach}) {
  const [d, setD] = useState(coach.debug);
  useEffect(() => { const timer = setInterval(() => setD(coach.debug()), 500); return () => clearInterval(timer); }, [coach]);
  const o = d.outcomes, m = d.metrics, usable = m.cameraMs ? m.usableMs / m.cameraMs : 0;
  return <div className="coach-debug">
    <p><b>{d.status}</b> · decided: {d.decided ? `${d.decided.id} (“${d.decided.text}”)` : 'nothing'} · coach cost {d.latency.mean.toFixed(2)} ms avg, {d.latency.p95.toFixed(2)} ms p95 ({d.latency.n} samples)</p>
    <table><tbody>{d.scores.slice(0, 10).map(row => <tr key={row.id} className={row.active ? 'is-active' : ''}><td>{row.id}</td><td><meter min={0} max={1} value={row.score}/></td><td>{row.score.toFixed(2)}</td></tr>)}</tbody></table>
    <p>Usable camera {pct(usable)} of {Math.round(m.cameraMs / 1000)} s · shown {JSON.stringify(m.shown)} · dismissed {JSON.stringify(m.dismissed)} · resolved {JSON.stringify(m.resolved)} · false alarms {JSON.stringify(m.falseAlarm)}</p>
    <p>Utterances {o.all.n}: picked {pct(o.all.success)}, top-1 {pct(o.all.top1)}, corrected {pct(o.all.corrected)} · coached {o.coached.n} ({pct(o.coached.success)}) vs not {o.uncoached.n} ({pct(o.uncoached.success)}) · shadow {o.shadow.n} ({pct(o.shadow.success)})</p>
    <p>Patterns: {d.patterns.length ? d.patterns.map(p => `${p.condition} ${pct(p.withRate)} vs ${pct(p.withoutRate)} (n ${p.nWith}/${p.nWithout}, z ${p.z.toFixed(1)})`).join('; ') : 'none with enough evidence'}</p>
    {d.last && <p>Last: {Math.round(d.last.report.durationMs)} ms recorded, {Math.round(d.last.report.activeMs)} ms moving, onset {Math.round(d.last.report.onsetMs)} ms, tail {Math.round(d.last.report.tailMs)} ms, face {pct(d.last.report.faceRate)}, issues {JSON.stringify(d.last.report.issues)}</p>}
    <p>Baseline: {d.baseline ? `face ${d.baseline.faceH.toFixed(2)}, pitch ${d.baseline.pitch.toFixed(1)}°, light ${d.baseline.faceMean.toFixed(0)}` : 'not calibrated'} · resting mouth {d.noise.toFixed(2)}</p>
    <div className="hands-free-row"><button className="icon-text" disabled={!d.decided} onClick={coach.markFalseAlarm}>Mark current tip as a false alarm</button>
      <label className="coach-check"><input type="checkbox" checked={coach.prefs.shadow} onChange={event => coach.setPrefs({shadow: event.target.checked})}/>Shadow session (detect, show nothing)</label></div>
  </div>;
}
