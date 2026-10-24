import {useEffect,useRef,useState} from 'react';
import {ArrowRight,Camera,Check,RefreshCw} from 'lucide-react';
import {HandsFree,PRACTICE,personalGestures,type FaceSample,type HandsFreeEvent} from '../capture/hands-free';
import {useMouthTracking} from '../capture/mouth-tracking';
import {useHandsFree} from '../capture/use-hands-free';
import {loadSettings,type ServiceSettings} from '../services/settings';

const lessons=[
  ['Find your resting position.','Look straight ahead and relax for a moment.'],
  ['A nod means yes.','Nod gently, then return to the center. This confirms the highlighted phrase.'],
  ['A turn means next.','Turn your head to either side, then return to the center to move to the next phrase.'],
  ['A shake means no.','Shake your head from side to side, then return to the center. This dismisses the choices.'],
  ['Now start a thought.','Nod once to begin reading your lips. This is practice; nothing is being recorded or spoken.'],
  ['And finish your thought.','Mouth “That sounds good to me,” then nod again to finish.'],
  ['One last little calibration.','Stay still first. Then mouth the sentence when prompted.'],
];
const expected:Partial<Record<number,HandsFreeEvent>>={1:'send',2:'next',3:'cancel',4:'send',5:'send'};
export function GestureOnboarding({settings,onComplete,onLockChange}:{settings:ServiceSettings;onComplete:()=>void;onLockChange:(locked:boolean)=>void}){
  const [stage,setStage]=useState(-1),[model,setModel]=useState<Uint8Array|null>(null),[cameraOn,setCameraOn]=useState(false);
  const [loading,setLoading]=useState(false),[error,setError]=useState(''),[hint,setHint]=useState('');
  const video=useRef<HTMLVideoElement>(null),stream=useRef<MediaStream|null>(null),alive=useRef(true),opening=useRef(false);
  const stageRef=useRef(stage),quiet=useRef(0),rests=useRef<FaceSample[]>([]),engine=useRef(new HandsFree({mode:'head',startBy:'nod',...PRACTICE}));
  const lipRange=useRef<{min:number;max:number}>({min:Infinity,max:-Infinity});
  // This person's own nod and turn: measured from their resting pose in steps 2 and 3, saved at the end.
  const restPose=useRef({yaw:0,pitch:0}),peaks=useRef({nod:0,turn:0});
  const sampleCallback=useRef<(sample:FaceSample)=>void>(()=>{}),mouthSeen=useRef(false),finished=useRef(false),complete=useRef(onComplete);
  complete.current=onComplete;stageRef.current=stage;
  const calibration=useHandsFree('busy',-1e9,false,()=>{});
  const tracking=useMouthTracking(cameraOn,model,sample=>sampleCallback.current(sample));
  function stop(){stream.current?.getTracks().forEach(track=>{track.onended=null;track.stop();});stream.current=null;setCameraOn(false);}
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;stream.current?.getTracks().forEach(track=>track.stop());};},[]);
  useEffect(()=>{
    if(!cameraOn)return;const owner=crypto.randomUUID();
    const renew=()=>{try{localStorage.setItem('silent-calls:gesture-practice:v1',JSON.stringify({owner,until:Date.now()+15000}));}catch{}};
    renew();const timer=setInterval(renew,5000);
    return()=>{clearInterval(timer);try{const value=JSON.parse(localStorage.getItem('silent-calls:gesture-practice:v1') || '{}');if(value.owner===owner)localStorage.removeItem('silent-calls:gesture-practice:v1');}catch{}};
  },[cameraOn]);
  useEffect(()=>{onLockChange(loading || cameraOn);return()=>onLockChange(false);},[loading,cameraOn,onLockChange]);
  useEffect(()=>{
    if(!cameraOn)return;let frame=0;
    const tick=(now:number)=>{if(video.current && video.current.readyState>=2)tracking.sample(video.current,now);frame=requestAnimationFrame(tick);};
    frame=requestAnimationFrame(tick);return()=>cancelAnimationFrame(frame);
  },[cameraOn,tracking.sample]);
  useEffect(()=>{if(stage===6)calibration.calibrate();},[stage]);
  useEffect(()=>{
    if(stage!==6 || calibration.calibration.step!=='done' || finished.current)return;
    try{
      calibration.setPersonalGestures(personalGestures(peaks.current.nod,peaks.current.turn));
      calibration.setHeadGestures();
      localStorage.setItem(`silent-calls:gestures:${encodeURIComponent(settings.profileId.trim())}`,JSON.stringify({completedAt:new Date().toISOString(),mode:'head',startBy:'nod'}));
      finished.current=true;stop();setStage(7);complete.current();
    }catch{setError('Your gestures worked, but setup could not be saved. Allow app storage and try again.');}
  },[stage,calibration.calibration.step]);
  function advance(next:number,t:number){stageRef.current=next;setStage(next);quiet.current=t+800;rests.current=[];engine.current=new HandsFree({mode:'head',startBy:'nod',...PRACTICE});setHint('Good. Return to your comfortable resting position.');}
  sampleCallback.current=sample=>{
    if(calibration.recording && stageRef.current!==6)calibration.onSample(sample);  // tuning recording (numbers only)
    const current=stageRef.current;
    if(current<0 || current>6)return;
    if(current===6){calibration.onSample(sample);return;}
    if(!sample.face){rests.current=[];engine.current=new HandsFree({mode:'head',startBy:'nod',...PRACTICE});setHint('Keep your whole face in view. We’ll continue when you’re ready.');return;}
    if(sample.t<quiet.current)return;
    if(current===0){
      rests.current.push(sample);rests.current=rests.current.filter(value=>value.t>=sample.t-2200);
      const values=rests.current;
      if(values.length>=20 && sample.t-values[0].t>=2000 && Math.max(...values.map(v=>v.yaw))-Math.min(...values.map(v=>v.yaw))<6 && Math.max(...values.map(v=>v.pitch))-Math.min(...values.map(v=>v.pitch))<5){
        restPose.current={yaw:values.reduce((a,v)=>a+v.yaw,0)/values.length,pitch:values.reduce((a,v)=>a+v.pitch,0)/values.length};
        peaks.current={nod:0,turn:0};advance(1,sample.t);
      }
      return;
    }
    if(current===1)peaks.current.nod=Math.max(peaks.current.nod,Math.abs(sample.pitch-restPose.current.pitch));
    if(current===2)peaks.current.turn=Math.max(peaks.current.turn,Math.abs(sample.yaw-restPose.current.yaw));
    if(current===5){lipRange.current.min=Math.min(lipRange.current.min,sample.open);lipRange.current.max=Math.max(lipRange.current.max,sample.open);if(sample.mouth>.3 || lipRange.current.max-lipRange.current.min>.015)mouthSeen.current=true;}
    const events=engine.current.push(sample,'choosing');
    const other=events.find(event=>event!==expected[current] && ['send','next','cancel'].includes(event));
    if(other && !events.includes(expected[current]!)){
      const seen={send:'a nod',next:'a turn',cancel:'a shake'}[other as 'send'|'next'|'cancel'];
      const want={send:'a small nod: down, then back to center',next:'a turn to one side, then back to center',cancel:'a quick shake: left and right, then center'}[expected[current] as 'send'|'next'|'cancel'];
      setHint(`That looked like ${seen}. Try ${want}.`);
    }
    if(events.includes(expected[current]!)){
      if(current===5 && !mouthSeen.current){setHint('Mouth the sentence first, then nod to finish.');return;}
      advance(current+1,sample.t);
    }
  };
  async function begin(){
    if(opening.current)return;opening.current=true;setLoading(true);setError('');
    let media:MediaStream|null=null;
    try{
      if(!model){const response=await fetch(new URL('models/face_landmarker.task',new URL(import.meta.env.BASE_URL,location.href)),{signal:AbortSignal.timeout(15000)});if(!response.ok)throw new Error('The gesture model is missing. Restart the app after its setup download finishes.');const bytes=new Uint8Array(await response.arrayBuffer());if(bytes.length<100000)throw new Error('The gesture model is incomplete. Restart setup to download it again.');if(alive.current)setModel(bytes);}
      media=await navigator.mediaDevices.getUserMedia({video:{width:{ideal:854},height:{ideal:480},frameRate:{ideal:25,max:25}},audio:false});
      if(!alive.current){media.getTracks().forEach(track=>track.stop());return;}
      stream.current=media;video.current!.srcObject=media;await video.current!.play();
      media.getVideoTracks()[0].onended=()=>{if(alive.current){setCameraOn(false);setStage(-1);setError('Your camera disconnected. Reconnect it and begin again.');}};
      engine.current=new HandsFree({mode:'head',startBy:'nod',...PRACTICE});rests.current=[];mouthSeen.current=false;lipRange.current={min:Infinity,max:-Infinity};quiet.current=0;setCameraOn(true);setStage(0);setHint('Your movements stay on this computer. Nothing is sent to your call.');
    }catch(reason){media?.getTracks().forEach(track=>track.stop());if(alive.current){setCameraOn(false);setStage(-1);setError(reason instanceof Error?reason.message:'Couldn’t open your camera. Try again.');}}
    finally{opening.current=false;if(alive.current)setLoading(false);}
  }
  function restart(){stop();stageRef.current=-1;setStage(-1);setError('');setHint('');finished.current=false;}
  return <section className="gesture-onboarding" aria-label="Learn hands-free controls">
    <div className="gesture-camera"><video ref={video} autoPlay muted playsInline aria-label="Gesture practice preview"/>{!cameraOn && <div><Camera size={32}/><p>Your camera starts when you begin.</p></div>}{cameraOn && <span className="camera-tag"><span className="dot"/>Private practice</span>}</div>
    <div className="gesture-lesson" aria-live="polite">{stage<0?<><h2>A few movements. No buttons.</h2><p>Nod for yes, turn for the next choice, and shake for no. We’ll walk you through each one, then practice starting and finishing a phrase.</p><button className="button" disabled={loading} onClick={()=>void begin()}>{loading?'Getting ready…':'Learn my gestures'}<ArrowRight size={16}/></button><p className="small">This uses your camera only. No video is uploaded, and nothing is spoken.</p></>:stage<7?<><div className="gesture-progress"><span>{stage+1} of 7</span><progress max={7} value={stage}/></div><h2 key={stage}>{lessons[stage][0]}</h2><p>{stage===6?calibration.calibration.step==='rest'?`Stay still and relax · ${calibration.calibration.secondsLeft}s`:calibration.calibration.step==='mouth'?`Mouth “That sounds good to me” repeatedly · ${calibration.calibration.secondsLeft}s`:lessons[stage][1]:lessons[stage][1]}</p>{stage>0 && stage<6 && <div className={`gesture-motion gesture-motion-${stage===2?'turn':stage===3?'shake':'nod'}`} aria-hidden="true"><span/></div>}{stage===5 && <blockquote>“That sounds good to me.”</blockquote>}{stage===6 && calibration.calibration.step==='failed' && <><p className="error">We couldn’t distinguish resting from mouthing. Keep your face well lit and try again.</p><button className="button" onClick={calibration.calibrate}>Try this calibration again</button><button className="text-button" onClick={calibration.saveCalibration}>Save these readings for tuning</button></>}<p className="small" role="status">{!tracking.available?tracking.coaching:hint}</p><button className="text-button" onClick={restart}><RefreshCw size={14}/>Start practice again</button>{stage<6 && (calibration.recording?<p className="small" role="status">Recording for tuning · {calibration.recording}s · {calibration.recording>10?'stay still, mouth closed':calibration.recording>5?'mouth “that sounds good to me” clearly, over and over':'smile, twitch, nod'}</p>:<button className="text-button" onClick={calibration.record} title="Saves 15 s of face readings (numbers only, no video) to tune gestures and mouthing">Record 15 s for tuning</button>)}</>:<><Check size={24}/><h2>You’re ready to go hands-free.</h2></>}{error && <p className="error" role="alert">{error}</p>}</div>
  </section>;
}

export function GestureSetupPage(){
  const [settings]=useState(loadSettings),[locked,setLocked]=useState(false);
  return <main className="consumer-home"><header className="consumer-header"><a href="#/workspace" onClick={event=>{if(locked)event.preventDefault();}}>Back to Silent Calls</a></header><section className="consumer-page"><div className="consumer-page-heading"><h1>A little nod. A little freedom.</h1><p>Learn yes, no and next, then practice starting and finishing a phrase. Your voice training stays saved.</p></div><GestureOnboarding settings={settings} onLockChange={setLocked} onComplete={()=>{location.hash='#/workspace';}}/></section></main>;
}
