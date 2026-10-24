import {LipreadPort} from './services/lipread-port';
import {loadSettings} from './services/settings';
import {VoicePanel} from './components/voice-panel';
import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Camera, CameraOff, GripHorizontal, Pause, Play, Waves, X } from 'lucide-react';
import {useMouthTracking} from './capture/mouth-tracking';
import {useMeetingPort} from './services/use-meeting-port';
import type {MeetingPort} from './services/meeting-port';
import type {CaptureCallbacks} from './capture/use-capture';
import { useCapture } from './capture/use-capture';
import type { HoldKey, HoldStatus } from './desktop';
const keyLabels: Record<HoldKey, string> = { T: 'T', F8: 'F8', F9: 'F9', F10: 'F10', CtrlRight: 'Right Ctrl' };
export function MeetingWidget({service:providedPort}:{service?:MeetingPort} = {}) {
  const [gpuPort] = useState(() => new LipreadPort(loadSettings()));
  const port = providedPort || gpuPort;
  const [editedText,setEditedText] = useState('');
  const callbacks=useRef<CaptureCallbacks>({});
  const capture=useCapture({onStart:value=>callbacks.current.onStart?.(value),onFrame:value=>callbacks.current.onFrame?.(value),onEnd:value=>callbacks.current.onEnd?.(value),onCancel:()=>callbacks.current.onCancel?.(),onVideoFrame:(video,now)=>callbacks.current.onVideoFrame?.(video,now)});
  const [modelBuffer,setModelBuffer]=useState<Uint8Array|null>(null);
  const [modelError,setModelError]=useState('');
  const tracking=useMouthTracking(capture.cameraOn,modelBuffer);
  const service=useMeetingPort(port,()=>{capture.stop();void window.desktop?.stopGlobalHold();});
  callbacks.current={onStart:service.onStart,onFrame:service.onFrame,onEnd:service.onEnd,onCancel:service.cancel,onVideoFrame:tracking.sample};
  const [key, setKey] = useState<HoldKey>(() => {
    const stored = localStorage.getItem('silent-calls:hold-key:v2');
    return stored && ['T', 'F8', 'F9', 'F10', 'CtrlRight'].includes(stored) ? stored as HoldKey : 'T';
  });
  const [hook, setHook] = useState<HoldStatus>({active:false,key,message:'Enable the camera, then enable the global key.'});
  const [enablingHook, setEnablingHook] = useState(false);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [device, setDevice] = useState('');
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [keyFeedback, setKeyFeedback] = useState('Enable the camera, then hold T here—or enable the global key for your meeting.');
  const container = useRef<HTMLElement>(null);
  const serviceBusy = service.phase === 'processing' || service.phase === 'queued' || service.phase === 'speaking';
  const begin = () => {
    if (serviceBusy) { setKeyFeedback(`${keyLabels[key]} detected. Wait for the previous phrase or cancel it first.`); return; }
    if (!capture.cameraOn) { setKeyFeedback(`${keyLabels[key]} detected. Enable the camera before holding to capture.`); return; }
    if (capture.phase === 'starting') { setKeyFeedback(`${keyLabels[key]} detected. The camera is warming up; release and hold again in a moment.`); return; }
    setKeyFeedback(`${keyLabels[key]} detected. Hold while mouthing, then release to finish.`);
    capture.begin();
  };
  const beginRef = useRef(begin); beginRef.current = begin;
  useEffect(() => { setEditedText(service.candidates[0]?.text || ''); }, [service.candidates]);
  const releaseRef = useRef(capture.release); releaseRef.current = capture.release;
  const stopRef = useRef(capture.stop); stopRef.current = capture.stop;
  useEffect(() => {
    const desktop = window.desktop;
    if (!desktop) return;
    const removeEvent = desktop.onGlobalHold(event => {
      if (event.type === 'down') {
        if (document.hasFocus() && document.activeElement?.closest('input,textarea,select,[contenteditable="true"]')) return;
        beginRef.current();
      }
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
    container.current?.focus();
    setKeyFeedback(`Enabling ${keyLabels[key]} across apps…`);
    try { setHook(await window.desktop.startGlobalHold(key)); }
    catch { setHook({active:false,key,message:'Could not enable the global key. Restart Electron and retry.'}); }
    finally { setEnablingHook(false); }
  }
  async function stop() { await window.desktop?.stopGlobalHold(); capture.stop(); setPlaying(false); container.current?.focus(); }
  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement).closest('input,select,textarea')) return;
      if(service.phase==='choosing' && ['1','2','3'].includes(event.key)){const candidate=service.candidates[Number(event.key)-1];if(candidate){event.preventDefault();service.confirm(candidate);}return;}
      const matches = key === 'CtrlRight' ? event.code === 'ControlRight' : event.code === (key === 'T' ? 'KeyT' : key);
      if (key === 'T' && (event.metaKey || event.ctrlKey || event.altKey)) return;
      if (matches) { event.preventDefault(); if (!event.repeat) beginRef.current(); }
    };
    const up = (event: KeyboardEvent) => {
      if (key === 'CtrlRight' ? event.code === 'ControlRight' : event.code === (key === 'T' ? 'KeyT' : key)) { event.preventDefault(); releaseRef.current(); }
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
      <p className="capture-help" role="status">{keyFeedback}</p>
      <p className="capture-help">{capture.cameraOn ? 'Camera on' : 'Camera off'} · {hook.active ? `${keyLabels[hook.key]} enabled across apps` : `${keyLabels[key]} works here only · enable global key for meetings`}</p>
      {!providedPort && <section className="gpu-connect" aria-label="GPU lip-reading connection"><div><strong>Lip-reading</strong><span className={`dot ${service.connected ? '' : 'amber'}`}/>{service.connected ? 'GPU connected' : 'Not connected'}</div><p role="status">{service.message}</p><div className="gpu-actions"><button className="hold-button" disabled={service.phase === 'queued' || service.phase === 'speaking' || busy} onClick={() => service.connected ? gpuPort.disconnect() : gpuPort.connect(loadSettings())}>{service.connected ? 'Disconnect GPU' : 'Connect lip-reading'}</button><button className="icon-text" onClick={() => window.desktop?.showMain('workspace')}>Connection settings <ArrowUpRight size={12}/></button></div><p className="capture-help">Connecting enables uploads while you hold the key. Keep the SSH tunnel open. Video is sent to the GPU for inference and stays in memory.</p></section>}
      <section className="meeting-results" aria-label="Lip-reading results">
        {service.phase==='processing' && <p className="capture-help" role="status">{service.upload.bufferedBytes > 0 ? `Uploading ${Math.ceil(service.upload.bufferedBytes/1024)} KB queued · ${service.upload.sentFrames} frames` : 'Waiting for the GPU to read your phrase… Venue Wi-Fi can take 10 seconds or longer.'}</p>}
        {service.phase==='processing' && <button className="retry" onClick={()=>{service.cancel();capture.clear();}}>Cancel this request</button>}
        {service.phase==='queued' && <p className="capture-help" role="status">Your phrase is confirmed. Waiting for the local voice service…</p>}
        {service.phase==='speaking' && <p className="capture-help" role="status">Voice playback reported by the service…</p>}
        {service.candidates.length > 0 && <><h2>Choose what you meant.</h2><p className="capture-help">Selecting a phrase speaks it through your meeting microphone. Nothing is spoken automatically.</p><div className="candidate-list live-candidates" aria-label="Top three phrases">{service.candidates.slice(0,3).map((candidate,index)=><button key={candidate.id} disabled={service.phase!=='choosing' || !service.connected} onClick={()=>{service.confirm(candidate);container.current?.focus();}}><kbd>{index+1}</kbd><span>{candidate.text}</span></button>)}</div>{service.candidates.length>3 && <details className="gpu-more"><summary>Show {service.candidates.length-3} more suggestions</summary><div className="candidate-list live-candidates">{service.candidates.slice(3).map(candidate=><button key={candidate.id} disabled={service.phase!=='choosing' || !service.connected} onClick={()=>service.confirm(candidate)}><span>{candidate.text}</span></button>)}</div></details>}<label className="gpu-edit-label" htmlFor="gpu-edit">Or correct the phrase before speaking</label><textarea id="gpu-edit" rows={2} maxLength={5000} value={editedText} disabled={service.phase!=='choosing'} onChange={event=>setEditedText(event.target.value)}/><button className="hold-button" disabled={service.phase!=='choosing' || !editedText.trim() || !service.connected} onClick={()=>service.confirm(service.candidates[0],editedText)}>Speak edited phrase</button><button className="retry" disabled={service.phase!=='choosing'} onClick={()=>{service.cancel();capture.clear();container.current?.focus();}}>Discard & mouth it again</button></>}
        {(service.confidence !== undefined || Object.keys(service.timings).length > 0 || service.quality) && <details className="gpu-more"><summary>Server details</summary>{service.confidence !== undefined && <p>Server confidence: {Math.round(service.confidence*100)}% · not measured accuracy</p>}{Object.entries(service.timings).map(([name,value])=><p key={name}>{name}: {Math.round(value)}ms</p>)}{service.quality && <p>Quality: {service.quality}</p>}</details>}
        {service.error && <p className="capture-error" role="alert">{service.error}</p>}
        {service.captions.length > 0 && <div className="meeting-captions" aria-live="polite">{service.captions.map((line,index)=><p key={index}><strong>{line.speaker}</strong>{line.text}</p>)}</div>}
      </section>
      <div className={`live-camera ${clip ? 'reviewing' : ''}`}>
        <video ref={capture.video} autoPlay muted playsInline aria-label="Live camera preview"/>
        {clip?.frames[frame] && <img src={clip.frames[frame].jpeg} alt={`Captured frame ${frame + 1} of ${clip.frames.length}`}/>}
        {!capture.cameraOn && <div className="capture-camera-empty"><Camera size={26}/><span>Your camera starts only when you enable it.</span></div>}
        {busy && <span className="capture-indicator">{capture.phase === 'tail' ? 'Finishing' : 'Recording'} · {capture.stats.frames} frames</span>}
      </div>
      {clip && <div className="clip-review"><div><button className="icon-text" onClick={() => {if (frame >= clip.frames.length - 1) setFrame(0); setPlaying(!playing);}}>{playing ? <Pause size={14}/> : <Play size={14}/>} {playing ? 'Pause' : 'Replay'}</button><span>{clip.frames.length} frames · {duration.toFixed(1)}s</span></div><input aria-label="Captured frame" type="range" min={0} max={Math.max(0,clip.frames.length - 1)} value={frame} onChange={event => {setPlaying(false);setFrame(Number(event.target.value));}}/><p>Pre-roll {Math.round(clip.preRollMs)}ms · Post-roll {Math.round(clip.postRollMs)}ms{clip.endedBy === 'limit' ? ' · Capture limit reached' : ''}</p></div>}
      <div className="mouth-feedback"><label htmlFor="mouth-movement">Mouth movement</label><meter id="mouth-movement" min={0} max={100} value={tracking.level}/><p>{tracking.coaching}</p></div>
      {!modelBuffer && <label className="model-picker">Choose local MediaPipe model<input type="file" accept=".task" onChange={event=>{const file=event.target.files?.[0];if(file)void file.arrayBuffer().then(buffer=>{setModelBuffer(new Uint8Array(buffer));setModelError('');}).catch(()=>setModelError('Could not open the model file. Try again.'));}}/></label>}
      {modelError && <p className="capture-error" role="alert">{modelError}</p>}
      {capture.error && <p className="capture-error" role="alert">{capture.error}</p>}
      {!capture.cameraOn ? <button className="hold-button" onClick={() => {setPlaying(false);setKeyFeedback('Opening camera… Once the preview is live, hold the key or the capture button.');void capture.enable(device || undefined);}}><Camera size={16}/> Enable camera</button> : <button className={`hold-button ${busy ? 'held' : ''}`} disabled={serviceBusy || (!ready && capture.phase !== 'capturing')} onPointerDown={event => { event.currentTarget.setPointerCapture(event.pointerId); beginRef.current(); }} onPointerUp={capture.release} onPointerCancel={capture.release} onBlur={() => {if (!hook.active) capture.release();}} onKeyDown={event => {if (['Space','Enter'].includes(event.code)) {event.preventDefault();if (!event.repeat) beginRef.current();}}} onKeyUp={event => {if (['Space','Enter'].includes(event.code)) {event.preventDefault();capture.release();}}}><span className="record-dot"/>{capture.phase === 'starting' ? 'Warming up the frame buffer…' : capture.phase === 'tail' ? 'Capturing 0.3s post-roll…' : capture.phase === 'capturing' ? 'Release to finish' : 'Hold to capture'}<kbd>{keyLabels[key]}</kbd></button>}
      <div className="capture-settings"><label htmlFor="camera-device">Camera</label><select id="camera-device" value={device} disabled={capture.cameraOn} onChange={event => setDevice(event.target.value)}><option value="">System default</option>{devices.map((camera,index) => <option key={camera.deviceId || index} value={camera.deviceId}>{camera.label || `Camera ${index + 1}`}</option>)}</select><label htmlFor="hold-key">Hold key</label><select id="hold-key" value={key} disabled={hook.active || busy || hookPending} onChange={event => {const selected=event.target.value as HoldKey;setKey(selected);localStorage.setItem('silent-calls:hold-key:v2',selected);}}>{Object.entries(keyLabels).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></div>
      <div className="global-controls"><button className="icon-text" disabled={!window.desktop || (!hook.active && (!ready || hookPending))} onClick={() => hook.active ? void stop() : void enableGlobal()}>{hook.active ? <Pause size={14}/> : <Play size={14}/>} {hook.active ? 'Disable global key & camera' : enablingHook ? 'Enabling…' : 'Enable global key'}</button>{!hook.active && window.desktop && <button className="icon-text" onClick={() => window.desktop?.openKeyboardSettings()}>Permissions <ArrowUpRight size={12}/></button>}</div>
      <p className="capture-help" role="status">{window.desktop ? hook.message : 'Browser preview: the hold key works only while this tab is focused. Use Electron for global capture.'}</p>
      <div className="capture-metrics"><span>{capture.stats.fps} fps measured / 25 target</span><span>{capture.stats.bufferedMs}ms buffered</span></div>
      <details className="typed-fallback"><summary>Type instead · quick phrases</summary><VoicePanel/></details>
      <button className="icon-text" onClick={()=>window.desktop?window.desktop.showMain('workspace'):window.open(`${location.pathname}#/workspace`,'_blank')}>Training & settings <ArrowUpRight size={13}/></button>
      <p className="capture-help">Meeting video stays in memory and is discarded when you stop the camera.</p>
    </div>
    <footer className="widget-footer"><button className="icon-text" disabled={!capture.cameraOn} onClick={() => void stop()}><CameraOff size={14}/> Stop camera</button><span>{hook.active ? `${keyLabels[key]} works in any app` : 'Global key off'}</span><button className="icon-button" aria-label="Open main app" onClick={() => window.desktop ? window.desktop.showMain() : window.open(location.pathname,'_blank')}><ArrowUpRight size={17}/></button></footer>
  </main>;
}
