import { useEffect, useRef, useState } from 'react';
import { Camera, CameraOff } from 'lucide-react';
export function CameraPreview({ onStream, onFrame }: { onStream?: (stream: MediaStream | null) => void; onFrame?: (video:HTMLVideoElement,now:number)=>void }) {
  const video = useRef<HTMLVideoElement>(null);
  const current = useRef<MediaStream | null>(null);
  const mounted = useRef(true);
  const [status, setStatus] = useState<'off' | 'loading' | 'on' | 'error'>('off');
  const [error, setError] = useState('');
  const callback = useRef(onStream); callback.current = onStream;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; current.current?.getTracks().forEach(track => track.stop()); callback.current?.(null); }; }, []);
  const frameCallback=useRef(onFrame);frameCallback.current=onFrame;
  useEffect(()=>{if(status!=='on')return;const timer=setInterval(()=>{if(video.current && video.current.readyState>=2)frameCallback.current?.(video.current,performance.now());},200);return()=>clearInterval(timer);},[status]);
  async function enable() {
    setStatus('loading');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720, frameRate: 25 }, audio: false });
      if (!mounted.current) { stream.getTracks().forEach(track => track.stop()); return; }
      current.current = stream;
      if (video.current) video.current.srcObject = stream;
      callback.current?.(stream); setStatus('on');
    } catch (e) {
      if (!mounted.current) return;
      setError(e instanceof DOMException && e.name === 'NotAllowedError' ? 'Camera access was denied. Allow it in system privacy settings, then try again.' : 'Couldn’t open a camera. Check that it is connected and available, then try again.');
      setStatus('error');
    }
  }
  return <div className="camera-preview">
    <video ref={video} autoPlay muted playsInline className={status === 'on' ? 'visible' : ''} />
    {status !== 'on' && <div className="camera-placeholder"><Camera size={36} strokeWidth={1.3}/><h3>Your camera, your control.</h3><p>{error || 'Turn on your camera when you’re ready. Keep your face centered and well lit.'}</p><button className="button light" onClick={enable} disabled={status === 'loading'}>{status === 'loading' ? 'Opening camera…' : status === 'error' ? 'Try camera again' : 'Enable camera'}</button></div>}
    {status === 'on' && <><div className="face-guide" aria-hidden="true"/><span className="camera-tag"><span className="dot"/> Camera on</span><button className="camera-stop" aria-label="Turn camera off" onClick={() => { current.current?.getTracks().forEach(track => track.stop()); current.current = null; callback.current?.(null); setStatus('off'); }}><CameraOff size={17}/></button></>}
    {status === 'error' && <span className="sr-only" role="alert">{error}</span>}
  </div>;
}
