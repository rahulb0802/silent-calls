import {LearningConfirmation} from './components/learning-confirmation';
import {SavedPhrases,openPersonalLibrary} from './components/saved-phrases';
import {usePersonalLibrary,vocabularySuggestions} from './services/personal-library';
import {LipreadPort,copilotOff,names as lipNames} from './services/lipread-port';
import {loadSettings} from './services/settings';
import {VoicePanel} from './components/voice-panel';
import {CallCaptions} from './components/call-captions';
import {CopilotPanel} from './components/copilot-panel';
import {LearningPanel} from './components/learning-panel';
import {MemoryPanel,memoryOn} from './components/memory-panel';
import {DICTATION_CHANGED,dictationNames,dictationOn,formatDictation,setDictation} from './services/dictation';
import {vocabularyTerms} from './services/personal-library';
import {ReviewPanel} from './components/review-panel';
import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Camera, CameraOff, GripHorizontal, MessageCircle, Mic, Minimize2, Settings2, Sparkles, Volume2, Waves, X } from 'lucide-react';
import {CompactPill,type PillPhase} from './components/compact-pill';
import type {Candidate} from './services/meeting-port';
import {useMouthTracking} from './capture/mouth-tracking';
import {useHandsFree} from './capture/use-hands-free';
import type {FaceSample,HandsFreeEvent,HandsFreePhase} from './capture/hands-free';
import {useLocalVoice} from './services/use-local-voice';
import {useMeetingPort} from './services/use-meeting-port';
import type {MeetingPort} from './services/meeting-port';
import type {CaptureCallbacks} from './capture/use-capture';
import { useCapture } from './capture/use-capture';
import {useCameraCoach} from './camera-coach/use-camera-coach';
import type {Trigger} from './camera-coach/utterance';
import {CoachDebug,CoachOverlay,CoachSettings} from './components/coach-overlay';
import type { HoldKey, HoldStatus } from './desktop';
const keyLabels: Record<HoldKey, string> = { T: 'T', F8: 'F8', F9: 'F9', F10: 'F10', CtrlRight: 'Right Ctrl' };
export function MeetingWidget({service:providedPort}:{service?:MeetingPort} = {}) {
  const [gpuPort] = useState(() => new LipreadPort(loadSettings()));
  const port = providedPort || gpuPort;
  const [editedText,setEditedText] = useState('');
  const [tool,setTool]=useState<'talk'|'type'|'assist'|'settings'>('talk');
  // Compact companion (default): a strip under the webcam. The full panel is one click away.
  const [compact,setCompactState]=useState(()=>{try{return localStorage.getItem('silent-calls:compact')!=='0';}catch{return true;}});
  const [showWork,setShowWork]=useState(false);
  const setCompact=(on:boolean)=>{setCompactState(on);setShowWork(false);if(on)setTool('talk');try{localStorage.setItem('silent-calls:compact',on?'1':'0');}catch{/* this session only */}};
  useEffect(()=>{if(!compact)void window.desktop?.setCompact(null);},[compact]);
  const [spoken,setSpoken]=useState('');
  const [startingSession,setStartingSession]=useState(false);
  const startRequested=useRef(false);
  const [pageVisible,setPageVisible]=useState(()=>!document.hidden);
  useEffect(()=>{const changed=()=>setPageVisible(!document.hidden);document.addEventListener('visibilitychange',changed);return()=>{startRequested.current=false;document.removeEventListener('visibilitychange',changed);};},[]);
  const personal = usePersonalLibrary();
  const callbacks=useRef<CaptureCallbacks>({});
  const capture=useCapture({onStart:value=>callbacks.current.onStart?.(value),onFrame:value=>callbacks.current.onFrame?.(value),onEnd:value=>callbacks.current.onEnd?.(value),onCancel:()=>callbacks.current.onCancel?.(),onVideoFrame:(video,now)=>callbacks.current.onVideoFrame?.(video,now)});
  // Camera coach: tips on framing, light, posture and timing, learned per person (camera-coach/).
  const coach=useCameraCoach(port,capture.cameraOn,capture.stats.fps);
  const nextTrigger=useRef<Trigger>('key');
  const [coachDebug,setCoachDebug]=useState(false);
  const [modelBuffer,setModelBuffer]=useState<Uint8Array|null>(null);
  const [modelError,setModelError]=useState('');
  useEffect(()=>{
    // The face model, if present (npm run fetch:face-model puts it in public/models); otherwise pick it in Settings.
    let live=true;
    void fetch(new URL('models/face_landmarker.task',new URL(import.meta.env.BASE_URL,location.href))).then(async response=>{
      if(!response.ok)return;
      const buffer=new Uint8Array(await response.arrayBuffer());
      if(live && buffer.length>100000)setModelBuffer(previous=>previous||buffer);
    }).catch(()=>{});
    return()=>{live=false;};
  },[]);
  const faceSample=useRef<(sample:FaceSample)=>void>(()=>{});
  const tracking=useMouthTracking(capture.cameraOn,modelBuffer,sample=>faceSample.current(sample),coach.onLandmarks);
  const service=useMeetingPort(port,()=>{capture.stop();void window.desktop?.stopGlobalHold();});
  const {state:voice,speak}=useLocalVoice();
  // Suggested replies are hands-free too: while they show, turn to pick one, nod to say it, shake to clear.
  const replies=copilotOff()?[]:(voice.copilot?.replies??[]);
  const [replyPick,setReplyPick]=useState(-1);
  useEffect(()=>setReplyPick(-1),[voice.copilot]);
  const [highlight,setHighlight]=useState(0);
  useEffect(()=>setHighlight(0),[service.candidates]);
  // Hands-free: mouthing starts and stops a capture, head (or brow/eye) gestures pick an option. Keys still work.
  const handsFreePhase:HandsFreePhase=service.learningReview?'choosing':capture.phase==='capturing'?'capturing':capture.phase==='tail'||service.phase==='processing'?'thinking':service.phase==='choosing'?'choosing':(capture.phase==='ready'||capture.phase==='review')&&service.phase==='idle'?'idle':'busy';
  const onHandsFree=useRef<(event:HandsFreeEvent)=>void>(()=>{});
  const [talkingAt,setTalkingAt]=useState(-1e9);
  useEffect(()=>{if(voice.liveCaption)setTalkingAt(performance.now());},[voice.liveCaption]);
  const handsFree=useHandsFree(handsFreePhase,talkingAt,handsFreePhase==='idle'&&replies.length>0,event=>onHandsFree.current(event));
  faceSample.current=sample=>{handsFree.onSample(sample);coach.onFace(sample);};
  callbacks.current={onStart:value=>{coach.onClipStart(nextTrigger.current);service.onStart(value);},onFrame:service.onFrame,onEnd:value=>{coach.onClipEnd(value);service.onEnd(value);},onCancel:()=>{coach.onClipCancel();service.cancel();},onVideoFrame:tracking.sample};
  // Picks and retries also tell the coach how the lip-reading went.
  // Dictation: picks are typed into the app you're in instead of spoken. The companion then can't take
  // focus (clicking it would move the cursor away), and a quick tap of the meeting key types the highlighted
  // option (holding it still starts a new capture).
  const [dictation,setDictationState]=useState(dictationOn);
  useEffect(()=>{const sync=()=>setDictationState(dictationOn());window.addEventListener(DICTATION_CHANGED,sync);window.addEventListener('silent-calls:settings',sync);return()=>{window.removeEventListener(DICTATION_CHANGED,sync);window.removeEventListener('silent-calls:settings',sync);};},[]);
  useEffect(()=>{void window.desktop?.setWidgetFocusable?.(!dictation);return()=>{void window.desktop?.setWidgetFocusable?.(true);};},[dictation]);
  // in dictation the options show exactly what will be typed (lipread-port formats the same way)
  const shownText=(text:string)=>dictation?formatDictation(text,dictationNames([...vocabularyTerms(),loadSettings().profileId],voice.callNames??[])):text;
  // phrase memory's setting goes to the local service at start and whenever the profile changes
  useEffect(()=>{const sync=()=>void window.desktop?.setMemory?.({profile:loadSettings().profileId.trim(),on:memoryOn()});sync();window.addEventListener('silent-calls:settings',sync);return()=>window.removeEventListener('silent-calls:settings',sync);},[]);
  const tapTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const tapRef=useRef({dictation:false,choosing:false,accept:()=>{}});
  const confirmPick=(candidate:Candidate,text?:string)=>{if(service.phase==='choosing')coach.recordPick(candidate,text);service.confirm(candidate,text);};
  const retry=()=>{if(service.phase==='choosing')coach.recordPick(null);service.cancel();};
  const [key, setKey] = useState<HoldKey>(() => {
    const stored = localStorage.getItem('silent-calls:hold-key:v2');
    return stored && ['T', 'F8', 'F9', 'F10', 'CtrlRight'].includes(stored) ? stored as HoldKey : 'T';
  });
  const [hook, setHook] = useState<HoldStatus>({active:false,key,message:'Enable the camera, then enable the global key.'});
  const [enablingHook, setEnablingHook] = useState(false);
  const armAfterCamera = useRef(false);
  const armGlobal = useRef<() => Promise<void>>(async () => {});
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  // the camera Silent Calls reads your lips from, remembered (your meeting app can use a different one)
  const [device, setDeviceState] = useState(()=>{try{return localStorage.getItem('silent-calls:camera:v1')||'';}catch{return '';}});
  // a remembered camera that's unplugged now: use the system default instead of failing to open it
  useEffect(()=>{if(device && devices.some(d=>d.deviceId) && !devices.some(d=>d.deviceId===device))setDeviceState('');},[devices,device]);  // (ids are blank until camera permission)
  const setDevice=(id:string)=>{setDeviceState(id);try{if(id)localStorage.setItem('silent-calls:camera:v1',id);else localStorage.removeItem('silent-calls:camera:v1');}catch{/* this session only */}};
  const [keyFeedback, setKeyFeedback] = useState('Enable the camera, then hold T here—or enable the global key for your meeting.');
  const container = useRef<HTMLElement>(null);
  const serviceBusy = service.phase === 'processing' || service.phase === 'queued' || service.phase === 'speaking';
  const begin = () => {
    if (serviceBusy) { setKeyFeedback(`${keyLabels[key]} detected. Wait for the previous phrase or cancel it first.`); return; }
    if (!capture.cameraOn) { setKeyFeedback(`${keyLabels[key]} detected. Enable the camera before holding to capture.`); return; }
    if (capture.phase === 'starting') { setKeyFeedback(`${keyLabels[key]} detected. The camera is warming up; release and hold again in a moment.`); return; }
    setKeyFeedback(`${keyLabels[key]} detected. Hold while mouthing, then release to finish.`);
    nextTrigger.current='key';capture.begin();
  };
  const beginRef = useRef(begin); beginRef.current = begin;
  onHandsFree.current = event => {
    if(service.learningReview){if(event==='send')service.approveLearning();else if(event==='cancel' || event==='next' || event==='restart')service.dismissLearning();return;}
    if (event === 'start') { if (!serviceBusy) { nextTrigger.current='mouth'; capture.begin(); } return; }
    if (handsFreePhase === 'idle') {  // gestures over the suggested replies
      if (event === 'next' && replies.length) setReplyPick(index => (index + 1) % replies.length);
      if (event === 'send' && replies[replyPick]) { const text = replies[replyPick].text; setSpoken(text); void (dictation ? window.desktop?.typeText(`${text} `) : speak(text)); setReplyPick(-1); }
      else if (event === 'send' && handsFree.startBy === 'nod' && !serviceBusy) { nextTrigger.current='nod'; capture.begin(); }  // nod to start reading
      if (event === 'cancel') setReplyPick(-1);
      return;
    }
    if (event === 'stop') { capture.release(); return; }
    if (event === 'discard') { capture.abort(); return; }  // hardly any mouthing: a false start, don't read it
    // the top 3, then Claude's suggestion (when there is one) as a fourth stop
    const shown = service.candidates.slice(0, 3), stops = shown.length + (service.repair ? 1 : 0);
    if (event === 'next' && stops) setHighlight(index => (index + 1) % stops);
    if (event === 'send' && shown[highlight]) { setSpoken(shown[highlight].text); confirmPick(shown[highlight]); }
    else if (event === 'send' && service.repair && highlight === shown.length && service.candidates[0]) { setSpoken(service.repair); confirmPick(service.candidates[0], service.repair); }
    if (event === 'cancel' && handsFreePhase === 'capturing') { capture.abort(); return; }  // shake while reading
    if (event === 'cancel' && handsFreePhase === 'thinking') { service.cancel(); capture.clear(); return; }  // shake while finding words
    if (event === 'cancel' || event === 'restart') { retry(); capture.clear(); }
    if (event === 'restart') { nextTrigger.current='mouth'; capture.begin(); }
  };
  useEffect(() => { setEditedText(service.candidates[0]?.text || ''); }, [service.candidates]);
  const releaseRef = useRef(capture.release); releaseRef.current = capture.release;
  const stopRef = useRef(capture.stop); stopRef.current = capture.stop;
  useEffect(() => {
    const desktop = window.desktop;
    if (!desktop) return;
    const removeEvent = desktop.onGlobalHold(event => {
      if (event.type === 'down') {
        if (document.hasFocus() && document.activeElement?.closest('input,textarea,select,[contenteditable="true"]')) return;
        const tap = tapRef.current;
        if (tap.dictation && tap.choosing) { tapTimer.current = setTimeout(() => { tapTimer.current = null; beginRef.current(); }, 300); return; }
        beginRef.current();
      }
      if (event.type === 'up') {
        if (tapTimer.current) { clearTimeout(tapTimer.current); tapTimer.current = null; tapRef.current.accept(); return; }  // a tap: type it
        releaseRef.current();
      }
      if (event.type === 'cancel') stopRef.current();
    });
    const removeStatus = desktop.onGlobalHoldStatus(setHook);
    void desktop.getGlobalHoldStatus().then(setHook);
    return () => { removeEvent(); removeStatus(); void desktop.stopGlobalHold(); };
  }, []);
  useEffect(()=>{
    let profile=loadSettings().profileId;
    const changed=()=>{const next=loadSettings().profileId;if(next!==profile){profile=next;armAfterCamera.current=false;gpuPort.disconnect();stopRef.current();void window.desktop?.stopGlobalHold();setKeyFeedback('Profile changed. Connect lip-reading and enable your camera/key for this person.');}};
    window.addEventListener('storage',changed);window.addEventListener('silent-calls:settings',changed);
    return()=>{window.removeEventListener('storage',changed);window.removeEventListener('silent-calls:settings',changed);};
  },[gpuPort]);
  // A failed/disconnected camera must never leave the native listener armed.
  useEffect(() => { if (!capture.cameraOn) void window.desktop?.stopGlobalHold(); }, [capture.cameraOn]);
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
  armGlobal.current = enableGlobal;
  useEffect(() => {
    if (armAfterCamera.current && ready) { armAfterCamera.current = false; void armGlobal.current(); }
    if (capture.phase === 'error') armAfterCamera.current = false;
  }, [ready, capture.phase]);
  async function stop() { armAfterCamera.current = false; await window.desktop?.stopGlobalHold(); capture.stop(); container.current?.focus(); }
  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement).closest('input,select,textarea')) return;
      if(service.phase==='choosing' && ['1','2','3'].includes(event.key)){const candidate=service.candidates[Number(event.key)-1];if(candidate){event.preventDefault();setSpoken(candidate.text);confirmPick(candidate);}return;}
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
  const corrections = vocabularySuggestions(service.candidates,personal.library.vocabulary);
  async function startSession(){
    if(startingSession)return;
    startRequested.current=true;setStartingSession(true);setKeyFeedback('Getting your companion ready…');
    // Camera, lip-reading (GPU) and the local voice service all start at once; the app also warms the voice
    // service and the GPU tunnel up at launch, so this is usually quick.
    armAfterCamera.current=false;
    if(!capture.cameraOn)void capture.enable(device || undefined);
    if(!service.connected && !providedPort)void gpuPort.connect(loadSettings());
    try{
      if(window.desktop)await window.desktop.connectSetupVoice();
      if(!startRequested.current)return;
      if(service.connected){startRequested.current=false;setStartingSession(false);}
      else if(providedPort){startRequested.current=false;setStartingSession(false);setKeyFeedback('Connect your recognition service in Settings, then try again.');}
    }catch{startRequested.current=false;setStartingSession(false);setKeyFeedback('We couldn’t connect your voice. Open Settings to reconnect.');}
  }
  useEffect(()=>{
    if(!service.connected || !startRequested.current)return;
    startRequested.current=false;setStartingSession(false);
  },[service.connected]);
  useEffect(()=>{if(!startingSession)return;const timer=setTimeout(()=>{startRequested.current=false;setStartingSession(false);setKeyFeedback('Connection is taking longer than expected. Try again, or open Settings for help.');},20000);return()=>clearTimeout(timer);},[startingSession]);
  const title=service.phase==='processing'?'Finding your words…':service.phase==='queued' || service.phase==='speaking'?'Your voice, out loud.':service.phase==='choosing'?'Is this what you meant?':busy?'Your turn. We’re listening.':capture.cameraOn?'A thought to share?':'Stay in the conversation.';
  const clip=capture.clip;
  const pick=(candidate:Candidate,text?:string)=>{setSpoken(text||candidate.text);confirmPick(candidate,text);};
  tapRef.current={dictation,choosing:service.phase==='choosing',accept:()=>{
    const shown=service.candidates.slice(0,3),index=handsFree.enabled?highlight:0;
    if(shown[index])pick(shown[index]);else if(service.repair && index===shown.length && service.candidates[0])pick(service.candidates[0],service.repair);
  }};
  const pillPhase:PillPhase=!capture.cameraOn?startingSession?'starting':'off':busy?'capturing':service.phase==='processing'?'thinking':service.phase==='choosing'?'choosing':service.phase==='queued'||service.phase==='speaking'?'speaking':capture.phase==='starting'?'starting':'listening';
  const heard=voice.liveCaption||voice.captions.at(-1)||null;
  const pillHint=busy?handsFree.enabled&&handsFree.mode==='head'?handsFree.startBy==='nod'?'Nod when you finish · shake to cancel':'Stop mouthing to finish · shake to cancel':''
    :service.phase==='processing'?handsFree.enabled&&handsFree.mode==='head'?'Shake your head to cancel':''
    :service.phase==='choosing'
    ?dictation?`${handsFree.enabled?handsFree.mode==='head'?'Nod to type it · turn for the next':'Raise your eyebrows to type it':'Click one'} · tap ${keyLabels[key]} to type the highlighted one`
    :handsFree.enabled?handsFree.mode==='head'?'Nod to say it · turn for the next · shake to cancel':'Raise your eyebrows to say it · close your eyes for the next':'Press 1–3 or click · mouth again to retry'
    :handsFree.enabled?handsFree.startBy==='nod'?handsFree.mode==='head'?'Nod, mouth your reply, nod again':'Raise your brows, mouth your reply, raise them again':'Just start mouthing your reply':`Hold ${keyLabels[key]} and mouth your reply`;
  const pill=compact && <CompactPill phase={pillPhase} candidates={dictation?service.candidates.map(c=>({...c,text:shownText(c.text)})):service.candidates} highlight={handsFree.enabled?highlight:0} onPick={candidate=>pick(candidate)}
    repair={service.repair && shownText(service.repair)} onRepair={()=>service.candidates[0] && pick(service.candidates[0],service.repair)}
    lastLine={heard && {speaker:heard.speaker==='them'?'Them':heard.speaker==='me'?'You':heard.speaker,text:heard.text}} speaking={spoken} hint={pillHint} dictation={dictation} onDictation={setDictation}
    error={service.error || capture.error} cameraOn={capture.cameraOn}
    level={handsFree.enabled?handsFree.meter.level/Math.max(.01,handsFree.meter.threshold):tracking.level/100}
    replyPick={handsFree.enabled?replyPick:-1} replyHint={handsFree.enabled?handsFree.mode==='head'?'Turn your head to pick one, nod to say it':'Close your eyes a moment to pick one, raise your eyebrows to say it':''}
    showWork={showWork} onShowWork={setShowWork} onExpand={()=>setCompact(false)} onStart={()=>void startSession()} starting={startingSession}
    work={{ranker:service.ranker,route:service.route,confidence:service.confidence,adapter:service.adapter}} tip={capture.cameraOn && <CoachOverlay coach={coach} compact/>} learningReview={<LearningConfirmation review={service.learningReview} notice={service.learningNotice} onSave={service.approveLearning} onSkip={service.dismissLearning}/>}/>;
  return <>{pill}<main className={`meeting-widget live-capture consumer-widget ${busy?'is-recording':''} ${service.phase==='processing'?'is-thinking':''} ${compact?'is-compact':''} ${capture.cameraOn?'camera-on':''}`} data-visible={pageVisible} ref={container} tabIndex={-1}>
    <header className="widget-header"><div className="widget-logo"><Waves size={21}/> silent calls<span>.</span></div><GripHorizontal size={19} className="drag-grip"/><button className="icon-button" aria-label="Compact companion" onClick={()=>setCompact(true)}><Minimize2 size={16}/></button><button className="icon-button" aria-label="Close companion" onClick={()=>window.desktop?window.desktop.closeWidget():window.close()}><X size={17}/></button></header>
    <nav className="companion-tools" aria-label="Companion tools">{([['talk','Talk',Mic],['type','Type',MessageCircle],['assist','Suggestions',Sparkles],['settings','Settings',Settings2]] as const).map(([value,label,Icon])=><button key={value} aria-pressed={tool===value} onClick={()=>setTool(value)}><Icon size={16}/><span>{label}</span></button>)}</nav>
    <div className="widget-body consumer-widget-body"><LearningConfirmation review={service.learningReview} notice={service.learningNotice} onSave={service.approveLearning} onSkip={service.dismissLearning}/>
      <section className={`companion-talk ${tool!=='talk'?'consumer-hidden':''}`}><div className="companion-presence"><span className={`dot ${!capture.cameraOn?'amber':''}`}/>{busy?'Capturing your words':capture.cameraOn?tracking.available?'Hands-free ready':'Preparing gestures':'At your pace'}</div><h1 aria-live="polite">{title}</h1>
        <div className="companion-camera"><video ref={capture.video} autoPlay muted playsInline aria-label="Your camera"/>{!capture.cameraOn && <div className="companion-camera-off"><Waves size={42} strokeWidth={1.2}/><p>A quieter way to speak.</p></div>}{capture.cameraOn && <CoachOverlay coach={coach}/>}{capture.cameraOn && <span className="companion-camera-caption">{busy?'Mouth your phrase naturally':'Your preview'}</span>}<div className="companion-signal" aria-hidden="true">{[0,1,2,3,4].map(n=><i key={n} style={{animationDelay:`${n*70}ms`}}/>)}</div></div>
        {!capture.cameraOn?<><p className="companion-instruction">Start your companion. Nod to begin, mouth your phrase, then nod again to finish.</p><button className="hold-button companion-start" disabled={startingSession} onClick={()=>void startSession()}><Mic size={17}/>{startingSession?'Connecting…':'Start companion'}</button></>:<><p className="companion-instruction">{handsFree.enabled?handsFree.startBy==='nod'?busy?'Nod again when you finish.':'Nod, then mouth your reply.':busy?'Stop mouthing to finish.':voice.liveCaption?'Listening to them. Mouth your reply when they finish.':'Hands-free: just start mouthing.':busy?'Release when you finish.':hook.active?`Hold ${keyLabels[key]} in your call, then choose your words.`:'Hold the button below. Enable the meeting key in Settings to use it across apps.'}</p><button className={`hold-button ${busy?'held':''}`} disabled={serviceBusy || (!ready && capture.phase!=='capturing')} onPointerDown={event=>{event.currentTarget.setPointerCapture(event.pointerId);beginRef.current();}} onPointerUp={capture.release} onPointerCancel={capture.release} onBlur={()=>{if(!hook.active)capture.release();}} onKeyDown={event=>{if(['Space','Enter'].includes(event.code)){event.preventDefault();if(!event.repeat)beginRef.current();}}} onKeyUp={event=>{if(['Space','Enter'].includes(event.code)){event.preventDefault();capture.release();}}}><span className="record-dot"/>{busy?'Release to finish':capture.phase==='starting'?'Getting ready…':'Hold to speak'}<kbd>{keyLabels[key]}</kbd></button></>}
        {service.phase==='processing' && <div className="companion-processing" role="status"><span>Turning movement into words</span><button onClick={()=>{service.cancel();capture.clear();}}>Cancel</button></div>}
        {(service.phase==='queued' || service.phase==='speaking') && <p className="companion-instruction" role="status">Speaking your confirmed phrase…</p>}
        {service.candidates.length>0 && <section className="meeting-results companion-results"><p className="companion-instruction">{handsFree.enabled ? handsFree.mode==='head' ? 'Nod to say it · turn your head for the next · shake to cancel · or mouth it again.' : 'Raise your eyebrows to say it · close your eyes a moment for the next · or mouth it again.' : 'Choose a phrase to say it in your call.'}</p><div className="candidate-list live-candidates">{service.candidates.slice(0,3).map((candidate,index)=><button key={candidate.id} className={handsFree.enabled && index===highlight ? 'hands-free-pick' : undefined} aria-current={handsFree.enabled && index===highlight ? 'true' : undefined} disabled={service.phase!=='choosing' || !service.connected} onClick={()=>{pick(candidate);container.current?.focus();}}><kbd>{index+1}</kbd><span>{shownText(candidate.text)}{candidate.source==='personal' && <small className="personal-name-label">Uses your saved name · review before speaking</small>}</span><Volume2 size={14}/></button>)}</div>{service.repair && <button className={`companion-repair ${handsFree.enabled && highlight===Math.min(3,service.candidates.length)?'hands-free-pick':''}`} disabled={service.phase!=='choosing'} onClick={()=>confirmPick(service.candidates[0],service.repair)}><Sparkles size={14}/><span>{shownText(service.repair)}</span></button>}<details className="companion-details"><summary>Edit or see more options</summary>{service.candidates.slice(3).map(candidate=><button className="companion-other" key={candidate.id} disabled={service.phase!=='choosing'} onClick={()=>confirmPick(candidate)}>{candidate.text}</button>)}{corrections.map(text=><button className="companion-other" key={text} disabled={service.phase!=='choosing'} onClick={()=>setEditedText(text)}>{text}</button>)}<label className="gpu-edit-label" htmlFor="gpu-edit">Your words</label><textarea id="gpu-edit" rows={2} maxLength={5000} value={editedText} disabled={service.phase!=='choosing'} onChange={event=>setEditedText(event.target.value)}/><button className="hold-button" disabled={service.phase!=='choosing' || !editedText.trim()} onClick={()=>confirmPick(service.candidates[0],editedText)}>Say this<Volume2 size={15}/></button></details><button className="retry" disabled={service.phase!=='choosing'} onClick={()=>{retry();capture.clear();container.current?.focus();}}>Try that again</button></section>}
        {(service.error || capture.error) && <p className="capture-error" role="alert">{service.error || capture.error}</p>}{!capture.cameraOn && keyFeedback!=='Enable the camera, then hold T here—or enable the global key for your meeting.' && <p className="capture-help" role="status">{keyFeedback}</p>}
        <details className="companion-details"><summary>Saved phrases</summary><SavedPhrases disabled={busy || serviceBusy}/><button className="icon-text" onClick={openPersonalLibrary}>Manage my words<ArrowUpRight size={13}/></button></details><details className="companion-details"><summary>Conversation</summary><CallCaptions/></details>
      </section>
      <div className={tool==='type'?'companion-type':'consumer-hidden'}><VoicePanel/></div>
      {tool==='assist' && <section className="companion-assistant"><h1>A little help,<br/>right on time.</h1><p className="companion-instruction">Suggestions for the conversation. You choose what to say.</p><CopilotPanel pick={handsFree.enabled?replyPick:-1}/><details className="companion-details"><summary>After your call</summary><ReviewPanel/></details></section>}
      {tool==='settings' && <section className="companion-preferences"><h1>Just how you like it.</h1><div className="capture-settings"><label htmlFor="camera-device">Camera</label><select id="camera-device" value={device} disabled={capture.cameraOn} onChange={event=>setDevice(event.target.value)}><option value="">System default</option>{devices.map((camera,index)=><option key={camera.deviceId || index} value={camera.deviceId}>{camera.label || `Camera ${index+1}`}</option>)}</select><label htmlFor="hold-key">Meeting key</label><select id="hold-key" value={key} disabled={hook.active || busy || hookPending} onChange={event=>{const selected=event.target.value as HoldKey;setKey(selected);localStorage.setItem('silent-calls:hold-key:v2',selected);}}>{Object.entries(keyLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></div><button className="icon-text" disabled={!window.desktop || (!hook.active && (!ready || hookPending))} onClick={()=>hook.active?void stop():void enableGlobal()}>{hook.active?'Pause camera & meeting key':enablingHook?'Enabling…':'Enable meeting key'}</button>{(!hook.active || !hook.receivedKey) && window.desktop && <div className="companion-permissions"><p>Allow keyboard access to use your meeting key in other apps.</p><button className="icon-text" onClick={()=>window.desktop?.openKeyboardSettings('accessibility')}>Allow keyboard access<ArrowUpRight size={13}/></button><button className="icon-text" onClick={()=>window.desktop?.openKeyboardSettings('input-monitoring')}>Input monitoring<ArrowUpRight size={13}/></button></div>}<section className="hands-free" aria-label="Dictation"><label className="hands-free-toggle"><input type="checkbox" checked={dictation} onChange={event=>setDictation(event.target.checked)}/> Dictation: type into the app I'm using instead of speaking</label><p className="capture-help">Click into a text box anywhere, then mouth your words. The phrase you pick is typed at the cursor (your clipboard is put back afterwards). Tap the meeting key to type the highlighted option.</p>{dictation && key==='T' && <p className="capture-error">With dictation, choose Right Ctrl or an F key as the meeting key: holding T would type t's into your document.</p>}</section><LearningPanel/><MemoryPanel/><section className="hands-free" aria-label="Hands-free">
        <h2>Hands-free controls</h2><p className="capture-help">Nod to start and finish. Turn to choose, nod for yes, or shake for no. Hands-free is always ready when your camera is on.</p>
        {!modelBuffer && <p className="capture-help">Gesture tracking isn’t ready yet. Restart the app to finish downloading it. Buttons and typing are still available.</p>}
        {handsFree.enabled && <>
          <div className="hands-free-row"><label htmlFor="hands-free-start">Start reading</label><select id="hands-free-start" value={handsFree.startBy} onChange={event=>handsFree.setStartBy(event.target.value==='mouth'?'mouth':'nod')}><option value="nod">With a nod, and again to finish (reliable)</option><option value="mouth">When I start mouthing (automatic)</option></select></div>
          <div className="hands-free-row"><label htmlFor="hands-free-mode">Choose with</label><select id="hands-free-mode" value={handsFree.mode} onChange={event=>handsFree.setMode(event.target.value==='face'?'face':'head')}><option value="head">Head: nod, turn, shake</option><option value="face">Eyebrows and eyes</option></select></div>
          <div className="hands-free-level" aria-label="Mouth movement against the start level"><span style={{width:`${Math.min(100,handsFree.meter.level/Math.max(.01,handsFree.meter.threshold)*50)}%`}}/><i/></div>
          <p className="capture-help">Your mouth movement. {handsFree.calibrated ? 'Calibrated for you.' : 'Calibrate for best results.'}</p>
          <div className="hands-free-row">{handsFree.calibration.step==='rest' || handsFree.calibration.step==='mouth'
            ? <strong className="hands-free-calibrating">{handsFree.calibration.step==='rest' ? `Stay still and face the camera… ${handsFree.calibration.secondsLeft}` : `Now mouth any sentence, over and over… ${handsFree.calibration.secondsLeft}`}</strong>
            : <><button className="icon-text" disabled={!capture.cameraOn} onClick={handsFree.calibrate}>Calibrate (9 s)</button>{handsFree.calibrated && <button className="icon-text" onClick={handsFree.resetCalibration}>Reset</button>}{handsFree.calibration.step==='failed' && <span className="capture-error">Couldn’t tell rest from mouthing. Try again with bigger movements.</span>}</>}</div>
        </>}
      </section><CoachSettings coach={coach} cameraOn={capture.cameraOn}/><button className="companion-settings-row" onClick={()=>window.desktop?.showMain('audio-setup')}>Meeting audio<ArrowUpRight size={15}/></button><button className="companion-settings-row" onClick={openPersonalLibrary}>My words & saved phrases<ArrowUpRight size={15}/></button><button className="companion-settings-row" onClick={()=>window.desktop?.showMain('workspace')}>Voice & practice<ArrowUpRight size={15}/></button><details className="companion-details"><summary>Connection & diagnostics</summary><p className="capture-help">{service.message}</p>{!providedPort && <button className="icon-text" disabled={busy || serviceBusy} onClick={()=>service.connected?gpuPort.disconnect():gpuPort.connect(loadSettings())}>{service.connected?'Disconnect recognition':'Reconnect recognition'}</button>}<p className="capture-help">{keyFeedback}</p><p className="capture-help">{hook.message}</p><p className="capture-help">{capture.stats.fps} fps · {capture.stats.bufferedMs}ms buffered</p>{service.adapter!==undefined && <p className="capture-help">{service.adapter?`Personal model: ${service.adapter}`:'No personal model reported'}</p>}{Object.entries(service.timings).map(([name,value])=><p className="capture-help" key={name}>{name}: {Math.round(value)}ms</p>)}{(()=>{const sent=lipNames(loadSettings(),voice.callNames??[]);return <p className="capture-help">Names the lip-reader listens for ({sent.length}): {sent.length?sent.slice(0,40).join(', '):'none yet. Add names in My words, or connect Google for your calendar and email.'}</p>;})()}<div className="mouth-feedback"><label htmlFor="mouth-movement">Mouth movement</label><meter id="mouth-movement" min={0} max={100} value={tracking.level}/><p>{tracking.coaching}</p></div>{!modelBuffer && <label className="model-picker">Optional movement-feedback model<input type="file" accept=".task" onChange={event=>{const file=event.target.files?.[0];if(file)void file.arrayBuffer().then(buffer=>{setModelBuffer(new Uint8Array(buffer));setModelError('');}).catch(()=>setModelError('Could not open the model file.'));}}/></label>}{modelError && <p className="capture-error" role="alert">{modelError}</p>}{clip && <p className="capture-help">Last capture: {clip.frames.length} frames</p>}<details className="companion-details" onToggle={event=>setCoachDebug(event.currentTarget.open)}><summary>Camera coach (developer)</summary>{coachDebug && <CoachDebug coach={coach}/>}</details></details></section>}
    </div><footer className="widget-footer"><button className="icon-text" disabled={!capture.cameraOn && !startingSession} onClick={()=>{startRequested.current=false;setStartingSession(false);void stop();}}><CameraOff size={14}/>{capture.cameraOn?'Pause':'Camera off'}</button><span>{capture.cameraOn?tracking.available?'Hands-free ready':'Camera on':'Your words. Your choice.'}</span><button className="icon-button" aria-label="Open Silent Calls" onClick={()=>window.desktop?window.desktop.showMain('workspace'):window.open(location.pathname,'_blank')}><ArrowUpRight size={17}/></button></footer>
  </main></>;
}
