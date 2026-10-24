import {useCallback,useEffect,useRef,useState} from 'react';
import type {CaptureClip,Frame} from '../capture/buffer';
import type {MeetingPort,Candidate,Route,UtteranceStart} from './meeting-port';
export function useMeetingPort(port:MeetingPort|undefined,onLost:()=>void){
  const lost=useRef(onLost);lost.current=onLost;
  const active=useRef(''),sequence=useRef(0),confirmed=useRef(false),timer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const [connected,setConnected]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('Lip-reading is not connected.');
  const [phase,setPhase]=useState<'idle'|'processing'|'choosing'|'queued'|'speaking'>('idle');
  const [candidates,setCandidates]=useState<Candidate[]>([]),[captions,setCaptions]=useState<{speaker:string;text:string}[]>([]);
  const [confidence,setConfidence]=useState<number|undefined>(),[timings,setTimings]=useState<Record<string,number>>({}),[quality,setQuality]=useState('');
  const [adapter,setAdapter]=useState<string|null|undefined>();
  const [route,setRoute]=useState<Route|undefined>(),[ranker,setRanker]=useState<'jev'|'lip'|undefined>(),[repair,setRepair]=useState('');
  const [upload,setUpload]=useState({sentFrames:0,bufferedBytes:0});
  const clearTimer=()=>{if(timer.current)clearTimeout(timer.current);timer.current=null;};
  useEffect(()=>{
    setConnected(false);setCandidates([]);setCaptions([]);setPhase('idle');active.current='';
    if(!port)return;
    const unsubscribe=port.subscribe(event=>{
      if(event.type==='connection'){setConnected(event.connected);setMessage(event.message);if(!event.connected){clearTimer();active.current='';setCandidates([]);setPhase('idle');lost.current();}return;}
      if(event.type==='caption'){setCaptions(lines=>[...lines.slice(-2),{speaker:event.speaker.slice(0,100),text:event.text.slice(0,2000)}]);return;}
      if(event.type==='error'){if(event.utteranceId && event.utteranceId!==active.current)return;clearTimer();setError(event.message);setPhase('idle');setCandidates([]);active.current='';return;}
      if(event.utteranceId!==active.current)return;
      if(event.type==='upload'){setUpload({sentFrames:event.sentFrames,bufferedBytes:event.bufferedBytes});return;}
      if(event.type==='repair'){if(!confirmed.current)setRepair(event.text.slice(0,5000));return;}
      if(event.type==='candidates' && !confirmed.current){clearTimer();setCandidates(event.candidates.slice(0,10));setRoute(event.route);setRanker(event.ranker);setRepair('');setConfidence(event.confidence);setTimings(event.timings||{});setQuality(event.quality||'');setAdapter(event.adapter);setPhase(event.candidates.length?'choosing':'idle');if(!event.candidates.length)setError('No phrase recognized. Try again.');}
      if(event.type==='speech.started' && confirmed.current){clearTimer();setPhase('speaking');}
      if(event.type==='speech.finished' && confirmed.current){clearTimer();setPhase('idle');setCandidates([]);active.current='';}
    });
    return()=>{clearTimer();unsubscribe();if(active.current)port.cancel(active.current);active.current='';};
  },[port]);
  const cancel=useCallback(()=>{const id=active.current;active.current='';clearTimer();setCandidates([]);setRoute(undefined);setRanker(undefined);setRepair('');setPhase('idle');setConfidence(undefined);setTimings({});setQuality('');setAdapter(undefined);if(id)port?.cancel(id);},[port]);
  function expectReply(delay:number){clearTimer();timer.current=setTimeout(()=>{const id=active.current;active.current='';setError('The service did not finish this request. Check the connection and capture again.');setCandidates([]);setPhase('idle');if(id)port?.cancel(id);},delay);}
  const onStart=useCallback((start:UtteranceStart)=>{cancel();active.current=start.utteranceId;sequence.current=0;confirmed.current=false;setError('');setUpload({sentFrames:0,bufferedBytes:0});if(connected)port?.start(start);},[cancel,port,connected]);
  const onFrame=useCallback((frame:Frame)=>{if(connected && active.current)port?.frame(active.current,sequence.current++,frame);},[port,connected]);
  const onEnd=useCallback((clip:CaptureClip)=>{if(connected && clip.id===active.current){setPhase('processing');expectReply(130000);port?.end(clip);}},[port,connected]);
  function confirm(candidate:Candidate,editedText?:string){if(!connected || phase!=='choosing' || confirmed.current || !active.current)return;confirmed.current=true;setPhase('queued');expectReply(80000);port?.confirm(active.current,candidate.id,editedText);}
  function quickPhrase(text:string){if(!connected)return;cancel();active.current=crypto.randomUUID();confirmed.current=true;setPhase('queued');expectReply(60000);port?.quickPhrase(active.current,text);}
  return{connected,error,message,phase,candidates,captions,confidence,timings,quality,adapter,route,ranker,repair,upload,cancel,confirm,quickPhrase,onStart,onFrame,onEnd};
}
