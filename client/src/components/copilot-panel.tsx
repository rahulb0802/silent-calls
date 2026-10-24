import {CalendarDays, Mail, MessageSquare, Sparkles, Tag, Volume2} from 'lucide-react';
import {useEffect, useState} from 'react';
import {COPILOT_CHANGED, copilotOff, setCopilotOff} from '../services/lipread-port';
import {useLocalVoice} from '../services/use-local-voice';

const SOURCE: Record<string, {label: string; Icon: typeof CalendarDays}> = {
  calendar: {label: 'Your calendar', Icon: CalendarDays}, email: {label: 'Your email', Icon: Mail},
  vocabulary: {label: 'Your words', Icon: Tag}, conversation: {label: 'The call', Icon: MessageSquare},
};

/** The co-pilot's prepared replies (2-3) and the facts behind them. Mouth one (the lip-reader scores these
 * against your mouthing, so it's picked out), or tap "Say it" to speak it right away in your voice. */
export function CopilotPanel({compact = false, pick = -1, hint = ''}: {compact?: boolean; pick?: number; hint?: string}) {
  const {state, speak} = useLocalVoice();
  const [off, setOff] = useState(copilotOff);
  const [saying, setSaying] = useState('');
  useEffect(() => {
    const sync = () => setOff(copilotOff());
    window.addEventListener(COPILOT_CHANGED, sync);
    return () => window.removeEventListener(COPILOT_CHANGED, sync);
  }, []);
  useEffect(() => setSaying(''), [state.copilot]);
  if (state.connection !== 'connected') return null;
  const replies = state.copilot?.replies ?? [];
  if (compact && (off || !replies.length)) return null;
  const busy = Boolean(saying) || state.phase === 'waiting';
  const say = (text: string) => { setSaying(text); void speak(text).finally(() => setSaying('')); };
  const steps = state.copilot?.steps.map(step => step.tool === 'calendar' ? 'checked your calendar'
    : `searched your email for “${step.query}”`).join(' · ');
  return <section className={`copilot-panel ${compact ? 'is-compact-list' : ''}`} aria-label="Suggested replies">
    <h2><Sparkles size={13}/> Suggested replies{!compact && <label><input type="checkbox" checked={!off} onChange={event => setCopilotOff(!event.target.checked)}/> on</label>}</h2>
    {off ? <p className="copilot-empty">Suggestions are paused.</p>
      : !replies.length ? <p className="copilot-empty">After the other person speaks, 2–3 replies you might give appear here.</p>
      : <>
        {!compact && <p className="copilot-how">Mouth one to pick it, or tap <strong>Say it</strong>.</p>}
        {hint && <p className="copilot-how">{hint}</p>}
        <ul aria-live="polite">{replies.map((reply, index) => <li key={index} className={index === pick ? 'is-picked' : undefined} aria-current={index === pick ? 'true' : undefined}>
          <p className="copilot-reply">{reply.text}</p>
          <button className="copilot-say" disabled={busy} onClick={() => say(reply.text)} aria-label={`Say: ${reply.text}`}>
            <Volume2 size={13}/>{saying === reply.text ? 'Saying…' : 'Say it'}</button>
          {reply.facts.length > 0 && <div className="copilot-facts">{reply.facts.map((fact, i) => {
            const source = SOURCE[fact.source] ?? {label: fact.source, Icon: Sparkles};
            return <span key={i}><source.Icon size={11}/>{source.label}: {fact.detail}</span>;
          })}</div>}
        </li>)}</ul>
        {!compact && steps && <p className="copilot-meta">To prepare these it {steps}.</p>}
      </>}
  </section>;
}
