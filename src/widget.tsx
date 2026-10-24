import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Camera, CameraOff, Download, GripHorizontal, Pause, Play, Waves, X } from 'lucide-react';
import {useMouthTracking} from './capture/mouth-tracking';
import {useMeetingPort} from './services/use-meeting-port';
import type {MeetingPort} from './services/meeting-port';
import type {CaptureCallbacks} from './capture/use-capture';
import { useCapture } from './capture/use-capture';
import type { HoldKey, HoldStatus } from './desktop';
import type { CaptureClip } from './capture/buffer';
const keyLabels: Record<HoldKey, string> = { F8: 'F8', F9: 'F9', F10: 'F10', CtrlRight: 'Right Ctrl' };
function downloadClip(clip: CaptureClip) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(clip)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = `silent-calls-${clip.id}.json`; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
export function MeetingWidget({service:port}:{service?:MeetingPort} = {}) {
  const callbacks=useRef<CaptureCallbacks>({});
  const capture=useCapture({onStart:value=>callbacks.current.onStart?.(value),onFrame:value=>callbacks.current.onFrame?.(value),onEnd:value=>callbacks.current.onEnd?.(value),onCancel:()=>callbacks.current.onCancel?.(),onVideoFrame:(video,now)=>callbacks.current.onVideoFrame?.(video,now)});
  const [modelBuffer,setModelBuffer]=useState<Uint8Array|null>(null);
  const [modelError,setModelError]=useState('');
  const tracking=useMouthTracking(capture.cameraOn,modelBuffer);
  const service=useMeetingPort(port,()=>{capture.stop();void window.desktop?.stopGlobalHold();});
  callbacks.current={onStart:service.onStart,onFrame:service.onFrame,onEnd:service.onEnd,onCancel:service.cancel,onVideoFrame:tracking.sample};
  const [key, setKey] = useState<HoldKey>(() => {
    const stored = localStorage.getItem('silent-calls:hold-key:v1');
    return stored && ['F8', 'F9', 'F10', 'CtrlRight'].includes(stored) ? stored as HoldKey : 'F8';
  });
  const [hook, setHook] = useState<HoldStatus>({active:false,key,message:'Enable the camera, then enable the global key.'});
  const [enablingHook, setEnablingHook] = useState(false);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [device, setDevice] = useState('');
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const container = useRef<HTMLElement>(null);
  const beginRef = useRef(capture.begin); beginRef.current = capture.begin;
  const releaseRef = useRef(capture.release); releaseRef.current = capture.release;
  const stopRef = useRef(capture.stop); stopRef.current = capture.stop;
  useEffect(() => {
    const desktop = window.desktop;
    if (!desktop) return;
    const removeEvent = desktop.onGlobalHold(event => {
      if (event.type === 'down') beginRef.current();
      if (event.type === 'up') releaseRef.current();
      if (event.type === 'cancel') stopRef.current();
    });
    const removeStatus = desktop.onGlobalHoldStatus(setHook);
    void desktop.getGlobalHoldStatus().then(setHook);
    return () => { removeEvent(); removeStatus(); void desktop.stopGlobalHold(); };
  }, []);
  // A failed/disconnected camera must never leave the native listener armed.
  useEffect(() => { if (!capture.cameraOn) void window.desktop?.stopGlobalHold(); }, [capture.cameraOn]);
  useEffect(() => {
    if (capture.phase !== 'capturing') return;
    setFrame(0); setPlaying(false);
  }, [capture.phase]);
  useEffect(() => {
    if (!playing || !capture.clip) return;
    const frames = capture.clip.frames;
    if (frame >= frames.length - 1) { setPlaying(false); return; }
    const delay = frames[frame + 1].timestampMs - frames[frame].timestampMs;
    const timer = setTimeout(() => setFrame(index => index + 1), Math.min(250, Math.max(1, delay)));
    return () => clearTimeout(timer);
  }, [playing, frame, capture.clip]);
  useEffect(() => {
    async function refresh() {
      try { setDevices((await navigator.mediaDevices.enumerateDevices()).filter(item => item.kind === 'videoinput')); }
      catch { /* Permission errors are shown by the explicit camera action. */ }
    }
    void refresh(); navigator.mediaDevices?.addEventListener('devicechange', refresh);
    return () => navigator.mediaDevices?.removeEventListener('devicechange', refresh);
  }, [capture.cameraOn]);
  const hookPending = enablingHook || hook.message === 'Starting global keyboard hook…';
  const busy = capture.phase === 'capturing' || capture.phase === 'tail';
  const ready = capture.phase === 'ready' || capture.phase === 'review';
  async function enableGlobal() {
    if (!window.desktop || !ready) return;
    setEnablingHook(true);
    try { setHook(await window.desktop.startGlobalHold(key)); }
    catch { setHook({active:false,key,message:'Could not enable the global key. Restart Electron and retry.'}); }
    finally { setEnablingHook(false); }
  }
  async function stop() { await window.desktop?.stopGlobalHold(); capture.stop(); setPlaying(false); container.current?.focus(); }
  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement).closest('input,select,textarea,button')) return;
      if(service.phase==='choosing' && ['1','2','3'].includes(event.key)){const candidate=service.candidates[Number(event.key)-1];if(candidate){event.preventDefault();service.confirm(candidate);}return;}
      const matches = key === 'CtrlRight' ? event.code === 'ControlRight' : event.code === key;
      if (matches && !hook.active) { event.preventDefault(); if (!event.repeat) beginRef.current(); }
    };
    const up = (event: KeyboardEvent) => {
      if (!hook.active && (key === 'CtrlRight' ? event.code === 'ControlRight' : event.code === key)) { event.preventDefault(); releaseRef.current(); }
    };
    const blur = () => { if (!hook.active) releaseRef.current(); };
    window.addEventListener('keydown', down); window.addEventListener('keyup', up); window.addEventListener('blur', blur);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', blur); };
  }, [key, hook.active, service.phase, service.candidates, service.confirm]);
  const title = {off:'Let’s see your words.', starting:'Getting the camera ready…', ready:'Your turn, whenever.', capturing:'Keep mouthing…', tail:'Catching the last word…', review:'Your capture is ready.', error:'Let’s reconnect.'}[capture.phase];
  const clip = capture.clip;
  const duration = clip && clip.frames.length > 1 ? (clip.frames.at(-1)!.timestampMs - clip.frames[0].timestampMs) / 1000 : 0;
  return <main className="meeting-widget live-capture" ref={container} tabIndex={-1}>
    <header className="widget-header"><div className="widget-logo"><Waves size={21}/> silent calls<span>.</span></div><GripHorizontal size={19} className="drag-grip"/><button className="icon-button" aria-label="Close meeting widget" onClick={() => window.desktop ? window.desktop.closeWidget() : window.close()}><X size={17}/></button></header>
    <div className="widget-body"><div className="widget-status"><span className={`dot ${busy ? 'recording-dot' : ''}`}/>{capture.cameraOn ? 'Camera enabled' : 'Camera off'}<span className="demo-badge">{service.connected?'Service connected':'Local capture'}</span></div>
      <h1 aria-live="polite">{title}</h1>
      <div className={`live-camera ${clip ? 'reviewing' : ''}`}>
        <video ref={capture.video} autoPlay muted playsInline aria-label="Live camera preview"/>
        {clip?.frames[frame] && <img src={clip.frames[frame].jpeg} alt={`Captured frame ${frame + 1} of ${clip.frames.length}`}/>}
        {!capture.cameraOn && <div className="capture-camera-empty"><Camera size={26}/><span>Your camera starts only when you enable it.</span></div>}
        {busy && <span className="capture-indicator">{capture.phase === 'tail' ? 'Finishing' : 'Recording'} · {capture.stats.frames} frames</span>}
      </div>
      {clip && <div className="clip-review"><div><button className="icon-text" onClick={() => {if (frame >= clip.frames.length - 1) setFrame(0); setPlaying(!playing);}}>{playing ? <Pause size={14}/> : <Play size={14}/>} {playing ? 'Pause' : 'Replay'}</button><span>{clip.frames.length} frames · {duration.toFixed(1)}s</span><button className="icon-text" onClick={() => downloadClip(clip)}><Download size={14}/> Export</button></div><input aria-label="Captured frame" type="range" min={0} max={Math.max(0,clip.frames.length - 1)} value={frame} onChange={event => {setPlaying(false);setFrame(Number(event.target.value));}}/><p>Pre-roll {Math.round(clip.preRollMs)}ms · Post-roll {Math.round(clip.postRollMs)}ms{clip.endedBy === 'limit' ? ' · Capture limit reached' : ''}</p></div>}
      <div className="mouth-feedback"><label htmlFor="mouth-movement">Mouth movement</label><meter id="mouth-movement" min={0} max={100} value={tracking.level}/><p>{tracking.coaching}</p></div>
      {!modelBuffer && <label className="model-picker">Choose local MediaPipe model<input type="file" accept=".task" onChange={event=>{const file=event.target.files?.[0];if(file)void file.arrayBuffer().then(buffer=>{setModelBuffer(new Uint8Array(buffer));setModelError('');}).catch(()=>setModelError('Could not open the model file. Try again.'));}}/></label>}
      {modelError && <p className="capture-error" role="alert">{modelError}</p>}
      {capture.error && <p className="capture-error" role="alert">{capture.error}</p>}
      {!capture.cameraOn ? <button className="hold-button" onClick={() => {setPlaying(false);void capture.enable(device || undefined);}}><Camera size={16}/> Enable camera</button> : <button className={`hold-button ${busy ? 'held' : ''}`} disabled={!ready && capture.phase !== 'capturing'} onPointerDown={event => { event.currentTarget.setPointerCapture(event.pointerId); capture.begin(); }} onPointerUp={capture.release} onPointerCancel={capture.release} onBlur={() => {if (!hook.active) capture.release();}} onKeyDown={event => {if (['Space','Enter'].includes(event.code)) {event.preventDefault();if (!event.repeat) capture.begin();}}} onKeyUp={event => {if (['Space','Enter'].includes(event.code)) {event.preventDefault();capture.release();}}}><span className="record-dot"/>{capture.phase === 'starting' ? 'Warming up the frame buffer…' : capture.phase === 'tail' ? 'Capturing 0.3s post-roll…' : capture.phase === 'capturing' ? 'Release to finish' : 'Hold to capture'}<kbd>{keyLabels[key]}</kbd></button>}
      <div className="capture-settings"><label htmlFor="camera-device">Camera</label><select id="camera-device" value={device} disabled={capture.cameraOn} onChange={event => setDevice(event.target.value)}><option value="">System default</option>{devices.map((camera,index) => <option key={camera.deviceId || index} value={camera.deviceId}>{camera.label || `Camera ${index + 1}`}</option>)}</select><label htmlFor="hold-key">Hold key</label><select id="hold-key" value={key} disabled={hook.active || busy || hookPending} onChange={event => {const selected=event.target.value as HoldKey;setKey(selected);localStorage.setItem('silent-calls:hold-key:v1',selected);}}>{Object.entries(keyLabels).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></div>
      <div className="global-controls"><button className="icon-text" disabled={!window.desktop || (!hook.active && (!ready || hookPending))} onClick={() => hook.active ? void stop() : void enableGlobal()}>{hook.active ? <Pause size={14}/> : <Play size={14}/>} {hook.active ? 'Disable global key & camera' : enablingHook ? 'Enabling…' : 'Enable global key'}</button>{!hook.active && window.desktop && <button className="icon-text" onClick={() => window.desktop?.openKeyboardSettings()}>Permissions <ArrowUpRight size={12}/></button>}</div>
      <p className="capture-help" role="status">{window.desktop ? hook.message : 'Browser preview: the hold key works only while this tab is focused. Use Electron for global capture.'}</p>
      <div className="capture-metrics"><span>{capture.stats.fps} fps measured / 25 target</span><span>{capture.stats.bufferedMs}ms buffered</span></div>
      <div className="meeting-results"><h2>Conversation</h2><div className="meeting-captions" aria-live="polite">{service.captions.length?service.captions.map((line,index)=><p key={index}><strong>{line.speaker}</strong>{line.text}</p>):<p>{service.connected?'Waiting for conversation captions…':'Captions appear when the meeting adapter is connected.'}</p>}</div>
      {service.phase==='processing' && <p className="capture-help" role="status">Waiting for phrase candidates…</p>}
      {service.phase==='queued' && <p className="capture-help" role="status">Phrase confirmed. Waiting for voice service…</p>}
      {service.phase==='speaking' && <p className="capture-help" role="status">Voice service reports that it is speaking…</p>}
      {service.candidates.length>0 && <div className="candidate-list live-candidates" aria-label="Choose what you meant">{service.candidates.map((candidate,index)=><button key={candidate.id} disabled={service.phase!=='choosing' || !service.connected} onClick={()=>{service.confirm(candidate);container.current?.focus();}}><kbd>{index+1}</kbd><span>{candidate.text}</span></button>)}<button className="retry" onClick={()=>{service.cancel();capture.clear();container.current?.focus();}}>Discard candidates & retry</button></div>}
      <div className="quick-phrases"><span>Quick phrases</span><div>{['Yes','One moment','Thank you'].map(text=><button key={text} disabled={!service.connected || busy || ['queued','speaking','processing'].includes(service.phase)} onClick={()=>service.quickPhrase(text)}>{text}</button>)}</div></div>
      {service.error && <p className="capture-error" role="alert">{service.error}</p>}
      <p className="capture-help">{service.connected?'The approved adapter receives frames while you hold the key. Uncertain phrases always need your choice.':'No backend adapter is installed. Captures stay local; phrase and voice controls remain disabled.'}</p></div>
      <button className="icon-text" onClick={()=>window.desktop?window.desktop.showMain('workspace'):window.open(`${location.pathname}#/workspace`,'_blank')}>Training & settings <ArrowUpRight size={13}/></button>
      <p className="capture-help">Export saves a JPEG frame bundle only when you click it.</p>
    </div>
    <footer className="widget-footer"><button className="icon-text" disabled={!capture.cameraOn} onClick={() => void stop()}><CameraOff size={14}/> Stop camera</button><span>{hook.active ? `${keyLabels[key]} works in any app` : 'Global key off'}</span><button className="icon-button" aria-label="Open main app" onClick={() => window.desktop ? window.desktop.showMain() : window.open(location.pathname,'_blank')}><ArrowUpRight size={17}/></button></footer>
  </main>;
}
