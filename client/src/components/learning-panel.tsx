import {useEffect,useRef,useState} from 'react';
import {EnrollmentApi,EnrollmentHttpError,trainingRunning,type TrainingStatus} from '../services/enrollment-api';
import {LEARNED,LEARNING_CHANGED,learningOn,setLearning} from '../services/learning';
import {loadSettings} from '../services/settings';

function outcome(status:TrainingStatus){
  if(status.state==='failed')return 'Training could not finish. Your active model was not replaced.';
  if(status.state!=='done')return 'No completed update was found. Your active model remains available.';
  const report=status.report;
  if(report?.promoted===false)return `Your current model was kept. ${report.promotion_reason || 'The new version did not pass its held-out checks.'}`;
  if(report?.promoted!==true)return 'Training finished, but this server did not report a protected model update. Ask your team to deploy the latest training service.';
  const from=report.incumbent_wer,to=report.after_wer;
  return `Your new model passed the replacement checks.${typeof from==='number' && typeof to==='number'?` Held-out word errors: ${Math.round(from*100)}% → ${Math.round(to*100)}%.`:''}`;
}
export function LearningPanel(){
  const [on,setOn]=useState(learningOn),[count,setCount]=useState<number|null>(null),[status,setStatus]=useState(''),[busy,setBusy]=useState(false);
  const abort=useRef<AbortController|null>(null),alive=useRef(false),locked=useRef(false);
  const api=()=>new EnrollmentApi(loadSettings());
  async function refresh(){const signal=abort.current?.signal;if(!signal)return;try{const n=await api().corrections(signal);if(alive.current && !signal.aborted)setCount(n);}catch{if(alive.current && !signal.aborted)setCount(null);}}
  useEffect(()=>{
    alive.current=true;const controller=new AbortController();abort.current=controller;
    const changed=()=>setOn(learningOn());
    const learned=(event:Event)=>{const n=(event as CustomEvent<number>).detail;if(Number.isInteger(n))setCount(n);};
    window.addEventListener(LEARNING_CHANGED,changed);window.addEventListener(LEARNED,learned);void refresh();
    return()=>{alive.current=false;controller.abort();window.removeEventListener(LEARNING_CHANGED,changed);window.removeEventListener(LEARNED,learned);};
  },[]);
  async function follow(client:EnrollmentApi,signal:AbortSignal){
    for(let i=0;i<120 && !signal.aborted;i++){
      const next=await client.status(signal);if(signal.aborted || !alive.current)return;
      if(!trainingRunning(next)){setStatus(outcome(next));return;}
      setStatus(next.state==='training'?`Learning from approved examples · ${next.step || 0} of ${next.steps || '…'}`:'Comparing your personal models…');
      await new Promise<void>((resolve,reject)=>{const stop=()=>{clearTimeout(timer);reject(new Error('Stopped waiting.'));};const timer=setTimeout(()=>{signal.removeEventListener('abort',stop);resolve();},3000);signal.addEventListener('abort',stop,{once:true});});
    }
    if(alive.current && !signal.aborted)setStatus('Training may still be running. Check progress before starting another update.');
  }
  async function training(start:boolean){
    const signal=abort.current?.signal;if(!signal || signal.aborted || locked.current)return;
    locked.current=true;setBusy(true);setStatus(start?'Preparing an update. Your current model stays active.':'Checking your update…');
    try{
      const client=api(),current=await client.status(signal);
      if(start && !trainingRunning(current)){
        try{await client.start(signal);}catch(reason){if(!(reason instanceof EnrollmentHttpError && reason.status===409))throw reason;}
      }
      await follow(client,signal);
    }catch(reason){if(alive.current && !signal.aborted)setStatus(`Couldn’t confirm the training result. Check progress before retrying. ${reason instanceof Error?reason.message:''}`);}
    finally{locked.current=false;if(alive.current && !signal.aborted)setBusy(false);}
  }
  async function remove(){
    const signal=abort.current?.signal;if(!signal || locked.current)return;locked.current=true;setBusy(true);
    try{await api().deleteCorrections(signal);if(alive.current && !signal.aborted){setCount(0);setStatus('Saved examples deleted. This does not undo an already trained adapter; a future update still has to pass the same quality checks.');}}
    catch{if(alive.current && !signal.aborted)setStatus('Couldn’t confirm deletion. Refresh the count and try again.');}
    finally{locked.current=false;if(alive.current && !signal.aborted)setBusy(false);}
  }
  return <section className="hands-free" aria-label="Learn from my corrections"><label className="hands-free-toggle"><input type="checkbox" checked={on} onChange={event=>setLearning(event.target.checked)}/>Learn from my corrections</label><p className="capture-help">After you choose corrected words, we’ll ask if they exactly match what you mouthed. Only a separate Yes saves the mouth crop and those words. A useful suggested reply alone never becomes a training example.</p><p className="capture-help">{count===null?'Saved examples unavailable. Connect recognition, then refresh.':`Approved examples: ${count}`}</p><p className="capture-help">Train after your call to keep replies responsive. Your current model stays active unless the new one passes held-out checks against it.</p><div className="hands-free-row"><button className="icon-text" disabled={busy || !count} onClick={()=>void training(true)}>Train after my call</button><button className="icon-text" disabled={busy} onClick={()=>void training(false)}>Check progress</button><button className="icon-text" disabled={busy} onClick={()=>void refresh()}>Refresh count</button><button className="icon-text" disabled={busy || !count} onClick={()=>void remove()}>Delete approved examples</button></div>{status && <p className="capture-help" role="status">{status}</p>}</section>;
}
