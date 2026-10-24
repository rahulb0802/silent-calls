import {useEffect,useRef,useState} from 'react';
import {ArrowLeft,Check,Save,Video,Waves} from 'lucide-react';
import {CameraPreview} from './camera';
import {useMouthTracking} from './capture/mouth-tracking';
import {loadSettings,saveSettings,type ServiceSettings} from './services/settings';
const prompts=[
  'Thanks for making the time today.',
  'Could you tell me a little more?',
  'That works for me. Let’s move forward.',
  'I have a question about the next step.',
  'Can we talk about this tomorrow?',
  'I understand. Thank you for explaining.',
];
import type {EnrollmentClip,EnrollmentPort,TrainingJob} from './services/meeting-port';
function metric(value:unknown){return typeof value==='number' && value>=0 && value<=1 ? `${Math.round(value*100)}%` : 'Not reported';}
export function Workspace({backend}:{backend?:EnrollmentPort} = {}){
  const [settings,setSettings]=useState<ServiceSettings>(loadSettings);
  const [notice,setNotice]=useState(''),[error,setError]=useState('');
  const [stream,setStream]=useState<MediaStream|null>(null);
  const [clips,setClips]=useState<EnrollmentClip[]>([]);
  const [recording,setRecording]=useState(false),[consent,setConsent]=useState(false),[busy,setBusy]=useState(false);
  const [job,setJob]=useState<TrainingJob|null>(null);
  const recorder=useRef<MediaRecorder|null>(null),recordTimer=useRef<ReturnType<typeof setTimeout>|null>(null),pollTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const request=useRef<AbortController|null>(null),mounted=useRef(true);
  const [modelBuffer,setModelBuffer]=useState<Uint8Array|null>(null);
  const tracking=useMouthTracking(Boolean(stream),modelBuffer);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;if(recordTimer.current)clearTimeout(recordTimer.current);if(pollTimer.current)clearTimeout(pollTimer.current);if(recorder.current?.state==='recording')recorder.current.stop();request.current?.abort();};},[]);
  function save(){try{saveSettings(settings);setError('');setNotice('Settings saved. Reconnect the meeting widget to use them.');}catch(reason){setError(reason instanceof Error?reason.message:'Could not save settings.');}}
  function record(){
    if(recording){if(recordTimer.current)clearTimeout(recordTimer.current);recorder.current?.stop();return;}
    if(!stream || clips.length>=prompts.length)return;
    setError('');const index=clips.length;
    try{
      const capture=new MediaRecorder(stream),chunks:Blob[]=[];recorder.current=capture;
      capture.ondataavailable=event=>{if(event.data.size)chunks.push(event.data);};
      capture.onstop=()=>{if(!mounted.current)return;if(recordTimer.current)clearTimeout(recordTimer.current);setRecording(false);const blob=new Blob(chunks,{type:capture.mimeType});if(blob.size)setClips(previous=>[...previous,{prompt:prompts[index],blob,split:index<4?'train':'eval'}]);else setError('No video was captured. Enable the camera and record again.');};
      capture.onerror=()=>{if(mounted.current){setRecording(false);setError('Recording failed. Enable the camera and retry this phrase.');}};
      capture.start();setRecording(true);recordTimer.current=setTimeout(()=>{if(capture.state==='recording')capture.stop();},15000);
    }catch{setError('Could not start recording. Check the camera and retry.');}
  }
  async function train(){
    if(!backend || busy || !consent || clips.length<prompts.length)return;
    const config=loadSettings();
    request.current?.abort();if(pollTimer.current)clearTimeout(pollTimer.current);
    const controller=new AbortController();request.current=controller;
    setError('');setJob(null);setBusy(true);
    async function poll(id:string){
      try{
        const next=await backend!.getTrainingJob(id,controller.signal);
        if(!mounted.current || controller.signal.aborted)return;
        setJob(next);
        if(next.status==='complete' || next.status==='failed'){setBusy(false);if(next.status==='failed')setError(next.message || 'Training failed. Check the backend logs and retry.');}
        else pollTimer.current=setTimeout(()=>void poll(id),2000);
      }catch(reason){if(mounted.current && !controller.signal.aborted){setBusy(false);setError(reason instanceof Error?reason.message:'Could not read training progress.');}}
    }
    try{
      const clipIds:string[]=[];
      for(const clip of clips){
        clipIds.push(await backend.uploadClip(clip,config.profileId,controller.signal));
      }
      const next=await backend.startTraining(config.profileId,clipIds,controller.signal);
      if(!mounted.current || controller.signal.aborted)return;
      setJob(next);
      if(next.status==='complete' || next.status==='failed'){setBusy(false);if(next.status==='failed')setError(next.message || 'Training failed.');}
      else pollTimer.current=setTimeout(()=>void poll(next.id),2000);
    }catch(reason){if(mounted.current && !controller.signal.aborted){setBusy(false);setError(reason instanceof Error?reason.message:'Could not start training.');}}
  }
  return <main className="workspace"><header className="workspace-header"><a href="#"><ArrowLeft size={16}/> Back to setup</a><a className="text-button" href="#/audio-setup">Meeting audio setup</a><a className="text-button" href="#/library">Vocabulary & saved phrases</a><span><Waves size={20}/> silent calls.</span><button className="button" onClick={()=>window.desktop?.openWidget()}>Open meeting widget</button></header>
    <div className="workspace-heading"><h1>Make it yours.</h1><p>Camera calibration, your personal adapter, and the services that connect the conversation.</p></div>
    <div className="workspace-grid"><section className="service-settings"><h2>Service settings</h2><p>Lip-reading uses your SSH tunnel on port 8000. Save your profile and endpoint, then click Connect lip-reading in the widget. Training is a separate integration.</p>
      <label htmlFor="ws-endpoint">Meeting WebSocket URL</label><input id="ws-endpoint" type="url" placeholder="ws://127.0.0.1:8000/ws/session" value={settings.websocketUrl} onChange={event=>{setNotice('');setSettings({...settings,websocketUrl:event.target.value});}} disabled={busy}/>
      <label htmlFor="api-endpoint">Enrollment & training API URL</label><input id="api-endpoint" type="url" placeholder="https://your-server" value={settings.apiUrl} onChange={event=>{setNotice('');setSettings({...settings,apiUrl:event.target.value});}} disabled={busy}/>
      <label htmlFor="profile-id">Lip-reading user / profile ID</label><input id="profile-id" value={settings.profileId} onChange={event=>setSettings({...settings,profileId:event.target.value})} disabled={busy}/>
      <button className="button" onClick={save} disabled={busy}><Save size={15}/> Save settings</button>{notice && <p className="success" role="status"><Check size={15}/>{notice}</p>}
      <p className="small">Camera and hold-key selection live in the meeting widget. A profile ID is an integration identifier; the backend must enforce user authentication and adapter ownership.</p>
      <div className="training-panel"><h2>Your adapter</h2><p>Record six sentences. Four train the adapter; two different sentences measure its accuracy.</p><label className="consent"><input type="checkbox" checked={consent} onChange={event=>setConsent(event.target.checked)} disabled={busy}/> I agree to send these calibration videos through the connected training adapter for training and evaluation.</label>
      <button className="button" onClick={()=>void train()} disabled={!backend || busy || !consent || clips.length<6}>{!backend?'Training backend not connected':busy?'Training request in progress…':'Upload clips & train adapter'}</button>
      {busy && <button className="text-button" onClick={()=>{request.current?.abort();if(pollTimer.current)clearTimeout(pollTimer.current);setBusy(false);setNotice('Stopped waiting. The server job may continue; no cancellation endpoint is defined.');}}>Stop waiting</button>}
      {job && <div className="training-progress" aria-live="polite"><span>{job.status==='complete'?'Training complete':job.status==='failed'?'Training failed':job.status==='queued'?'Queued':'Training'}</span><progress max={1} value={job.status==='complete'?1:job.progress}/><span>{Math.round((job.status==='complete'?1:job.progress)*100)}%</span></div>}
      <div className="accuracy-results"><div><span>Before accuracy</span><strong>{metric(job?.beforeAccuracy)}</strong></div><div><span>After accuracy</span><strong>{metric(job?.afterAccuracy)}</strong></div></div><p className="small">Accuracy is reported by the backend on held-out sentences. No scores are generated locally.</p></div>
    </section><section className="enrollment-panel"><h2>Teach it how you mouth words.</h2><p>Stay comfortable, keep your face in view, and mouth the phrase without whispering.</p><CameraPreview onStream={setStream} onFrame={tracking.sample}/><label className="model-picker">Local MediaPipe face landmark model<input type="file" accept=".task" onChange={event=>{const file=event.target.files?.[0];if(file)void file.arrayBuffer().then(buffer=>setModelBuffer(new Uint8Array(buffer))).catch(()=>setError('Could not load the model file. Try again.'));}}/></label><div className="mouth-feedback"><label htmlFor="enrollment-mouth">Mouth movement</label><meter id="enrollment-mouth" min={0} max={100} value={tracking.level}/><p>{tracking.coaching}</p></div>
      <div className="enrollment-prompt"><span>Sentence {Math.min(clips.length+1,6)} of 6 · {clips.length<4?'Training':'Held-out evaluation'}</span><blockquote>“{prompts[Math.min(clips.length,5)]}”</blockquote><button className={`button ${recording?'recording':''}`} disabled={(!stream && !recording) || clips.length===6 || busy} onClick={record}><Video size={16}/>{recording?'Stop recording':clips.length===6?'All six clips captured':'Record this phrase'}</button><p className="small">{recording?'Mouth the phrase, then stop. Recording stops automatically after 15 seconds.':`${clips.length} clips captured locally. Nothing uploads until you choose to train.`}</p>
      <div className="enrollment-actions"><button className="text-button" disabled={!clips.length || recording || busy} onClick={()=>setClips(previous=>previous.slice(0,-1))}>Redo last phrase</button><button className="text-button" disabled={!clips.length || recording || busy} onClick={()=>{setClips([]);setJob(null);setConsent(false);}}>Discard all clips</button></div></div>
    </section></div>{error && <p className="workspace-error" role="alert">{error}</p>}
  </main>;
}
