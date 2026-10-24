import {useRef,useState} from 'react';
import {ArrowUpRight,Volume2} from 'lucide-react';
import {usePersonalLibrary} from '../services/personal-library';
import {useLocalVoice} from '../services/use-local-voice';

export function openPersonalLibrary() {
  if(window.desktop)void window.desktop.showMain('library');
  else location.hash='#/library';
}
export function SavedPhrases({disabled=false,light=false}:{disabled?:boolean;light?:boolean}) {
  const {library,error}=usePersonalLibrary();
  const voice=useLocalVoice();
  const [sending,setSending]=useState(false),[notice,setNotice]=useState('');
  const lock=useRef(false);
  async function speak(text:string) {
    if(lock.current || disabled)return;
    lock.current=true;setSending(true);setNotice('');
    try {
      const desktop=window.desktop;
      if(!desktop)throw new Error('Use the Electron app to speak a saved phrase.');
      let status=await desktop.getVoiceStatus();
      if(status.connection!=='connected')status=await desktop.connectSetupVoice();
      if(status.connection!=='connected' || status.phase!=='idle')throw new Error('The voice service is busy or unavailable. Wait, then try again.');
      await desktop.speakText(text);
      setNotice('Phrase sent to the voice service.');
    }catch(reason){setNotice(reason instanceof Error?reason.message:'Could not send this phrase.');}
    finally{lock.current=false;setSending(false);}
  }
  return <section className={`saved-phrase-buttons ${light?'saved-phrase-light':''}`} aria-label="Saved phrases"><div className="saved-phrase-heading"><h2>Saved phrases</h2><button className="text-button" onClick={openPersonalLibrary}>Manage <ArrowUpRight size={13}/></button></div>{library.phrases.length?<div className="saved-phrase-list">{library.phrases.map(phrase=><button key={phrase.id} disabled={disabled || sending || voice.state.phase!=='idle' || !window.desktop} onClick={()=>void speak(phrase.text)}><Volume2 size={14}/><span>{phrase.text}</span></button>)}</div>:<p className="personal-hint">Add your own phrases to speak them with one click.</p>}{(error || notice) && <p className="personal-hint" role="status">{error || notice}</p>}</section>;
}
