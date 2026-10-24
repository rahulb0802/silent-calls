// The camera coach in the app: feeds the engine from the landmarks mouth-tracking already computes and the
// hands-free face samples, follows each utterance through the lip-reader and the person's pick, and keeps
// the per-profile baseline and history. Runs beside the pipeline: every callback is cheap, wrapped, and
// never blocks capture, lip-reading or speech.
import {useCallback, useEffect, useRef, useState} from 'react';
import type {CaptureClip} from '../capture/buffer';
import type {FaceSample} from '../capture/hands-free';
import type {Candidate, MeetingPort} from '../services/meeting-port';
import {loadSettings} from '../services/settings';
import type {CameraIssue} from './detectors';
import {CoachEngine, type Shown, type Status} from './engine';
import {outcomes} from './metrics';
import {addHistory, baselineFrom, emptyStore, findPatterns, loadStore, nudgeBaseline, saveStore, storageKey,
  type BaselineInput, type HistoryEntry, type Outcome, type Prefs, type Stored} from './profile';
import {CameraSampler} from './sampler';
import type {CameraSample} from './signals';
import {activeLevel, agreement, analyzeClip, pace, type ClipInfo, type ServerQuality, type Trigger, type UtteranceReport} from './utterance';

const FACE_KEEP_MS = 20_000;
export const CALIBRATION_PHRASES = ['sounds good', 'I can hear you now', 'let me check my calendar'];
const STILL_MS = 4000;
export type CoachCalibration = {step: 'idle' | 'still' | 'phrases' | 'done' | 'failed'; secondsLeft: number; phrase: number; message: string};

function baselineInput(s: CameraSample): BaselineInput | null {
  if (!s.face || !s.faceBox || !s.light) return null;
  return {faceH: s.faceBox.h, cx: s.faceBox.x + s.faceBox.w / 2, cy: s.faceBox.y + s.faceBox.h / 2,
    yaw: s.yaw ?? 0, pitch: s.pitch ?? 0, roll: s.roll ?? 0,
    faceMean: s.light.face.mean, mouthCheek: s.light.mouthCheek, mouthStd: s.light.mouth.std, sharp: s.light.mouth.sharp};
}

export function useCameraCoach(port: MeetingPort, cameraOn: boolean, fps: number) {
  const key = useRef(storageKey(loadSettings().profileId));
  const store = useRef<Stored>(loadStore(key.current));
  const trigger = useRef<Trigger>('key');
  const engine = useRef(new CoachEngine(store.current.prefs, store.current, () => trigger.current));
  const sampler = useRef<CameraSampler | null>(null);
  const fpsRef = useRef(fps); fpsRef.current = fps;
  const face = useRef<FaceSample[]>([]);
  const camera = useRef<{t: number; raw: Partial<Record<CameraIssue, number>>}[]>([]);
  const idle = useRef<number[]>([]);
  const noise = useRef(0.4);
  const lastLandmarks = useRef(0);
  const lastGood = useRef<BaselineInput | null>(null);
  // the utterance in flight: its clip, analysis, and the lip-reader's answer
  const utt = useRef<{clip: ClipInfo; report: UtteranceReport; candidates: Candidate[]; confidence?: number; done: boolean} | null>(null);
  const calib = useRef<{step: 'still' | 'phrases'; until: number; still: BaselineInput[]; phrase: number; activeFrom: number; quietSince: number; activeMs: number; rates: number[]} | null>(null);
  const [calibration, setCalibration] = useState<CoachCalibration>({step: 'idle', secondsLeft: 0, phrase: 0, message: ''});
  const [view, setView] = useState<{shown: Shown | null; status: Status}>({shown: null, status: 'off'});
  const [prefs, setPrefsState] = useState<Prefs>(store.current.prefs);
  const [revision, setRevision] = useState(0);  // bumps when the stored profile changes (debug panel)

  const persist = useCallback(() => { saveStore(key.current, store.current); setRevision(r => r + 1); }, []);
  const reload = useCallback(() => {
    key.current = storageKey(loadSettings().profileId);
    store.current = loadStore(key.current);
    engine.current = new CoachEngine(store.current.prefs, store.current, () => trigger.current);
    setPrefsState(store.current.prefs); setRevision(r => r + 1);
  }, []);
  useEffect(() => {
    // each profile has its own baseline and history
    const changed = (event?: StorageEvent) => { if (!event || event.key === 'silent-calls:services:v1' || event.key === null) { if (storageKey(loadSettings().profileId) !== key.current) reload(); } };
    window.addEventListener('storage', changed); window.addEventListener('silent-calls:settings', changed as () => void);
    return () => { window.removeEventListener('storage', changed); window.removeEventListener('silent-calls:settings', changed as () => void); };
  }, [reload]);

  /** Landmarks from one tracking pass (about 15 a second); the coach looks at most 5 times a second. */
  const onLandmarks = useCallback((video: HTMLVideoElement, points: {x: number; y: number}[] | null, pose: {yaw: number; pitch: number} | null, now: number) => {
    try {
      lastLandmarks.current = now;
      const t0 = performance.now();
      sampler.current ??= new CameraSampler();
      const s = sampler.current.sample(video, points, pose, now, fpsRef.current);
      if (!s) return;
      const e = engine.current;
      const raw = e.camera(s, store.current.baseline);
      camera.current.push({t: now, raw});
      while (camera.current.length && camera.current[0].t < now - FACE_KEEP_MS) camera.current.shift();
      const input = baselineInput(s);
      // a calm, clean moment: a candidate for slowly refining the baseline, if the next utterance works
      if (input && Object.values(raw).every(v => (v ?? 0) < 0.2)) lastGood.current = input;
      const c = calib.current;
      if (c?.step === 'still') {
        if (input && (raw.moving ?? 0) < 0.3) c.still.push(input);
        if (now >= c.until) {
          const base = baselineFrom(c.still);
          if (!base) { calib.current = null; setCalibration({step: 'failed', secondsLeft: 0, phrase: 0, message: 'Couldn’t see your face clearly. Face the camera in good light and try again.'}); }
          else {
            store.current.baseline = base; persist();
            calib.current = {...c, step: 'phrases', phrase: 0, activeFrom: 0, quietSince: 0, activeMs: 0, rates: [], until: now + 30_000};
            setCalibration({step: 'phrases', secondsLeft: 0, phrase: 0, message: ''});
          }
        } else setCalibration(p => ({...p, secondsLeft: Math.ceil((c.until - now) / 1000)}));
      }
      e.metrics.cost(performance.now() - t0);
    } catch { /* the coach must never break tracking */ }
  }, [persist]);

  /** Hands-free face samples: the mouth-movement timeline the utterance analysis reads. */
  const onFace = useCallback((s: FaceSample) => {
    face.current.push(s);
    while (face.current.length && face.current[0].t < s.t - FACE_KEEP_MS) face.current.shift();
    if (!engine.current.capturing && s.face && !calib.current) {
      idle.current.push(s.mouth); if (idle.current.length > 150) idle.current.shift();
      if (idle.current.length % 15 === 0) noise.current = [...idle.current].sort((a, b) => a - b)[idle.current.length >> 1];
    }
    const c = calib.current;
    if (c?.step === 'phrases' && s.face) {
      // one mouthed phrase = movement, then 0.9 s of quiet
      const on = s.mouth >= activeLevel(noise.current);
      if (on) { c.activeFrom ||= s.t; c.quietSince = 0; c.activeMs += 66; }
      else if (c.activeFrom) {
        c.quietSince ||= s.t;
        if (s.t - c.quietSince > 900) {
          const words = CALIBRATION_PHRASES[c.phrase].split(' ').length;
          if (c.activeMs >= 300) { c.rates.push(words / (c.activeMs / 1000)); c.phrase++; }
          c.activeFrom = 0; c.quietSince = 0; c.activeMs = 0;
          if (c.phrase >= CALIBRATION_PHRASES.length) {
            calib.current = null;
            store.current.pace = {rates: c.rates}; persist();
            setCalibration({step: 'done', secondsLeft: 0, phrase: c.phrase, message: ''});
          } else setCalibration(p => ({...p, phrase: c.phrase}));
        }
      }
      if (s.t > c.until) { calib.current = null; persist(); setCalibration({step: 'done', secondsLeft: 0, phrase: c.phrase, message: 'Saved your camera view. Phrase timing will be learned as you talk.'}); }
    }
  }, [persist]);

  const onClipStart = useCallback((by?: Trigger) => { if (by) trigger.current = by; engine.current.startCapture(); utt.current = null; }, []);
  const onClipEnd = useCallback((clip: CaptureClip) => {
    engine.current.endCapture();
    try {
      const info: ClipInfo = {id: clip.id, firstMs: clip.frames[0]?.timestampMs ?? clip.pressedAtMs, lastMs: clip.frames.at(-1)?.timestampMs ?? clip.releasedAtMs,
        pressedAtMs: clip.pressedAtMs, releasedAtMs: clip.releasedAtMs, endedBy: clip.endedBy, frames: clip.frames.length};
      const window = camera.current.filter(x => x.t >= info.firstMs && x.t <= info.lastMs).map(x => x.raw);
      utt.current = {clip: info, report: analyzeClip(info, trigger.current, face.current, window, noise.current), candidates: [], done: false};
    } catch { utt.current = null; }
  }, []);
  const onClipCancel = useCallback(() => { engine.current.endCapture(); }, []);

  /** Record what happened to the utterance and learn from it. */
  const finish = useCallback((outcome: Outcome, text: string, picked?: Candidate) => {
    const u = utt.current;
    if (!u || u.done) return;
    u.done = true;
    const now = performance.now(), e = engine.current, s = store.current;
    const words = text.trim().split(/\s+/).filter(Boolean).length;
    const lipBest = u.candidates.filter(c => c.lipScore !== undefined).sort((a, b) => (b.lipScore ?? 0) - (a.lipScore ?? 0))[0];
    const entry: HistoryEntry = {
      at: Date.now(), outcome, lipTop: Boolean(picked && lipBest && picked.id === lipBest.id), words, activeMs: Math.round(u.report.activeMs),
      rate: words ? pace(u.report, text) : null, confidence: u.confidence, agreement: agreement(u.candidates.map(c => c.text)),
      coached: e.coachedRecently(now), shadow: s.prefs.shadow,
      cond: {dim: (u.report.camera.too_dark ?? 0) >= 0.4 || (u.report.camera.backlit ?? 0) >= 0.4, headDown: (u.report.camera.head_down ?? 0) >= 0.4,
        unstable: (u.report.camera.moving ?? 0) >= 0.4, long: words >= 8},
    };
    e.outcome(now, u.report, outcome, entry, findPatterns(s.history));
    addHistory(s, entry);
    if ((outcome === 'top' || outcome === 'alt') && lastGood.current) {
      s.baseline = s.baseline ? nudgeBaseline(s.baseline, lastGood.current) : s.baseline;
    }
    persist();
  }, [persist]);

  // the lip-reader's answer (and errors): the server's quality report joins the analysis
  useEffect(() => port.subscribe(event => {
    const u = utt.current;
    if (!u || u.done) return;
    try {
      if (event.type === 'candidates' && event.utteranceId === u.clip.id) {
        const server = event.qualityData as ServerQuality | undefined;
        const window = camera.current.filter(x => x.t >= u.clip.firstMs && x.t <= u.clip.lastMs).map(x => x.raw);
        u.report = analyzeClip(u.clip, u.report.trigger, face.current, window, noise.current, server);
        u.candidates = event.candidates; u.confidence = event.confidence;
        engine.current.result(performance.now(), u.report, event.candidates[0]?.text ?? '');
      }
      if (event.type === 'error' && event.utteranceId === u.clip.id) {
        // only failures about the video are the person's to fix; network and server trouble are not
        if (event.code === 'no_face' || event.code === 'crop_failed' || event.code === 'too_short') {
          engine.current.result(performance.now(), u.report, '', event.code);
          finish('failed', '');
        } else u.done = true;
      }
    } catch { /* never affects the result itself */ }
  }), [port, finish]);

  /** The person confirmed a candidate (possibly edited), or rejected all of them. */
  const recordPick = useCallback((candidate: Candidate | null, editedText?: string) => {
    const u = utt.current;
    if (!u) return;
    if (!candidate) { finish('rejected', u.candidates[0]?.text ?? ''); return; }
    const text = editedText ?? candidate.text;
    const edited = editedText !== undefined && editedText.trim().toLowerCase() !== candidate.text.trim().toLowerCase();
    finish(edited ? 'edited' : u.candidates.indexOf(candidate) <= 0 ? 'top' : 'alt', text, edited ? undefined : candidate);
  }, [finish]);

  // decide twice a second; stalled camera: no landmark passes at all while the camera is on
  useEffect(() => {
    if (!cameraOn) { engine.current.metrics.gap(); setView({shown: null, status: 'off'}); return; }
    const timer = setInterval(() => {
      const now = performance.now(), e = engine.current;
      if (lastLandmarks.current && now - lastLandmarks.current > 1500)
        e.camera({t: now, face: false, frameW: 0, frameH: 0, fps: 0, frozen: true}, store.current.baseline);
      const shown = e.current(now), status = lastLandmarks.current ? e.status(now) : 'off';
      setView(v => v.shown === shown && v.status === status ? v : {shown, status});
    }, 500);
    return () => clearInterval(timer);
  }, [cameraOn]);

  const setPrefs = useCallback((next: Partial<Prefs>) => {
    const merged = {...store.current.prefs, ...next};
    store.current.prefs = merged; engine.current.prefs = merged; setPrefsState(merged); persist();
  }, [persist]);

  return {
    shown: view.shown, status: view.status, prefs, setPrefs, revision, calibration,
    onLandmarks, onFace, onClipStart, onClipEnd, onClipCancel, recordPick,
    dismiss: () => { engine.current.dismiss(performance.now()); persist(); setView(v => ({...v, shown: null})); },
    pause: (ms: number) => { engine.current.pausedUntil = performance.now() + ms; setView(v => ({...v, shown: null, status: 'paused'})); },
    resume: () => { engine.current.pausedUntil = 0; },
    paused: () => engine.current.paused(performance.now()),
    calibrate: () => { calib.current = {step: 'still', until: performance.now() + STILL_MS, still: [], phrase: 0, activeFrom: 0, quietSince: 0, activeMs: 0, rates: []}; setCalibration({step: 'still', secondsLeft: STILL_MS / 1000, phrase: 0, message: ''}); },
    skipCalibration: () => { calib.current = null; setCalibration({step: 'done', secondsLeft: 0, phrase: 0, message: ''}); },
    resetPersonalization: () => { const prefsNow = store.current.prefs; store.current = {...emptyStore(), prefs: prefsNow}; engine.current = new CoachEngine(prefsNow, store.current, () => trigger.current); persist(); },
    markFalseAlarm: () => { const s = engine.current.decided; if (s) { engine.current.metrics.markFalseAlarm(s.id); engine.current.dismiss(performance.now()); } },
    debug: () => {
      const e = engine.current, s = store.current;
      return {status: e.status(performance.now()), decided: e.decided, scores: e.debug(), latency: e.metrics.latencyStats(), metrics: e.metrics,
        outcomes: outcomes(s.history), patterns: findPatterns(s.history), baseline: s.baseline, pace: s.pace ?? null, advice: s.advice,
        last: utt.current ? {report: utt.current.report, done: utt.current.done} : null, noise: noise.current, history: s.history.length};
    },
  };
}
export type CameraCoach = ReturnType<typeof useCameraCoach>;
