import {useEffect,useId,useState} from 'react';
import {ArrowUpRight,Volume2} from 'lucide-react';
import {SavedPhrases} from './saved-phrases';
import {useLocalVoice} from '../services/use-local-voice';
export const QUICK_PHRASES=['Yes','One moment, please.','Thank you.','Could you repeat that?'];
export const SETUP_PHRASE='Hi, this is my Silent Calls voice. Can you hear me clearly?';
export function VoicePanel({setup=false}:{setup?:boolean}){
  const voice=useLocalVoice(),{state}=voice;
  const id=useId();
  const [text,setText]=useState(''),[notice,setNotice]=useState(''),[connecting,setConnecting]=useState(false);
  const [port,setPort]=useState(()=>localStorage.getItem('silent-calls:voice-port:v1') || '8765');
  const connected=state.connection==='connected',busy=state.phase!=='idle',canSpeak=connected && !busy;
  useEffect(()=>{if(connected || state.connection==='connecting')setPort(String(state.port));},[state.connection,state.port]);
  async function connect(){
    if(connecting)return;setNotice('');
    const number=Number(port);if(!Number.isInteger(number) || number<1024 || number>65535){setNotice('Choose a port between 1024 and 65535.');return;}
    setConnecting(true);
    try{if(number===8765 && window.desktop)await window.desktop.connectSetupVoice();else await voice.connect(number);localStorage.setItem('silent-calls:voice-port:v1',String(number));}
    catch{setNotice('Couldn’t connect your voice. Try again, or open meeting audio settings.');}
    finally{setConnecting(false);}
  }
  async function send(value:string){if(!canSpeak)return;setNotice('');await voice.speak(value);}
  return <section className={`voice-panel consumer-voice-panel ${setup?'voice-panel-setup':''}`} aria-labelledby={`${id}-title`}>
    <div className="voice-panel-heading"><h2 id={`${id}-title`}>A word from you.</h2><span className={`voice-connection ${connected?'connected':''}`}><span className="dot"/>{connected?'Ready':'Offline'}</span></div><p className="voice-description">Type a thought. Say it in your voice.</p>
    {!connected && <button className="hold-button" disabled={connecting || !voice.available} onClick={()=>void connect()}>{connecting?'Connecting…':'Connect my voice'}</button>}
    <label className="voice-text-label" htmlFor={`${id}-text`}>What would you like to say?</label><textarea id={`${id}-text`} rows={setup?4:3} maxLength={5000} value={text} placeholder="I have something to add…" onChange={event=>setText(event.target.value)} onKeyDown={event=>{if((event.metaKey || event.ctrlKey) && event.key==='Enter' && !event.nativeEvent.isComposing){event.preventDefault();if(canSpeak && text.trim())void send(text);}}}/><div className="voice-send"><span>⌘ / Ctrl + Enter</span><button className="button" disabled={!canSpeak || !text.trim()} onClick={()=>void send(text)}><Volume2 size={15}/>{busy?'Speaking…':'Say this'}</button></div>
    <div className="quick-phrases"><span>A quick reply</span><div>{QUICK_PHRASES.map(phrase=><button key={phrase} disabled={!canSpeak} onClick={()=>void send(phrase)}>{phrase}</button>)}</div></div><SavedPhrases disabled={busy} light={setup}/>
    {setup && <div className="setup-send-phrase"><p>“{SETUP_PHRASE}”</p><button className="button" disabled={!canSpeak} onClick={()=>void send(SETUP_PHRASE)}><Volume2 size={15}/>Send a test phrase</button></div>}
    {(voice.error || notice || state.phase==='uncertain') && <p className="voice-error" role="alert">{voice.error || notice || state.message}</p>}
    {state.lastSpoken && <p className="voice-last">You said: “{state.lastSpoken}”</p>}
    <details className="companion-details voice-advanced"><summary>Voice connection settings</summary><div className="voice-connect"><label htmlFor={`${id}-port`}>Local port</label><input id={`${id}-port`} type="number" min={1024} max={65535} value={port} disabled={connected || connecting} onChange={event=>setPort(event.target.value)}/><button className="icon-text" disabled={connecting} onClick={()=>connected?void voice.disconnect():void connect()}>{connected?'Disconnect':'Connect'}</button></div><p className="voice-status" role="status">{state.message}</p><button className="icon-text" onClick={()=>window.desktop?void window.desktop.showMain('audio-setup'):window.open(`${location.pathname}#/audio-setup`,'_blank')}>Meeting audio<ArrowUpRight size={13}/></button></details>
  </section>;
}
