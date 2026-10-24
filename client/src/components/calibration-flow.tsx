import {useEffect,useRef,useState} from 'react';
import {Camera,Check,RefreshCw,Square,Video} from 'lucide-react';
import {EnrollmentApi,EnrollmentHttpError,trainingRunning,type EnrollmentPrompt,type EnrollmentProgress,type TrainingStatus} from '../services/enrollment-api';
import {saveSettings,type ServiceSettings} from '../services/settings';

const MIN=30,MAX=60;
type Screen='intro'|'connecting'|'record'|'saving'|'training'|'done';
type Clip={prompt:EnrollmentPrompt;blob:Blob};
export function CalibrationFlow({settings,onLockChange,onComplete}:{settings:ServiceSettings;onLockChange:(locked:boolean)=>void;onComplete?:()=>void}) {
  const [screen,setScreen]=useState<Screen>('intro');
  const [goal,setGoal]=useState(30),[consent,setConsent]=useState(false);
  const [accepted,setAccepted]=useState<string[]>([]);
  const [prompt,setPrompt]=useState<EnrollmentPrompt|null>(null),[recording,setRecording]=useState(false);
  const [seconds,setSeconds]=useState(0),[status,setStatus]=useState<TrainingStatus|null>(null);
  const [error,setError]=useState(''),[message,setMessage]=useState(''),[pending,setPending]=useState<Clip|null>(null);
  const [elapsed,setElapsed]=useState(0),[rate,setRate]=useState<number|null>(null);
  const video=useRef<HTMLVideoElement>(null),panel=useRef<HTMLDivElement>(null),stream=useRef<MediaStream|null>(null);
  const api=useRef<EnrollmentApi|null>(null),session=useRef<AbortController|null>(null),alive=useRef(true),busy=useRef(false);
  const recorder=useRef<MediaRecorder|null>(null),recordTimer=useRef<ReturnType<typeof setTimeout>|null>(null),clock=useRef<ReturnType<typeof setInterval>|null>(null);
  const pollTimer=useRef<ReturnType<typeof setTimeout>|null>(null),restart=useRef(false),discard=useRef(false),finished=useRef(false);
  const allPrompts=useRef<EnrollmentPrompt[]>([]),saved=useRef<string[]>([]),target=useRef(30),goalRef=useRef(goal),done=useRef(onComplete);
  const learnStarted=useRef(0),firstTraining=useRef<{at:number;step:number}|null>(null);
  const screenRef=useRef(screen);
  goalRef.current=goal;done.current=onComplete;screenRef.current=screen;
  const valid=()=>alive.current && Boolean(session.current && !session.current.signal.aborted);
  function clearRecordTimers(){if(recordTimer.current)clearTimeout(recordTimer.current);if(clock.current)clearInterval(clock.current);recordTimer.current=null;clock.current=null;}
  function stopCamera(){stream.current?.getTracks().forEach(track=>{track.onended=null;track.stop();});stream.current=null;if(video.current)video.current.srcObject=null;}
  function cleanup(){discard.current=true;clearRecordTimers();if(recorder.current?.state==='recording')recorder.current.stop();stopCamera();session.current?.abort();if(pollTimer.current)clearTimeout(pollTimer.current);pollTimer.current=null;}
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;cleanup();};},[]);
  useEffect(()=>{onLockChange(screen!=='intro' && screen!=='done');return()=>onLockChange(false);},[screen,onLockChange]);
  useEffect(()=>{if(screen!=='training')return;const timer=setInterval(()=>setElapsed(Math.max(0,(Date.now()-learnStarted.current)/1000)),1000);return()=>clearInterval(timer);},[screen]);
  const action=useRef(()=>{});
  action.current=()=>{if(screen!=='record' || busy.current || pending)return;if(recording){if(recorder.current?.state==='recording')recorder.current.stop();}else startRecord();};
  useEffect(()=>{
    function down(event:KeyboardEvent){if(screenRef.current!=='record' || event.code!=='Space' || event.ctrlKey || event.altKey || event.metaKey || (event.target as HTMLElement)?.closest('input,textarea,select,button,a,[contenteditable="true"]'))return;event.preventDefault();if(!event.repeat)action.current();}
    function up(event:KeyboardEvent){if(screenRef.current==='record' && event.code==='Space' && !(event.target as HTMLElement)?.closest('input,textarea,select,button,a,[contenteditable="true"]'))event.preventDefault();}
    window.addEventListener('keydown',down);window.addEventListener('keyup',up);return()=>{window.removeEventListener('keydown',down);window.removeEventListener('keyup',up);};
  },[]);
  function applyProgress(value:EnrollmentProgress){const allowed=new Set(allPrompts.current.map(item=>item.id));const ids=[...new Set(value.sentence_ids.filter(id=>allowed.has(id)))];saved.current=ids;setAccepted(ids);return ids;}
  function chooseNext(){const next=allPrompts.current.find(item=>!saved.current.includes(item.id));setPrompt(next || null);return next;}
  async function openCamera(){
    const media=await navigator.mediaDevices.getUserMedia({video:{width:{ideal:854},height:{ideal:480},frameRate:{ideal:25,max:25}},audio:false});
    if(!valid()){media.getTracks().forEach(track=>track.stop());return;}
    stream.current=media;if(!video.current){stopCamera();throw new Error('The camera preview could not open. Restart setup and try again.');}
    video.current.srcObject=media;await video.current.play();
    media.getVideoTracks()[0].onended=()=>{discard.current=true;clearRecordTimers();if(recorder.current?.state==='recording')recorder.current.stop();setRecording(false);setError('Your camera disconnected. Pause setup, reconnect the camera and continue. Your saved sentences are safe.');};
  }
  function complete(){if(finished.current)return;finished.current=true;busy.current=false;stopCamera();setScreen('done');setMessage('Your personal calibration is ready.');done.current?.();}
  function trainedForGoal(value:TrainingStatus){const report=value.report;return value.state==='done' && value.has_adapter===true && (report?.n_train || 0)+(report?.n_val || 0)+(report?.n_test || 0)>=target.current && saved.current.length>=target.current;}
  async function readStatus(){
    const next=await api.current!.status(session.current!.signal);
    // Older servers omit validation clips from the status summary. The full
    // report includes every split, so a 45/60-sentence session can still finish.
    if(next.state==='done'){
      try{next.report={...next.report,...await api.current!.report(session.current!.signal)};}
      catch(reason){if(session.current!.signal.aborted)throw reason;}
    }
    return next;
  }
  async function poll(){
    if(!valid() || !api.current)return;
    try{
      const next=await readStatus();if(!valid())return;setStatus(next);
      if(next.state==='training' && typeof next.step==='number'){
        const first=firstTraining.current;
        if(!first)firstTraining.current={at:Date.now(),step:next.step};
        else if(next.step>first.step)setRate((Date.now()-first.at)/1000/(next.step-first.step));
      }
      if(trainingRunning(next)){pollTimer.current=setTimeout(()=>void poll(),2500);return;}
      busy.current=false;
      if(next.state==='failed'){setError('We couldn’t finish your calibration. Your recordings are saved. Choose Check progress before retrying.');return;}
      if(trainedForGoal(next)){complete();return;}
      if(next.state==='done'){
        if(saved.current.length<target.current){chooseNext();await openCamera();if(valid()){setScreen('record');setMessage('Let’s finish your remaining sentences.');panel.current?.focus();}return;}
        setError('Training finished, but your saved personal calibration could not be confirmed. Check progress before continuing.');return;
      }
      setError('No active training was found. Your recordings are saved. Check progress before starting again.');
    }catch(reason){if(valid()){busy.current=false;setError('Connection interrupted. Your training may still be running. Keep the connection open, then choose Check progress.');}}
  }
  function watch(){stopCamera();setScreen('training');learnStarted.current=Date.now();firstTraining.current=null;setElapsed(0);setRate(null);busy.current=false;void poll();}
  async function train(){
    if(!valid() || !api.current || busy.current)return;busy.current=true;setError('');setPending(null);stopCamera();setScreen('training');learnStarted.current=Date.now();setElapsed(0);
    try{
      const [enrollment,latest]=await Promise.all([api.current.progress(session.current!.signal),readStatus()]);if(!valid())return;applyProgress(enrollment);
      if(saved.current.length<MIN || saved.current.length<target.current)throw new Error('Finish your remaining sentences before personalizing.');
      if(trainingRunning(latest)){setStatus(latest);watch();return;}
      if(trainedForGoal(latest)){complete();return;}
      try{await api.current.start(session.current!.signal);}catch(reason){if(!(reason instanceof EnrollmentHttpError && reason.status===409))throw reason;}
      if(!valid())return;setStatus({state:'queued'});watch();
    }catch(reason){if(valid()){busy.current=false;setError(`We couldn’t confirm training started. It may still be running—choose Check progress before retrying. ${reason instanceof Error?reason.message:''}`);}}
  }
  async function connect(){
    if(!consent || busy.current)return;busy.current=true;setError('');setScreen('connecting');finished.current=false;target.current=goalRef.current;
    session.current?.abort();session.current=new AbortController();
    try{
      api.current=new EnrollmentApi(settings);saveSettings(settings);
      const [sentences,enrollment,training]=await Promise.all([api.current.prompts(session.current.signal),api.current.progress(session.current.signal),readStatus()]);
      if(!valid())return;const unique=[...new Map(sentences.map(item=>[item.id,item])).values()].slice(0,MAX);
      if(unique.length<target.current)throw new Error('Not enough practice sentences are available. Please ask your team to update the service.');
      allPrompts.current=unique;applyProgress(enrollment);setStatus(training);setPending(null);
      if(trainedForGoal(training)){complete();return;}
      if(trainingRunning(training)){watch();return;}
      busy.current=false;if(saved.current.length>=target.current){await train();return;}
      chooseNext();await openCamera();if(valid()){setScreen('record');setMessage('Press Space to start. Mouth the sentence naturally, then press Space to stop.');panel.current?.focus();}
    }catch(reason){if(valid()){stopCamera();setScreen('intro');setError(reason instanceof DOMException && reason.name==='NotAllowedError'?'Allow camera access in your system’s privacy settings, then try again.':`Couldn’t start calibration. Check your connection and camera, then retry. ${reason instanceof Error?reason.message:''}`);}}
    finally{busy.current=false;}
  }
  async function upload(clip:Clip){
    if(!valid() || !api.current)return;busy.current=true;setScreen('saving');setPending(clip);setError('');
    try{
      const result=await api.current.upload(clip.prompt,clip.blob,session.current!.signal);if(!valid())return;
      if(!result.ok){setPending(null);setScreen('record');setError('Let’s try that sentence again. Keep your whole face visible and well lit.');panel.current?.focus();return;}
      const enrollment=await api.current.progress(session.current!.signal);if(!valid())return;applyProgress(enrollment);setPending(null);busy.current=false;
      if(saved.current.length>=target.current){await train();return;}
      chooseNext();setScreen('record');setMessage('Saved. Press Space for the next sentence.');panel.current?.focus();
    }catch(reason){if(valid()){setScreen('record');setError('This sentence’s save was not confirmed. Choose Check saved sentence to recover, or record it again.');}}
    finally{busy.current=false;}
  }
  function startRecord(){
    if(!stream.current?.active || !prompt || busy.current || recorder.current)return;
    try{
      const mime=['video/webm;codecs=vp8','video/webm','video/mp4'].find(value=>MediaRecorder.isTypeSupported(value));if(!mime)throw new Error('Video recording is unavailable in this app.');
      const chosen=prompt,capture=new MediaRecorder(stream.current,{mimeType:mime,videoBitsPerSecond:1_000_000});const chunks:Blob[]=[];let bytes=0,failed=false;
      recorder.current=capture;restart.current=false;discard.current=false;setPending(null);setError('');setSeconds(0);
      capture.ondataavailable=event=>{bytes+=event.data.size;if(bytes>20*1024*1024){failed=true;if(capture.state==='recording')capture.stop();}else if(event.data.size)chunks.push(event.data);};
      capture.onerror=()=>{failed=true;if(capture.state==='recording')capture.stop();if(alive.current)setError('That recording was interrupted. Press Space to try again.');};
      capture.onstop=()=>{clearRecordTimers();recorder.current=null;if(!valid())return;setRecording(false);if(discard.current)return;if(restart.current){restart.current=false;startRecord();return;}const blob=new Blob(chunks,{type:mime});if(failed || !blob.size){setError('No usable recording was captured. Press Space to try again.');return;}void upload({prompt:chosen,blob});};
      capture.start(250);setRecording(true);panel.current?.focus();const started=Date.now();clock.current=setInterval(()=>setSeconds(Math.floor((Date.now()-started)/1000)),250);recordTimer.current=setTimeout(()=>{if(capture.state==='recording')capture.stop();},14000);
    }catch(reason){recorder.current=null;setRecording(false);setError(reason instanceof Error?reason.message:'Couldn’t record this sentence.');}
  }
  function retake(){if(busy.current)return;setPending(null);setError('');if(recorder.current?.state==='recording'){restart.current=true;recorder.current.stop();}else{startRecord();}}
  async function checkSaved(){
    if(!valid() || !api.current || !pending || busy.current)return;busy.current=true;setError('');
    try{const enrollment=await api.current.progress(session.current!.signal);if(!valid())return;applyProgress(enrollment);const clip=pending;setPending(null);busy.current=false;if(saved.current.includes(clip.prompt.id)){if(saved.current.length>=target.current){await train();return;}chooseNext();setMessage('Saved. Press Space for the next sentence.');panel.current?.focus();}else await upload(clip);}
    catch{if(valid())setError('Couldn’t check this sentence. Keep your connection open and try again.');}finally{busy.current=false;}
  }
  function pause(){cleanup();busy.current=false;recorder.current=null;setRecording(false);setPending(null);setScreen('intro');setMessage('Your saved sentences will resume when you continue.');}
  async function checkTraining(){if(busy.current || !valid() || !api.current)return;if(pollTimer.current)clearTimeout(pollTimer.current);setError('');busy.current=true;try{const next=await readStatus();if(!valid())return;setStatus(next);busy.current=false;if(trainingRunning(next)){watch();return;}if(trainedForGoal(next)){complete();return;}if(next.state==='failed' || next.state==='none' || next.state==='done'){setError('Training is not running. Your saved recordings are ready; you can try personalizing again.');return;}await poll();}catch{if(valid()){busy.current=false;setError('Couldn’t check progress. Keep your connection open and try again.');}}}
  const fraction=status?.state==='training' && typeof status.step==='number' && typeof status.steps==='number' && status.steps>0?Math.min(1,status.step/status.steps):null;
  const progress=status?.state==='done'?95:status?.state==='evaluating'?status.phase==='after'?90:10:status?.state==='training'?15+(fraction || 0)*70:status?.state==='loading'?5:2;
  const remaining=rate && status?.state==='training' && typeof status.steps==='number' && typeof status.step==='number'?Math.max(1,Math.ceil((rate*(status.steps-status.step)+120)/60)):null;
  const phaseCopy=status?.state==='training'?'Learning your mouth movements':status?.state==='evaluating' && status.phase==='after'?'Checking your personal calibration':status?.state==='evaluating'?'Checking your starting point':'Preparing your personal calibration';
  return <section className="calibration-flow" aria-label="Personal calibration" ref={panel} tabIndex={-1}>
    {screen==='intro' && <div className="calibration-intro"><h2>A few sentences. A better fit.</h2><p>Choose 30–60 sentences to teach Silent Calls how you mouth words. Use the same camera position and natural movements you’ll use in your calls.</p><div className="calibration-goals" role="group" aria-label="Number of practice sentences">{[30,45,60].map(value=><button key={value} aria-pressed={goal===value} onClick={()=>setGoal(value)}><strong>{value} sentences</strong><span>{value===30?'Essential calibration':value===45?'More examples':'Full calibration'}</span></button>)}</div><p className="small">Allow roughly {Math.ceil(goal/6)}–{Math.ceil(goal/3)} minutes to record, plus training time. You can pause and resume saved sentences.</p><label className="consent"><input type="checkbox" checked={consent} onChange={event=>setConsent(event.target.checked)}/>I agree to send each video after I stop recording and personalize my model once all {goal} sentences are saved. Only mouth crops and their sentence text are retained for my profile.</label><button className="button" disabled={!consent} onClick={()=>void connect()}><Camera size={17}/>Begin calibration</button></div>}
    {screen==='connecting' && <div className="calibration-wait" role="status"><h2>Getting your camera ready.</h2><progress aria-label="Preparing calibration"/><p>Finding your saved sentences and preparing your session.</p></div>}
    <div className={`calibration-recording ${screen==='record' || screen==='saving'?'':'calibration-hidden'}`}><div className="calibration-camera"><video ref={video} autoPlay muted playsInline aria-label="Your calibration camera"/>{recording && <span className="camera-tag"><span className="dot"/>Recording · {seconds}s</span>}</div><div className="calibration-prompt"><div className="calibration-count"><span>{Math.min(accepted.length,target.current)} of {target.current} saved</span><progress value={Math.min(accepted.length,target.current)} max={target.current} aria-label="Saved sentences"/></div><blockquote>{prompt?.sentence}</blockquote><p>Mouth the sentence naturally. Press Space once to start and again when you finish.</p><button className={`button ${recording?'recording':''}`} disabled={screen==='saving' || !!pending} onClick={()=>action.current()}>{recording?<Square size={16}/>:<Video size={17}/>} {screen==='saving'?'Saving your sentence…':recording?'Space · stop recording':'Space · start recording'}</button><button className="text-button" disabled={screen==='saving'} onClick={retake}><RefreshCw size={15}/>{recording?'Restart this sentence':'Record this sentence again'}</button>{pending && <button className="button setup-secondary" onClick={()=>void checkSaved()}>Check saved sentence</button>}<p className="small">Accepted sentences save and advance automatically. A recording stops at 14 seconds. No microphone audio is captured here.</p><button className="text-button" disabled={recording || screen==='saving'} onClick={pause}>Pause setup · keep saved sentences</button></div></div>
    {screen==='training' && <div className="calibration-wait" aria-live="polite"><h2>Making Silent Calls yours.</h2><p>{error?'Your calibration needs attention':phaseCopy}</p><progress value={progress} max={100} aria-label="Personal calibration progress"/><p className="calibration-estimate">{error?'Saved recordings are safe':remaining?`About ${remaining} min remaining · estimate`:'Allow about 5–15 minutes · initial estimate'}<span>{Math.floor(elapsed/60)}m {Math.floor(elapsed%60)}s elapsed</span></p><p className="small">Keep Silent Calls and your connection open. Timing varies with the shared training computer. We’ll continue when your calibration is ready.</p>{error && <div className="calibration-recovery"><button className="button" onClick={()=>void checkTraining()}>Check progress</button>{(status?.state==='failed' || status?.state==='none' || status?.state==='done') && <button className="text-button" onClick={()=>void train()}>Try personalizing again</button>}<button className="text-button" onClick={pause}>Leave for now · training may continue</button></div>}</div>}
    {screen==='done' && <div className="calibration-wait"><Check size={30}/><h2>Your personal calibration is ready.</h2><p>Silent Calls will use this profile’s training for your next mouthed phrase.</p></div>}
    {message && screen!=='training' && <p className="small" role="status">{message}</p>}{error && <p className="error" role="alert">{error}</p>}
  </section>;
}
