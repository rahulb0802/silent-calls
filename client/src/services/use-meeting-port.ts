import {useCallback,useEffect,useRef,useState} from 'react';
import type {CaptureClip,Frame} from '../capture/buffer';
import type {MeetingPort,Candidate,UtteranceStart} from './meeting-port';
export function useMeetingPort(port:MeetingPort|undefined,onLost:()=>void){
  const lost=useRef(onLost);lost.current=onLost;
  const active=useRef(''),sequence=useRef(0),confirmed=useRef(false),timer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const [connected,setConnected]=useState(false),[error,setError]=useState('');
  const [phase,setPhase]=useState<'idle'|'processing'|'choosing'|'queued'|'speaking'>('idle');
  const [candidates,setCandidates]=useState<Candidate[]>([]),[captions,setCaptions]=useState<{speaker:string;text:string}[]>([]);
  const clearTimer=()=>{if(timer.current)clearTimeout(timer.current);timer.current=null;};
  useEffect(()=>{
    setConnected(false);setCandidates([]);setCaptions([]);setPhase('idle');active.current='';
    if(!port)return;
    const unsubscribe=port.subscribe(event=>{
      if(event.type==='connection'){setConnected(event.connected);if(!event.connected){clearTimer();active.current='';setCandidates([]);setPhase('idle');lost.current();}return;}
      if(event.type==='caption'){setCaptions(lines=>[...lines.slice(-2),{speaker:event.speaker.slice(0,100),text:event.text.slice(0,2000)}]);return;}
      if(event.type==='error'){if(event.utteranceId && event.utteranceId!==active.current)return;clearTimer();setError(event.message);setPhase('idle');setCandidates([]);active.current='';return;}
      if(event.utteranceId!==active.current)return;
      if(event.type==='candidates' && !confirmed.current){clearTimer();setCandidates(event.candidates.slice(0,3));setPhase(event.candidates.length?'choosing':'idle');if(!event.candidates.length)setError('No phrase recognized. Try again.');}
      if(event.type==='speech.started' && confirmed.current){clearTimer();setPhase('speaking');}
      if(event.type==='speech.finished' && confirmed.current){clearTimer();setPhase('idle');setCandidates([]);active.current='';}
    });
    return()=>{clearTimer();unsubscribe();if(active.current)port.cancel(active.current);active.current='';};
  },[port]);
  const cancel=useCallback(()=>{if(active.current)port?.cancel(active.current);clearTimer();active.current='';setCandidates([]);setPhase('idle');},[port]);
  function expectReply(){clearTimer();timer.current=setTimeout(()=>{setError('The service did not finish this request. Capture again or reconnect.');if(active.current)port?.cancel(active.current);active.current='';setCandidates([]);setPhase('idle');},20000);}
  const onStart=useCallback((start:UtteranceStart)=>{cancel();active.current=start.utteranceId;sequence.current=0;confirmed.current=false;setError('');if(connected)port?.start(start);},[cancel,port,connected]);
  const onFrame=useCallback((frame:Frame)=>{if(connected && active.current)port?.frame(active.current,sequence.current++,frame);},[port,connected]);
  const onEnd=useCallback((clip:CaptureClip)=>{if(connected && clip.id===active.current){port?.end(clip);setPhase('processing');expectReply();}},[port,connected]);
  function confirm(candidate:Candidate){if(!connected || phase!=='choosing' || confirmed.current || !active.current)return;confirmed.current=true;port?.confirm(active.current,candidate.id);setPhase('queued');expectReply();}
  function quickPhrase(text:string){if(!connected)return;cancel();active.current=crypto.randomUUID();confirmed.current=true;port?.quickPhrase(active.current,text);setPhase('queued');expectReply();}
  return{connected,error,phase,candidates,captions,cancel,confirm,quickPhrase,onStart,onFrame,onEnd};
}
