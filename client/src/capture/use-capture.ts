import { useCallback, useEffect, useRef, useState } from 'react';
import { FPS, FrameBuffer, type CaptureClip, type Frame } from './buffer';
export type CapturePhase = 'off' | 'starting' | 'ready' | 'capturing' | 'tail' | 'review' | 'error';
export type CaptureCallbacks = {
  onStart?: (start: {utteranceId:string;pressedAtMs:number;width:number;height:number;targetFps:number}) => void;
  onFrame?: (frame:Frame) => void;
  onEnd?: (clip:CaptureClip) => void;
  onCancel?: () => void;
  onVideoFrame?: (video:HTMLVideoElement,now:number) => void;
};
export function useCapture(options:CaptureCallbacks = {}) {
  const callbacks=useRef(options);callbacks.current=options;
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const engine = useRef(new FrameBuffer());
  const interval = useRef<ReturnType<typeof setInterval> | null>(null);
  const generation = useRef(0);
  const phaseRef = useRef<CapturePhase>('off');
  const [phase, setPhaseState] = useState<CapturePhase>('off');
  const [clip, setClip] = useState<CaptureClip | null>(null);
  const [error, setError] = useState('');
  const [stats, setStats] = useState({ frames: 0, fps: 0, bufferedMs: 0 });
  const setPhase = useCallback((next: CapturePhase) => { phaseRef.current = next; setPhaseState(next); }, []);
  const stop = useCallback(() => {
    callbacks.current.onCancel?.();
    generation.current++;
    if (interval.current) clearInterval(interval.current);
    interval.current = null;
    stream.current?.getTracks().forEach(track => { track.onended = null; track.stop(); });
    stream.current = null;
    if (video.current) video.current.srcObject = null;
    engine.current.cancel(); setClip(null); setStats({frames:0,fps:0,bufferedMs:0}); setPhase('off');
  }, [setPhase]);
  useEffect(() => stop, [stop]);
  const enable = useCallback(async (deviceId?: string) => {
    stop(); const token = generation.current; setError(''); setPhase('starting');
    try {
      const camera = await navigator.mediaDevices.getUserMedia({ video: {
        width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: FPS, max: FPS },
        ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
      }, audio: false });
      if (token !== generation.current) { camera.getTracks().forEach(track => track.stop()); return; }
      stream.current = camera;
      const element = video.current;
      if (!element) throw new Error('Camera view is unavailable.');
      element.srcObject = camera; await element.play();
      if (token !== generation.current) return;
      const canvas = document.createElement('canvas');
      canvas.width = 640;
      canvas.height = Math.max(1, Math.round(640 * element.videoHeight / element.videoWidth));
      const context = canvas.getContext('2d', { alpha: false });
      if (!context) throw new Error('Camera frame capture is unavailable.');
      const warmingSince = performance.now();
      let lastVideoTime = -1, lastStats = warmingSince, lastFrameAt = warmingSince;
      const fail = (message: string) => { stop(); setError(message); setPhase('error'); };
      camera.getVideoTracks()[0].onended = () => fail('Camera disconnected. Reconnect it and enable the camera again.');
      interval.current = setInterval(() => {
        if (performance.now() - lastFrameAt > 2000) { fail('Camera stopped delivering frames. Reconnect it and retry.'); return; }
        if (element.readyState < 2 || camera.getVideoTracks()[0].muted) {
          if (engine.current.capturing) fail('Camera stopped delivering frames. Enable it again before capturing.');
          return;
        }
        const now = performance.now();
        try {
          if (element.currentTime !== lastVideoTime) {
            context.drawImage(element, 0, 0, canvas.width, canvas.height);
            const frame={ timestampMs: now, jpeg: canvas.toDataURL('image/jpeg', 0.8) };
            const count=engine.current.count;
            engine.current.push(frame);
            if(engine.current.count>count)callbacks.current.onFrame?.(frame);
            callbacks.current.onVideoFrame?.(element,now);
            lastVideoTime = element.currentTime; lastFrameAt = now;
          }
          const completed = engine.current.poll(now, canvas.width, canvas.height);
          if (completed) { setClip(completed); setPhase('review'); callbacks.current.onEnd?.(completed); }
          if (phaseRef.current === 'starting' && now - warmingSince >= 500 && engine.current.ring.length > 0) setPhase('ready');
          if (now - lastStats >= 200) {
            const ring = engine.current.ring;
            const span = ring.length > 1 ? ring[ring.length - 1].timestampMs - ring[0].timestampMs : 0;
            setStats({ frames: engine.current.count, fps: span ? Math.round((ring.length - 1) * 1000 / span) : 0, bufferedMs: Math.round(span) });
            lastStats = now;
          }
        } catch { fail('Could not capture camera frames. Disable the camera and try again.'); }
      }, 1000 / FPS);
    } catch (reason) {
      if (token !== generation.current) return;
      stop();
      setError(reason instanceof DOMException && reason.name === 'NotAllowedError'
        ? 'Camera access is denied. Allow Electron in System Settings → Privacy & Security → Camera, then retry.'
        : 'Could not open this camera. Check its connection and whether Zoom is using it exclusively, then retry.');
      setPhase('error');
    }
  }, [setPhase, stop]);
  const begin = useCallback(() => {
    if (!['ready', 'review'].includes(phaseRef.current)) return;
    const now=performance.now();
    if (engine.current.begin(now)) {
      setClip(null);setPhase('capturing');setError('');
      const element=video.current!;
      callbacks.current.onStart?.({utteranceId:engine.current.utteranceId,pressedAtMs:now,width:640,height:Math.max(1,Math.round(640*element.videoHeight/element.videoWidth)),targetFps:FPS});
      for(const frame of engine.current.ring.filter(frame=>frame.timestampMs>=now-500 && frame.timestampMs<=now))callbacks.current.onFrame?.(frame);
    }
    else setError('Waiting for fresh camera frames. Keep the camera enabled and retry.');
  }, [setPhase]);
  const release = useCallback(() => {
    if (phaseRef.current !== 'capturing') return;
    engine.current.release(performance.now()); setPhase('tail');
  }, [setPhase]);
  const clear = useCallback(() => { setClip(null); if (phaseRef.current === 'review') setPhase('ready'); }, [setPhase]);
  return { video, phase, clip, stats, error, enable, stop, begin, release, clear, cameraOn: !['off', 'error'].includes(phase) };
}
