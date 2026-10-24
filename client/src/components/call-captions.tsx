import {Captions} from 'lucide-react';
import {useLocalVoice} from '../services/use-local-voice';

/** The call so far: the last few lines from both sides, plus the other person's line as they say it. */
export function CallCaptions() {
  const {state} = useLocalVoice();
  if (state.connection !== 'connected') return null;
  const live = state.liveCaption;
  return <section className="call-captions" aria-label="Call captions">
    <h2><Captions size={14}/> Call captions</h2>
    {state.captions.length === 0 && !live && <p className="call-captions-empty">Listening to the call. What the other person says appears here as they speak.</p>}
    <div aria-live="polite">
      {state.captions.map((line, index) => <p key={index}><strong>{line.speaker}</strong>{line.text}</p>)}
      {live && <p className="live"><strong>{live.speaker}</strong><span>{live.text}</span></p>}
    </div>
  </section>;
}
