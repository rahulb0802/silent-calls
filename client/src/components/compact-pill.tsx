import {useEffect, useRef, type ReactNode} from 'react';
import {CalendarDays, History, ChevronDown, ChevronUp, Keyboard, Maximize2, Mic, Sparkles, Volume2} from 'lucide-react';
import type {Candidate, Route} from '../services/meeting-port';
import {CopilotPanel} from './copilot-panel';

export type PillPhase = 'off' | 'starting' | 'listening' | 'capturing' | 'thinking' | 'choosing' | 'speaking';
type Props = {
  learningReview?:ReactNode;
  phase: PillPhase;
  dictation: boolean;        // picks are typed into the focused app instead of spoken
  onDictation: (on: boolean) => void;
  candidates: Candidate[];
  highlight: number;
  onPick: (candidate: Candidate) => void;
  repair: string;
  onRepair: () => void;
  lastLine: {speaker: string; text: string} | null;
  speaking: string;
  hint: string;
  error: string;
  cameraOn: boolean;         // the camera preview itself is the full panel's video, placed over the thumb
  level: number;             // mouth movement, 0..1 of the start level
  replyPick: number;         // suggested reply picked by a gesture (-1: none)
  replyHint: string;
  showWork: boolean;
  onShowWork: (open: boolean) => void;
  onExpand: () => void;
  onStart: () => void;
  starting: boolean;
  work: {ranker?: 'jev' | 'lip'; route?: Route; confidence?: number; adapter?: string | null};
  tip?: ReactNode;           // the camera coach's current recommendation, if any
};

const STATUS: Record<PillPhase, string> = {
  off: 'Companion paused', starting: 'Getting ready…', listening: 'Listening to the call', capturing: 'Reading your lips',
  thinking: 'Finding your words…', choosing: 'Is this what you meant?', speaking: 'Saying it',
};

/** The compact companion: a strip under the webcam with only what's needed right now. Everything else is
 * behind "show work" (what the lip-reader saw and how it was ranked) or the full panel. */
export function CompactPill(p: Props) {
  const root = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = root.current;
    if (!el || !window.desktop) return;
    const fit = () => void window.desktop?.setCompact(Math.ceil(el.getBoundingClientRect().height) + 2);
    const observer = new ResizeObserver(fit);
    observer.observe(el); fit();
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    // The full panel stays mounted underneath (it owns the camera); focusing it must not scroll the strip away.
    const top = () => { if (window.scrollY || document.documentElement.scrollTop) window.scrollTo(0, 0); };
    top(); window.addEventListener('scroll', top, true);
    return () => window.removeEventListener('scroll', top, true);
  }, []);
  const shown = p.candidates.slice(0, 3);
  const repairPicked = Boolean(p.repair) && p.highlight === shown.length;  // Claude's suggestion is the 4th stop
  const top = shown[p.highlight] ?? shown[0];
  return <main className={`compact-pill phase-${p.phase}`} ref={root} aria-label="Silent Calls companion">
    <div className="pill-bar">
      <div className="pill-thumb">{!p.cameraOn && <Mic size={16}/>}<span className="pill-dot"/></div>
      <div className="pill-status" aria-live="polite">
        <strong>{p.dictation && p.phase === 'speaking' ? 'Typing it' : p.dictation && p.phase === 'listening' ? 'Dictation: mouth what to type' : STATUS[p.phase]}</strong>
        {p.phase === 'listening' && <span className="pill-caption">{p.lastLine ? `${p.lastLine.speaker}: ${p.lastLine.text}` : p.hint}</span>}
        {p.phase === 'capturing' && <span className="pill-wave" aria-hidden="true">{[0, 1, 2, 3, 4, 5, 6].map(n => <i key={n} style={{animationDelay: `${n * 60}ms`}}/>)}</span>}
        {p.phase === 'speaking' && <span className="pill-caption">“{p.speaking}”</span>}
        {p.phase === 'off' && <span className="pill-caption">Start it when your call begins.</span>}
      </div>
      {p.phase === 'listening' && <span className="pill-level" aria-hidden="true"><i style={{width: `${Math.min(100, p.level * 100)}%`}}/></span>}
      {p.phase === 'off' && <button className="pill-start" disabled={p.starting} onClick={p.onStart}>{p.starting ? 'Connecting…' : 'Start'}</button>}
      <button className={`pill-icon ${p.dictation ? 'is-on' : ''}`} aria-label={p.dictation ? 'Dictation on: typing into your app' : 'Dictation off: speaking into the call'} aria-pressed={p.dictation} title={p.dictation ? 'Typing into your app (click to speak instead)' : 'Speaking into the call (click to type instead)'} onClick={() => p.onDictation(!p.dictation)}><Keyboard size={15}/></button>
      <button className="pill-icon" aria-label={p.showWork ? 'Hide details' : 'Show work'} aria-expanded={p.showWork} onClick={() => p.onShowWork(!p.showWork)}>{p.showWork ? <ChevronUp size={15}/> : <ChevronDown size={15}/>}</button>
      <button className="pill-icon" aria-label="Open the full companion" onClick={p.onExpand}><Maximize2 size={14}/></button>
    </div>
    {p.phase === 'choosing' && top && <div className="pill-choices">
      <button className={`pill-top ${repairPicked ? 'is-dimmed' : ''}`} onClick={() => p.onPick(top)}><span>{top.text}{top.source==='personal' && <small className="personal-name-label">Uses your saved name</small>}</span>{top.source === 'copilot' && <CalendarDays size={13} aria-label="co-pilot reply"/>}{top.source === 'memory' && <History size={13} aria-label="something you've said before"/>}<Volume2 size={14}/></button>
      <div className="pill-others">{shown.map((c, i) => c === top ? null : <button key={c.id} onClick={() => p.onPick(c)}><kbd>{i + 1}</kbd>{c.text}{c.source === 'copilot' && <CalendarDays size={11}/>}</button>)}
        {p.repair && <button className={`pill-repair ${repairPicked ? 'is-picked' : ''}`} aria-current={repairPicked ? 'true' : undefined} onClick={p.onRepair}><Sparkles size={11}/>{p.repair}</button>}</div>
      <p className="pill-hint">{p.hint}</p>
    </div>}
    {(p.phase === 'capturing' || p.phase === 'thinking') && p.hint && <p className="pill-hint">{p.hint}</p>}
    {(p.phase === 'listening' || p.phase === 'capturing') && <CopilotPanel compact pick={p.replyPick} hint={p.replyHint}/>}
    {p.tip}
    {p.learningReview}
    {p.error && <p className="pill-error" role="alert">{p.error}</p>}
    {p.showWork && <div className="pill-work">
      <h2>What the lip-reader saw</h2>
      {p.candidates.length ? <ol>{p.candidates.slice(0, 10).map(c => <li key={c.id} className={c.source === 'copilot' ? 'from-copilot' : undefined}>
        <span>{c.text}</span><small>{c.source === 'personal' ? 'saved-name correction, not a model score' : c.source === 'copilot' ? 'co-pilot reply, scored on your lips' : 'lip-reading'}{c.prob !== undefined ? ` · ${Math.round(c.prob * 100)}%` : ''}</small></li>)}</ol>
        : <p className="pill-muted">Mouth something to see the raw guesses.</p>}
      {p.candidates.length > 0 && <p className="pill-muted">{p.work.ranker === 'jev' ? 'Ranked with the conversation (Jev)' : 'Ranked by lip-reading alone'}{p.work.confidence !== undefined ? ` · confidence ${Math.round(p.work.confidence * 100)}%` : ''}{p.work.adapter ? ' · your personal model' : ''}</p>}
    </div>}
  </main>;
}
