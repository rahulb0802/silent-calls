import {useEffect,useRef,useState} from 'react';
import {Check,RefreshCw,Upload,Video} from 'lucide-react';
import {CameraPreview} from '../camera';
import {EnrollmentApi,EnrollmentHttpError,trainingRunning,type EnrollmentPrompt,type EnrollmentProgress,type TrainingStatus,type TrainingReport} from '../services/enrollment-api';
// Same as server/lora/data.py MIN_CLIPS: 30 leaves 24 to train after the 20% held out for the report.
const MIN_CLIPS=30;
import {saveSettings,type ServiceSettings} from '../services/settings';

const percent=(value:unknown)=>typeof value==='number' && Number.isFinite(value) && value>=0?`${(value*100).toFixed(1)}%`:'Not reported';
const stage:Record<TrainingStatus['state'],string>={none:'No training job',queued:'Queued',loading:'Loading the model',evaluating:'Evaluating held-out sentences',training:'Training your adapter',done:'Training complete',failed:'Training failed'};
type LocalClip={prompt:EnrollmentPrompt;blob:Blob};
export function EnrollmentFlow({settings,onLockChange}:{settings:ServiceSettings;onLockChange:(locked:boolean)=>void}) {
  const [api,setApi]=useState<EnrollmentApi|null>(null),[prompts,setPrompts]=useState<EnrollmentPrompt[]>([]);
  const [progress,setProgress]=useState<EnrollmentProgress>({n_clips:0,sentence_ids:[]});
  const [selected,setSelected]=useState(''),[stream,setStream]=useState<MediaStream|null>(null);
  const [clip,setClip]=useState<LocalClip|null>(null),[preview,setPreview]=useState('');
  const [recording,setRecording]=useState(false),[busy,setBusy]=useState(''),[consent,setConsent]=useState(false);
  const [status,setStatus]=useState<TrainingStatus|null>(null),[report,setReport]=useState<TrainingReport|null>(null);
  const [error,setError]=useState(''),[notice,setNotice]=useState(''),[watching,setWatching]=useState(false);
  const recorder=useRef<MediaRecorder|null>(null),recordTimer=useRef<ReturnType<typeof setTimeout>|null>(null),pollTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const controller=useRef<AbortController|null>(null),alive=useRef(true),lock=useRef(false),watch=useRef(false);
  const prompt=prompts.find(item=>item.id===selected);
  const running=trainingRunning(status);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;watch.current=false;controller.current?.abort();if(recordTimer.current)clearTimeout(recordTimer.current);if(pollTimer.current)clearTimeout(pollTimer.current);if(recorder.current?.state==='recording')recorder.current.stop();};},[]);
  useEffect(()=>{onLockChange(Boolean(api) || !!busy || recording);return()=>onLockChange(false);},[api,busy,recording,onLockChange]);
  useEffect(()=>{if(!clip){setPreview('');return;}const url=URL.createObjectURL(clip.blob);setPreview(url);return()=>URL.revokeObjectURL(url);},[clip]);
  const valid=(signal:AbortSignal)=>alive.current && !signal.aborted;
  async function task(label:string,operation:()=>Promise<void>) {
    if(lock.current)return;lock.current=true;setBusy(label);setError('');setNotice('');
    try{await operation();}catch(reason){if(alive.current && !controller.current?.signal.aborted)setError(reason instanceof Error?reason.message:'GPU request failed. Check the tunnel and try again.');}
    finally{lock.current=false;if(alive.current)setBusy('');}
  }
  async function loadReport(client:EnrollmentApi,signal:AbortSignal) {
    try{const next=await client.report(signal);if(valid(signal))setReport(next);}
    catch(reason){if(valid(signal))setError(`Training finished, but the full report could not be loaded. Refresh status to retry. ${reason instanceof Error?reason.message:''}`);}
  }
  function stopWatching(){watch.current=false;setWatching(false);if(pollTimer.current)clearTimeout(pollTimer.current);pollTimer.current=null;}
  function startWatching(client:EnrollmentApi,signal:AbortSignal) {
    stopWatching();watch.current=true;setWatching(true);
    const poll=async()=>{
      try{
        const next=await client.status(signal);
        if(!valid(signal) || !watch.current)return;
        setStatus(next);
        if(trainingRunning(next))pollTimer.current=setTimeout(()=>void poll(),2500);
        else{stopWatching();if(next.state==='done')await loadReport(client,signal);if(next.state==='failed')setError(next.error || 'The trainer failed. Ask Rahul to inspect its train.log.');}
      }catch(reason){if(valid(signal) && watch.current){stopWatching();setError(`Status connection interrupted. The server job may continue. Click Refresh status to resume. ${reason instanceof Error?reason.message:''}`);}}
    };
    pollTimer.current=setTimeout(()=>void poll(),1000);
  }
  async function connect() {
    controller.current?.abort();const session=new AbortController();controller.current=session;
    const client=new EnrollmentApi(settings);
    saveSettings(settings);
    const [sentences,enrollment,training]=await Promise.all([client.prompts(session.signal),client.progress(session.signal),client.status(session.signal)]);
    if(!valid(session.signal))return;
    setApi(client);setPrompts(sentences);setProgress(enrollment);setStatus(training);setReport(null);
    setSelected((sentences.find(item=>!enrollment.sentence_ids.includes(item.id)) || sentences[0]).id);
    setNotice(`Connected as ${client.user}. ${enrollment.n_clips} clips already accepted by the server.`);
    if(trainingRunning(training))startWatching(client,session.signal);
    else if(training.state==='done')await loadReport(client,session.signal);
  }
  function disconnect() {
    stopWatching();controller.current?.abort();setApi(null);setPrompts([]);setClip(null);setConsent(false);setStatus(null);setReport(null);setError('');setNotice('Disconnected. Accepted enrollment clips and any training job remain on the GPU.');
  }
  function record() {
    if(recorder.current?.state==='recording'){recorder.current.stop();return;}
    if(!stream || !prompt || busy || running)return;
    try{
      const mime=['video/webm;codecs=vp8','video/webm','video/mp4'].find(type=>MediaRecorder.isTypeSupported(type));
      if(!mime)throw new Error('This browser cannot create a supported enrollment video. Use the Electron desktop app.');
      const chosen=prompt,capture=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:1_000_000}),chunks:Blob[]=[];
      let bytes=0,failed=false;
      recorder.current=capture;setClip(null);setError('');setNotice('');
      capture.ondataavailable=event=>{bytes+=event.data.size;if(bytes>20*1024*1024){failed=true;if(capture.state==='recording')capture.stop();}else if(event.data.size)chunks.push(event.data);};
      capture.onerror=()=>{failed=true;if(alive.current)setError('Recording failed. Check the camera and retake this sentence.');};
      capture.onstop=()=>{if(recordTimer.current)clearTimeout(recordTimer.current);recorder.current=null;if(!alive.current)return;setRecording(false);const blob=new Blob(chunks,{type:mime});if(!failed && blob.size)setClip({prompt:chosen,blob});else setError('No usable clip was captured, or the 20 MB limit was exceeded. Please retake it.');};
      capture.start(250);setRecording(true);recordTimer.current=setTimeout(()=>{if(capture.state==='recording')capture.stop();},14000);
    }catch(reason){setError(reason instanceof Error?reason.message:'Could not start recording.');}
  }
  async function upload() {
    if(!api || !clip || !consent || !controller.current)return;
    const signal=controller.current.signal;
    const result=await api.upload(clip.prompt,clip.blob,signal);
    if(!valid(signal))return;
    if(!result.ok){setError(`Clip rejected. Retake this sentence with your face clearly visible. ${result.error || ''} ${Array.isArray(result.quality?.flags)?result.quality.flags.join('; '):''}`);return;}
    // Server progress is authoritative; an accepted upload is safe to discard locally.
    setClip(null);
    const next=await api.progress(signal);
    if(!valid(signal))return;
    setProgress(next);setSelected((prompts.find(item=>!next.sentence_ids.includes(item.id)) || prompts[0]).id);
    setNotice(`Clip accepted. ${next.n_clips} saved on the GPU. ${result.quality?.face_rate!==undefined?`Face visible: ${percent(result.quality.face_rate)}.`:''}`);
  }
  async function refresh() {
    if(!api || !controller.current)return;
    const signal=controller.current.signal;stopWatching();
    const [enrollment,training]=await Promise.all([api.progress(signal),api.status(signal)]);
    if(!valid(signal))return;setProgress(enrollment);setStatus(training);
    if(trainingRunning(training))startWatching(api,signal);else if(training.state==='done')await loadReport(api,signal);
  }
  async function train() {
    if(!api || !consent || !controller.current)return;
    const signal=controller.current.signal;
    const [enrollment,latest]=await Promise.all([api.progress(signal),api.status(signal)]);
    if(!valid(signal))return;setProgress(enrollment);setStatus(latest);
    if(trainingRunning(latest)){startWatching(api,signal);setNotice('A job is already running. Resumed its status.');return;}
    if(enrollment.n_clips<MIN_CLIPS)throw new Error(`The GPU needs at least ${MIN_CLIPS} accepted clips before training. All 60 prompts give the best adapter.`);
    try{await api.start(signal);}
    catch(reason){if(!(reason instanceof EnrollmentHttpError && reason.status===409))throw new Error(`Training start was not confirmed. Refresh status before retrying; it may have reached the server. ${reason instanceof Error?reason.message:''}`);}
    if(!valid(signal))return;setReport(null);setStatus({state:'queued'});startWatching(api,signal);setNotice('Following the GPU training job. Leaving this screen does not cancel it.');
  }
  const metrics=report || status?.report;
  const determinate=status?.state==='training' && typeof status.step==='number' && typeof status.steps==='number' && status.steps>0;
  return <section className="enrollment-flow"><div className="enrollment-heading"><h2>Teach it how you mouth words.</h2><p>Record the GPU’s prompts in your natural mouthing style. Thirty accepted clips unlock training; all 60 give it the most examples.</p></div>
    {!api?<button className="button" disabled={!!busy} onClick={()=>void task('Connecting to training…',connect)}>{busy || 'Connect enrollment & training'}</button>:<div className="enrollment-session"><p><Check size={16}/> Connected as <strong>{api.user}</strong> · {api.base}</p><button className="text-button" disabled={!!busy || recording} onClick={disconnect}>Disconnect to change profile</button><button className="text-button" disabled={!!busy || recording} onClick={()=>void task('Refreshing…',refresh)}><RefreshCw size={14}/> Refresh status</button></div>}
    {api && <div className="enrollment-live-grid"><div><CameraPreview onStream={setStream}/><p className="small">Mouth the sentence silently. This capture has no microphone audio and stays in memory until you upload. Stop the widget’s camera if your webcam cannot be shared.</p><label htmlFor="enroll-prompt">Sentence · {progress.sentence_ids.length} accepted</label><select id="enroll-prompt" value={selected} disabled={recording || !!busy || !!clip || running} onChange={event=>setSelected(event.target.value)}>{prompts.map(item=><option key={item.id} value={item.id}>{progress.sentence_ids.includes(item.id)?'Saved · ':''}{item.id} · {item.sentence}</option>)}</select>{prompt && <blockquote>“{prompt.sentence}”</blockquote>}{progress.sentence_ids.includes(selected) && <p className="small">This sentence is already saved. Uploading a retake replaces its saved mouth crop.</p>}<button className={`button ${recording?'recording':''}`} disabled={(!stream && !recording) || !!busy || running || !prompt} onClick={record}><Video size={16}/>{recording?'Stop recording':clip?'Retake this sentence':'Record this sentence'}</button><p className="small">{recording?'Recording… Stops automatically after 14 seconds.':clip?'Review your clip, then upload or retake it.':'No video is uploaded by recording alone.'}</p>
      {clip && <div className="enrollment-review"><video src={preview} controls muted playsInline aria-label="Review enrollment clip"/><p className="small">{(clip.blob.size/1024/1024).toFixed(1)} MB · {clip.prompt.id}</p><button className="button" disabled={!consent || !!busy || running || recording} onClick={()=>void task('Uploading and checking clip…',upload)}><Upload size={15}/>{busy || 'Upload this clip'}</button><button className="text-button" disabled={!!busy || recording} onClick={()=>setClip(null)}>Discard local clip</button></div>}</div>
      <div className="enrollment-training"><h2>Your personal adapter</h2><p>{progress.n_clips} accepted clips · minimum {MIN_CLIPS} · {prompts.length} prompts available</p><label className="consent"><input type="checkbox" checked={consent} disabled={!!busy || recording} onChange={event=>setConsent(event.target.checked)}/> I agree to upload these enrollment videos for my profile’s training and evaluation. The server temporarily decodes each video and retains the mouth crop and transcript.</label><button className="button" disabled={!consent || progress.n_clips<MIN_CLIPS || !!busy || running || recording || !!clip} onClick={()=>void task('Requesting training…',train)}>{running?'Training job in progress':status?.has_adapter?'Train adapter again':'Train my adapter'}</button>{clip && <p className="small">Upload or discard the local clip before starting training.</p>}{status && <div className="training-progress" aria-live="polite"><span>{stage[status.state]}{status.phase?` · ${status.phase}`:''}</span>{running && <progress max={determinate?status.steps:undefined} value={determinate?status.step:undefined}/>} {determinate && <span>Step {status.step} / {status.steps}</span>}{typeof status.loss==='number' && <span>Loss: {status.loss.toFixed(4)}</span>}{status.has_adapter && <p className="small">A saved adapter exists for this profile.</p>}</div>}{watching && <button className="text-button" onClick={()=>{stopWatching();setNotice('Stopped polling. Training continues on the GPU. Use Refresh status to resume.');}}>Stop waiting</button>}
      <div className="enrollment-metrics"><h3>Held-out word error rate <span>Lower is better</span></h3><div className="accuracy-results"><div><span>Before WER</span><strong>{percent(metrics?.before_wer)}</strong></div><div><span>After WER</span><strong>{percent(metrics?.after_wer)}</strong></div></div><h3>Exact phrase in top five <span>Higher is better</span></h3><div className="accuracy-results"><div><span>Before top-five match</span><strong>{percent(metrics?.before_top5)}</strong></div><div><span>After top-five match</span><strong>{percent(metrics?.after_top5)}</strong></div></div><p className="small">The server chooses held-out sentences. WER can exceed 100% and is not accuracy. {metrics?.n_train!==undefined?`${metrics.n_train} training clips · ${metrics.n_test ?? '—'} held-out clips.`:''}</p></div>
      {Array.isArray(report?.per_clip) && <details className="enrollment-report"><summary>Per-sentence before / after report</summary>{report.per_clip.map((row,index)=><div key={`${row.key}-${index}`}><strong>{row.ref}</strong><p>Before: {row.before}</p><p>After: {row.after}</p></div>)}</details>}{status?.state==='done' && <p className="success">Return to the widget and capture a new phrase using this same profile. The GPU loads the adapter automatically when it is saved.</p>}
      </div></div>}{busy && <p className="small" role="status">{busy}</p>}{notice && <p className="success" role="status">{notice}</p>}{error && <p className="error" role="alert">{error}</p>}
  </section>;
}
