import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Check, GripHorizontal, Pause, Play, RotateCcw, Volume2, Waves, X } from 'lucide-react';
import { demoCandidates, transition, type MeetingState } from './demo';
export function DemoMeetingWidget() {
  const container = useRef<HTMLElement>(null);
  const [state, setState] = useState<MeetingState>('ready');
  const [selected, setSelected] = useState('');
  const [last, setLast] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const send = useCallback((event: Parameters<typeof transition>[1]) => setState(previous => transition(previous, event)), []);
  useEffect(() => { if (state === 'processing') timer.current = setTimeout(() => send('result'), 900); if (state === 'speaking') timer.current = setTimeout(() => { setLast(selected); send('done'); }, 1800); return () => { if (timer.current) clearTimeout(timer.current); }; }, [state, selected, send]);
  const choose = useCallback((text: string) => { setSelected(text); send('select'); container.current?.focus(); }, [send]);
  useEffect(() => {
    function keydown(e: KeyboardEvent) {
      if ((e.target as HTMLElement).closest('button, input, textarea, select')) return;
      if (e.code === 'Space') { e.preventDefault(); if (!e.repeat) send('start'); }
      if (state === 'choosing' && ['1', '2', '3'].includes(e.key)) choose(demoCandidates[Number(e.key) - 1].text);
    }
    function keyup(e: KeyboardEvent) { if (e.code === 'Space') { e.preventDefault(); send('release'); } }
    function blur() { send('release'); }
    window.addEventListener('keydown', keydown);window.addEventListener('keyup', keyup);window.addEventListener('blur', blur);
    return () => { window.removeEventListener('keydown', keydown);window.removeEventListener('keyup', keyup);window.removeEventListener('blur', blur); };
  }, [state, send, choose]);
  const busy = ['capturing', 'processing', 'speaking'].includes(state);
  const labels = { ready: 'Your turn, whenever.', capturing: 'Keep mouthing…', processing: 'Finding your words…', choosing: 'Which one did you mean?', speaking: 'Previewing your phrase…', paused: 'Take your time.' };
  return <main ref={container} tabIndex={-1} className="meeting-widget"><header className="widget-header"><div className="widget-logo"><Waves size={21}/> silent calls<span>.</span></div><GripHorizontal size={19} className="drag-grip"/><button className="icon-button" aria-label="Close meeting widget" onClick={() => window.desktop ? window.desktop.closeWidget() : window.close()}><X size={17}/></button></header>
    <div className="widget-body"><div className="widget-status"><span className={`dot ${state === 'paused' ? 'amber' : ''}`}/>{state === 'paused' ? 'Paused' : 'Meeting companion'}<span className="demo-badge">Demo</span></div><h1 aria-live="polite">{labels[state]}</h1>
    {state === 'choosing' ? <div className="candidate-list">{demoCandidates.map((candidate, i) => <button key={candidate.id} onClick={() => choose(candidate.text)}><kbd>{i + 1}</kbd><span>{candidate.text}</span><ArrowUpRight size={15}/></button>)}<button className="retry" onClick={() => {setState('ready'); container.current?.focus();}}><RotateCcw size={14}/> Try again</button></div> : <div className="capture-area"><div className={`widget-wave ${busy ? 'moving' : ''}`} aria-hidden="true">{Array.from({length: 29}, (_, i) => <i key={i} style={{height: `${8 + Math.sin(i * 2.1) ** 2 * 37}px`, animationDelay: `${i * -0.08}s`}}/>)}</div><p className="widget-instruction">{state === 'ready' ? 'Hold Space and mouth a sentence.\nRelease when you’re finished.' : state === 'capturing' ? 'Release Space to see sample candidates.' : state === 'processing' ? 'Loading sample candidates.\nNo camera or inference is running.' : state === 'speaking' ? `“${selected}”` : 'Resume whenever you’re ready.'}</p><button className={`hold-button ${state === 'capturing' ? 'held' : ''}`} disabled={state !== 'ready' && state !== 'capturing'} onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); send('start'); }} onPointerUp={() => send('release')} onPointerCancel={() => send('release')} onKeyDown={e => {if (e.code === 'Space' || e.code === 'Enter') {e.preventDefault(); if (!e.repeat) send('start');}}} onKeyUp={e => {if (e.code === 'Space' || e.code === 'Enter') {e.preventDefault(); send('release');}}} onBlur={() => send('release')}><span className="record-dot"/>{state === 'capturing' ? 'Release to finish' : 'Hold to mouth'}<kbd>space</kbd></button></div>}
    <div className="quick-phrases"><span>Quick phrases</span><div>{['Yes', 'One moment', 'Thank you'].map(text => <button key={text} disabled={state !== 'ready'} onClick={() => choose(text)}>{text}</button>)}</div></div>
    <div className="last-phrase" aria-live="polite">{last ? <><Check size={14}/><span>Previewed: {last}</span></> : <><Volume2 size={15}/><span>No voice output connected</span></>}</div></div>
    <footer className="widget-footer"><button onClick={() => {send(state === 'paused' ? 'resume' : 'pause'); container.current?.focus();}} className="icon-text">{state === 'paused' ? <Play size={14}/> : <Pause size={14}/>} {state === 'paused' ? 'Resume' : 'Pause'}</button><span>Space works while focused</span><button className="icon-button" aria-label="Open main app" onClick={() => window.desktop ? window.desktop.showMain() : window.open(location.pathname, '_blank')}><ArrowUpRight size={17}/></button></footer>
  </main>;
}
