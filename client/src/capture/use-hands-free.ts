import { useCallback, useEffect, useRef, useState } from 'react';
import { loadSettings } from '../services/settings';
import { HandsFree, calibrate as calibrateFrom, type FaceSample, type GestureMode, type HandsFreeEvent, type HandsFreePhase, type StartBy } from './hands-free';

// Saved per profile: each person's calibration and gesture sizes are their own.
const BASE = 'silent-calls:hands-free:v1';
function key(): string {
  const profile = loadSettings().profileId.trim().toLowerCase();
  return profile ? `${BASE}:${encodeURIComponent(profile)}` : BASE;
}
type Saved = { enabled: boolean; mode: GestureMode; startBy: StartBy; mouthOn?: number; nodDeg?: number; turnDeg?: number };
const positive = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : undefined;
function load(): Saved {
  try {
    // settings saved before they were per profile carry over until this profile saves its own
    const value = JSON.parse(localStorage.getItem(key()) || localStorage.getItem(BASE) || '{}');
    return { enabled: true, mode: value.mode === 'face' ? 'face' : 'head', startBy: value.startBy === 'mouth' ? 'mouth' : 'nod',
      mouthOn: positive(value.mouthOn), nodDeg: positive(value.nodDeg), turnDeg: positive(value.turnDeg) };
  } catch { return { enabled: true, mode: 'head', startBy: 'nod' }; }
}
const engineConfig = (s: Saved) => ({ mode: s.mode, startBy: s.startBy, mouthOn: s.mouthOn, nodDeg: s.nodDeg, turnDeg: s.turnDeg });
export type Calibration = { step: 'idle' | 'rest' | 'mouth' | 'done' | 'failed'; secondsLeft: number };
const REST_MS = 4000, MOUTH_MS = 5000;

/** Hands-free control: feed it face samples (onSample), tell it the current phase, and it calls onEvent.
 * `talkingAt`: performance.now() of the other person's latest live caption; they count as talking for
 * 1.5 s after it (a caption that never finalizes can't block starts forever). */
export function useHandsFree(phase: HandsFreePhase, talkingAt: number, suggestions: boolean, onEvent: (event: HandsFreeEvent) => void) {
  const [saved, setSaved] = useState<Saved>(load);
  const engine = useRef(new HandsFree(engineConfig(saved)));
  const state = useRef({ phase, talkingAt, suggestions, onEvent, enabled: saved.enabled });
  state.current = { phase, talkingAt, suggestions, onEvent, enabled: saved.enabled };
  const [meter, setMeter] = useState({ level: 0, threshold: engine.current.threshold });
  const [calibration, setCalibration] = useState<Calibration>({ step: 'idle', secondsLeft: 0 });
  const calib = useRef<{ step: 'rest' | 'mouth'; until: number; rest: FaceSample[]; mouth: FaceSample[] } | null>(null);
  const lastCalibration = useRef<unknown>(null);  // the readings from the last calibration, to save for tuning
  const lastMeter = useRef(0);
  const practiceUntil=useRef(0);
  // Tuning recording: 15 s of face readings (numbers only, no images), saved as a JSON file.
  const rec = useRef<{ until: number; start: number; rows: unknown[] } | null>(null);
  const [recording, setRecording] = useState(0);

  const save = useCallback((next: Saved) => {
    next={...next,enabled:true};
    setSaved(next);
    engine.current.config = engineConfig(next);
    try { localStorage.setItem(key(), JSON.stringify(next)); } catch { /* settings stay for this session */ }
  }, []);

  useEffect(()=>{
    const sync=(event?:StorageEvent)=>{
      if(!event || event.key==='silent-calls:gesture-practice:v1'){
        try{practiceUntil.current=JSON.parse(localStorage.getItem('silent-calls:gesture-practice:v1') || '{}').until || 0;}catch{practiceUntil.current=0;}
      }
      // another window saved these settings (gesture practice in the main window), or the profile changed
      if(event && (event.key===key() || event.key===null || event.key==='silent-calls:services:v1')){
        const next=load();setSaved(next);engine.current=new HandsFree(engineConfig(next));
      }
    };
    const profile=()=>{const next=load();setSaved(next);engine.current=new HandsFree(engineConfig(next));};
    sync();window.addEventListener('storage',sync);window.addEventListener('silent-calls:settings',profile);
    return()=>{window.removeEventListener('storage',sync);window.removeEventListener('silent-calls:settings',profile);};
  },[]);

  const onSample = useCallback((sample: FaceSample) => {
    const r = rec.current;
    if (r) {
      const e = engine.current;
      r.rows.push({ ...sample, t: Math.round(sample.t - r.start), smoothed: +e.mouth.toFixed(3), threshold: +e.threshold.toFixed(3) });
      const left = Math.max(0, Math.ceil((r.until - sample.t) / 1000));
      setRecording(left || 0);
      if (sample.t >= r.until) {
        rec.current = null; setRecording(0);
        const url = URL.createObjectURL(new Blob([JSON.stringify({ note: '0-5 s still, 5-10 s mouth a sentence, 10-15 s smile / twitch / nod', rows: r.rows })], { type: 'application/json' }));
        const a = document.createElement('a'); a.href = url; a.download = `hands-free-${Date.now()}.json`; a.click();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
      }
    }
    const c = calib.current;
    if (c) {
      (c.step === 'rest' ? c.rest : c.mouth).push(sample);
      const left = Math.max(0, Math.ceil((c.until - sample.t) / 1000));
      if (sample.t >= c.until) {
        if (c.step === 'rest') { calib.current = { ...c, step: 'mouth', until: sample.t + MOUTH_MS }; setCalibration({ step: 'mouth', secondsLeft: MOUTH_MS / 1000 }); }
        else {
          calib.current = null;
          const result = calibrateFrom(c.rest, c.mouth);
          lastCalibration.current = { result, rest: c.rest, mouth: c.mouth };
          console.info('[hands-free] calibration', JSON.stringify(result));
          if (result.ok) { const current = load(); save({ ...current, mouthOn: result.threshold ?? undefined }); setCalibration({ step: 'done', secondsLeft: 0 }); }
          else setCalibration({ step: 'failed', secondsLeft: 0 });
        }
      } else setCalibration(previous => previous.secondsLeft === left && previous.step === c.step ? previous : { step: c.step, secondsLeft: left });
      return;
    }
    const s = state.current;
    if (!s.enabled || Date.now()<practiceUntil.current) return;
    const events = engine.current.push(sample, s.phase, sample.t - s.talkingAt < 1500, s.suggestions);
    if (sample.t - lastMeter.current > 200) { lastMeter.current = sample.t; setMeter({ level: engine.current.mouth, threshold: engine.current.threshold }); }
    for (const event of events) { console.info(`[hands-free] ${event} (mouth ${engine.current.mouth.toFixed(2)} / start at ${engine.current.threshold.toFixed(2)})`); s.onEvent(event); }
  }, [save]);

  const calibrate = useCallback(() => {
    calib.current = { step: 'rest', until: performance.now() + REST_MS, rest: [], mouth: [] };
    setCalibration({ step: 'rest', secondsLeft: REST_MS / 1000 });
  }, []);
  useEffect(() => () => { calib.current = null; }, []);

  return {
    enabled: saved.enabled, mode: saved.mode, calibrated: saved.mouthOn !== undefined,
    setMode: (mode: GestureMode) => save({ ...load(), mode }),
    setHeadGestures: () => save({ ...load(), mode: 'head', startBy: 'nod' }),
    /** Save this person's nod and turn sizes, measured in gesture practice. */
    setPersonalGestures: (sizes: { nodDeg: number; turnDeg: number }) => save({ ...load(), ...sizes }),
    personal: saved.nodDeg !== undefined,
    startBy: saved.startBy,
    setStartBy: (startBy: StartBy) => save({ ...load(), startBy }),
    resetCalibration: () => save({ ...load(), mouthOn: undefined }),
    calibrate, calibration, meter, onSample, recording,
    /** Save the last calibration's readings (numbers only) as a JSON file, to tune from. */
    saveCalibration: () => {
      if (!lastCalibration.current) return;
      const url = URL.createObjectURL(new Blob([JSON.stringify({ note: 'calibration: rest then mouthing', ...lastCalibration.current as object })], { type: 'application/json' }));
      const a = document.createElement('a'); a.href = url; a.download = `hands-free-calibration-${Date.now()}.json`; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    },
    record: () => { const now = performance.now(); rec.current = { until: now + 15000, start: now, rows: [] }; setRecording(15); },
  };
}
