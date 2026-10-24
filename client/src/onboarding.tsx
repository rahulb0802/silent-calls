import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, ChevronRight, Mic, Monitor, MoveUpRight, ShieldCheck, Volume2, Waves } from 'lucide-react';
import { CameraPreview } from './camera';
const steps = ['Welcome', 'Camera setup', 'Practice a phrase', 'Your voice', 'Ready to connect'];
const prompts = ['Thanks for making the time today.', 'Could you tell me a little more?', 'That works for me. Let’s move forward.'];
export function Onboarding() {
  const [step, setStep] = useState(() => localStorage.getItem('silent-calls:onboarding') === 'complete' ? 4 : 0);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [recording, setRecording] = useState(false);
  const [clips, setClips] = useState<Blob[]>([]);
  const [error, setError] = useState('');
  const recorder = useRef<MediaRecorder | null>(null);
  const [widgetOpened, setWidgetOpened] = useState(false);
  const [complete, setComplete] = useState(() => localStorage.getItem('silent-calls:onboarding') === 'complete');
  useEffect(() => () => { if (recorder.current?.state === 'recording') recorder.current.stop(); }, []);
  function record() {
    if (recording) { recorder.current?.stop(); setRecording(false); return; }
    if (!stream) { setError('Enable your camera before recording a practice phrase.'); return; }
    try {
      const capture = new MediaRecorder(stream); const chunks: Blob[] = [];
      capture.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      capture.onstop = () => { setClips(previous => [...previous, new Blob(chunks, { type: capture.mimeType })]); setRecording(false); };
      recorder.current = capture; capture.start(); setRecording(true); setError('');
    } catch { setError('This camera could not record. Try another camera or skip practice for now.'); }
  }
  async function openWidget() {
    if (window.desktop) await window.desktop.openWidget();
    else window.open(`${location.pathname}#/widget`, 'silent-calls-widget', 'width=390,height=740');
    setWidgetOpened(true);
  }
  const title = ['A little quieter.\nStill entirely you.', 'Let’s get you\nin the frame.', 'A few words.\nWithout a sound.', 'A voice that\nfeels like you.', 'You’re ready\nto be heard.'][step];
  return <div className="app-shell">
    <aside className="sidebar"><a className="brand" href="#" aria-label="Silent Calls home" onClick={e => {e.preventDefault(); if (!recording) setStep(0);}}><span className="brand-icon"><Waves size={23}/></span>silent calls<span className="brand-period">.</span></a>
      <div className="sidebar-body"><p className="sidebar-intro">A space for your voice.</p><nav aria-label="Setup progress"><ol className="step-list">{steps.map((label, index) => <li key={label} className={index === step ? 'active' : index < step ? 'finished' : ''} aria-current={index === step ? 'step' : undefined}><span className="step-index">{index < step ? <Check size={14}/> : index + 1}</span>{label}{index === step && <ChevronRight size={15}/>}</li>)}</ol></nav></div>
      <div className="sidebar-note"><ShieldCheck size={19}/><p>Camera access is always your choice. Calibration stays in memory until a connected training adapter uploads it.</p></div><span className="version">Cal Hacks 13.0 · Frontend preview</span>
    </aside>
    <main className="onboarding-main"><header className="topbar"><a href="#/audio-setup" className="text-button">Meeting audio setup</a><a href="#/workspace" className="text-button">Training & settings</a><span>{complete ? 'Welcome back' : 'Let’s make this yours'}</span><span>Setup <strong>{step + 1}</strong> / 5</span></header>
      <div className="onboarding-content"><div className="copy-column"><h1>{title}</h1><p className="lead">{[
        'Stay in the conversation, without speaking aloud. Mouth your words. Let your voice take it from there.',
        'A clear view of your face helps capture the words you mouth. Find a comfortable spot with light in front of you.',
        'Mouth each phrase naturally. No need to whisper or exaggerate. These practice clips stay in memory for this session.',
        'Eventually, your words will sound like you. Voice enrollment will connect here when the voice service is ready.',
        'Open your floating companion and explore the meeting flow. It stays close, while your conversation takes the stage.'
      ][step]}</p>
      {step === 0 && <div className="feature-list"><div><span><Monitor size={20}/></span><p><strong>Made for your conversations</strong>A small companion beside your meeting.</p></div><div><span><Volume2 size={20}/></span><p><strong>Your words. Your choice.</strong>Review uncertain phrases before they’re spoken.</p></div><div><span><Mic size={20}/></span><p><strong>Start at your own pace</strong>Camera setup, a little practice, then you’re in.</p></div></div>}
      {step === 1 && <div className="tips"><p><Check size={16}/> Face the camera at eye level</p><p><Check size={16}/> Keep your whole face in view</p><p><Check size={16}/> Put a light in front of you</p></div>}
      {step === 2 && <div className="practice"><span>Phrase {Math.min(clips.length + 1, 3)} of 3</span><blockquote>“{prompts[Math.min(clips.length, 2)]}”</blockquote>{clips.length < 3 ? <button className={`button ${recording ? 'recording' : ''}`} onClick={record} disabled={!stream}>{recording ? 'Stop recording' : 'Record phrase'}</button> : <p className="success"><Check size={17}/> Three practice clips captured</p>}<p className="small">{recording ? 'Mouth the phrase, then stop recording.' : 'Practice capture only. No model or training service connected.'}</p>{error && <p className="error" role="alert">{error}</p>}</div>}
      {step === 3 && <div className="voice-note"><Mic size={25}/><h3>Bring your voice later.</h3><p>You can set up the interface without speaking. Cloning, consent, and an alternative voice option are still to be integrated.</p><span className="status-label">Voice service not connected</span></div>}
      {step === 4 && <div className="ready-details"><p><Check size={17}/> Guided setup explored</p><p><Check size={17}/> {clips.length} practice clips captured this session</p><p><span className="dot amber"/> Real camera capture available in the widget</p><button className="text-button" onClick={() => { localStorage.removeItem('silent-calls:onboarding'); setComplete(false); setStep(0); }}>Run setup again <ArrowRight size={15}/></button></div>}
      </div><div className="visual-column">{step === 0 || step === 4 ? <div className="welcome-visual"><div className="conversation-line">“What do you think?”<span>Someone on your call</span></div><div className="preview-widget"><div className="mini-brand"><Waves size={17}/> silent calls <span className="dot"/></div><div className="waveform" aria-hidden="true">{Array.from({length: 31}, (_, i) => <i key={i} style={{height: `${12 + Math.sin(i * 1.8) ** 2 * (i > 7 && i < 24 ? 46 : 15)}px`}}/>)}</div><p>“That works for me.<br/>Let’s move forward.”</p><div className="mini-bottom"><Volume2 size={15}/> Your voice, in the conversation</div></div><p className="visual-caption">A preview of a quieter way to connect.</p></div> : step === 3 ? <div className="voice-visual"><div className="voice-orbit"><Waves size={74} strokeWidth={1}/></div><p>There’s more than one<br/>way to have a voice.</p><span>No microphone required for this setup</span></div> : <CameraPreview key={step} onStream={setStream}/>}
      </div></div>
      <footer className="onboarding-footer"><button className="text-button" disabled={step === 0 || recording} onClick={() => {setStream(null);setStep(step - 1);}}><ArrowLeft size={16}/> Back</button><span className="footer-hint">{step === 0 ? 'A few small steps. At your pace.' : step === 2 ? 'You can skip practice and return later.' : 'Your settings can be changed later.'}</span><button className="button" disabled={recording} onClick={() => { if (step === 4) { localStorage.setItem('silent-calls:onboarding', 'complete'); setComplete(true); void openWidget(); } else { setStream(null);setStep(step + 1); } }}>{step === 4 ? widgetOpened ? 'Show meeting widget' : 'Open meeting widget' : step === 0 ? 'Let’s get started' : step === 2 && clips.length < 3 ? 'Skip for now' : step === 3 ? 'Continue without voice' : 'Continue'}{step === 4 ? <MoveUpRight size={17}/> : <ArrowRight size={17}/>}</button></footer>
    </main></div>;
}
