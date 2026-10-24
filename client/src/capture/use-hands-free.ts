import { useCallback, useEffect, useRef, useState } from 'react';
import { HandsFree, calibratedThreshold, type FaceSample, type GestureMode, type HandsFreeEvent, type HandsFreePhase } from './hands-free';

const KEY = 'silent-calls:hands-free:v1';
type Saved = { enabled: boolean; mode: GestureMode; mouthOn?: number };
function load(): Saved {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) || '{}');
    return { enabled: value.enabled === true, mode: value.mode === 'face' ? 'face' : 'head', mouthOn: Number.isFinite(value.mouthOn) && value.mouthOn > 0 ? value.mouthOn : undefined };
  } catch { return { enabled: false, mode: 'head' }; }
}
export type Calibration = { step: 'idle' | 'rest' | 'mouth' | 'done' | 'failed'; secondsLeft: number };
const REST_MS = 4000, MOUTH_MS = 5000;

/** Hands-free control: feed it face samples (onSample), tell it the current phase, and it calls onEvent. */
export function useHandsFree(phase: HandsFreePhase, otherTalking: boolean, suggestions: boolean, onEvent: (event: HandsFreeEvent) => void) {
  const [saved, setSaved] = useState<Saved>(load);
  const engine = useRef(new HandsFree({ mode: saved.mode, mouthOn: saved.mouthOn }));
  const state = useRef({ phase, otherTalking, suggestions, onEvent, enabled: saved.enabled });
  state.current = { phase, otherTalking, suggestions, onEvent, enabled: saved.enabled };
  const [meter, setMeter] = useState({ level: 0, threshold: engine.current.threshold });
  const [calibration, setCalibration] = useState<Calibration>({ step: 'idle', secondsLeft: 0 });
  const calib = useRef<{ step: 'rest' | 'mouth'; until: number; rest: number[]; mouth: number[] } | null>(null);
  const lastMeter = useRef(0);

  const save = useCallback((next: Saved) => {
    setSaved(next);
    engine.current.config = { mode: next.mode, mouthOn: next.mouthOn };
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* settings stay for this session */ }
  }, []);

  const onSample = useCallback((sample: FaceSample) => {
    const c = calib.current;
    if (c) {
      if (sample.face) (c.step === 'rest' ? c.rest : c.mouth).push(sample.mouth);
      const left = Math.max(0, Math.ceil((c.until - sample.t) / 1000));
      if (sample.t >= c.until) {
        if (c.step === 'rest') { calib.current = { ...c, step: 'mouth', until: sample.t + MOUTH_MS }; setCalibration({ step: 'mouth', secondsLeft: MOUTH_MS / 1000 }); }
        else {
          calib.current = null;
          const threshold = calibratedThreshold(c.rest, c.mouth);
          if (threshold) { const current = load(); save({ ...current, mouthOn: threshold }); setCalibration({ step: 'done', secondsLeft: 0 }); }
          else setCalibration({ step: 'failed', secondsLeft: 0 });
        }
      } else setCalibration(previous => previous.secondsLeft === left && previous.step === c.step ? previous : { step: c.step, secondsLeft: left });
      return;
    }
    const s = state.current;
    if (!s.enabled) return;
    const events = engine.current.push(sample, s.phase, s.otherTalking, s.suggestions);
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
    setEnabled: (enabled: boolean) => save({ ...saved, enabled }),
    setMode: (mode: GestureMode) => save({ ...saved, mode }),
    resetCalibration: () => save({ ...saved, mouthOn: undefined }),
    calibrate, calibration, meter, onSample,
  };
}
