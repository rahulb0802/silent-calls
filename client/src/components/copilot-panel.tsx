import {Sparkles} from 'lucide-react';
import {useEffect, useState} from 'react';
import {COPILOT_CHANGED, copilotOff, setCopilotOff} from '../services/lipread-port';
import {useLocalVoice} from '../services/use-local-voice';

const SOURCE_LABEL: Record<string, string> = {calendar: 'Calendar', email: 'Email', vocabulary: 'Your words', conversation: 'The call'};

/** The co-pilot's prepared replies and the facts (with sources) behind them. Mouth a reply to pick it: the
 * lip-reader scores these against your mouthing. Nothing here is spoken by itself. */
export function CopilotPanel() {
  const {state} = useLocalVoice();
  const [off, setOff] = useState(copilotOff);
  useEffect(() => {
    const sync = () => setOff(copilotOff());
    window.addEventListener(COPILOT_CHANGED, sync);
    return () => window.removeEventListener(COPILOT_CHANGED, sync);
  }, []);
  if (state.connection !== 'connected') return null;
  const copilot = state.copilot;
  const steps = copilot?.steps.map(step => step.tool === 'calendar' ? `checked your calendar (${step.results})`
    : `searched email “${step.query}” (${step.results})`).join(' · ');
  return <section className="copilot-panel" aria-label="Co-pilot prepared replies">
    <h2><Sparkles size={13}/> Co-pilot<label><input type="checkbox" checked={!off} onChange={event => setCopilotOff(!event.target.checked)}/> on</label></h2>
    {off ? <p className="copilot-empty">Off: captures are read by lip-reading alone.</p>
      : !copilot?.replies.length ? <p className="copilot-empty">After the other person speaks, likely replies appear here. Mouth one to pick it.</p>
      : <>
        <ol aria-live="polite">{copilot.replies.map((reply, index) => <li key={index}>{reply.text}
          {reply.facts.length > 0 && <span>{reply.facts.map(fact => `${SOURCE_LABEL[fact.source] ?? fact.source}: ${fact.detail}`).join(' · ')}</span>}</li>)}</ol>
        <p className="copilot-meta">{steps}{copilot.latencyMs !== null ? ` · ready in ${(copilot.latencyMs / 1000).toFixed(1)} s` : ''}</p>
      </>}
  </section>;
}
