import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, ChevronRight, ExternalLink, Headphones, Keyboard, MoveUpRight, ShieldCheck, Volume2, Waves } from 'lucide-react';
import { CameraPreview } from './camera';
import type { SetupStatus } from './desktop';
import { SETUP_PHRASE } from './components/voice-panel';
import { useLocalVoice } from './services/use-local-voice';

const steps = ['Welcome', 'Your camera', 'Meeting audio', 'Your voice', 'Your companion'];
const titles = ['A little quieter.\nStill entirely you.', 'Find your\ncomfortable angle.', 'One small bridge.\nEvery conversation.', 'Let’s hear\nyour voice.', 'Your words.\nWithin reach.'];
const descriptions = [
  'Type a thought. Hear it in your voice, right in your meeting. We’ll guide you through the setup, one small step at a time.',
  'Set your webcam on its stand, close to eye level. Keep your whole face visible with light in front of you. You can also start with typing alone.',
  'A virtual microphone carries your generated voice into your call. You install it once; then choose it in your meeting’s audio settings.',
  'Connect your voice, then send one phrase to your call. Nothing is spoken until you choose to send it.',
  'Your floating companion stays beside the conversation. Type a response, or choose a quick phrase whenever you need it.',
];
function initialStep() {
  if (localStorage.getItem('silent-calls:onboarding') === 'complete') return 4;
  const saved = Number(localStorage.getItem('silent-calls:setup-step:v2') || 0);
  return Number.isInteger(saved) && saved >= 0 && saved <= 4 ? saved : 0;
}

export function Onboarding() {
  const [step, setStep] = useState(initialStep);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [cameraChecked, setCameraChecked] = useState(false);
  const [setup, setSetup] = useState<SetupStatus | null>(null);
  const [driverFound, setDriverFound] = useState(false);
  const [deviceMessage, setDeviceMessage] = useState('');
  const [meeting, setMeeting] = useState('meet');
  const [heard, setHeard] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [voiceId, setVoiceId] = useState('');
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [widgetOpened, setWidgetOpened] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const alive = useRef(true);
  const taskLock = useRef(false);
  const voice = useLocalVoice();
  const windows = (setup?.platform || voice.state.platform) === 'win32';
  const microphone = windows ? 'CABLE Output' : 'BlackHole 2ch';
  const connected = voice.state.connection === 'connected';
  const speaking = voice.state.phase !== 'idle';
  const acknowledged = voice.state.lastSpoken === SETUP_PHRASE;

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);
  useEffect(() => {
    localStorage.setItem('silent-calls:setup-step:v2', String(step));
    heading.current?.focus();
    setNotice(''); setError('');
  }, [step]);
  useEffect(() => {
    let active = true;
    async function refresh() {
      try {
        const next = await window.desktop?.getSetupStatus?.();
        if (active && next) setSetup(next);
      } catch { if (active) setError('Could not read desktop setup. Restart Silent Calls and try again.'); }
    }
    void refresh();
    window.addEventListener('focus', refresh);
    return () => { active = false; window.removeEventListener('focus', refresh); };
  }, []);
  useEffect(() => { if (stream) setCameraChecked(true); }, [stream]);

  async function perform(label: string, task: () => Promise<void>) {
    if (taskLock.current) return;
    taskLock.current = true; setBusy(label); setError(''); setNotice('');
    try { await task(); }
    catch (reason) { if (alive.current) setError(reason instanceof Error ? reason.message : 'Something went wrong. Please try again.'); }
    finally { taskLock.current = false; if (alive.current) setBusy(''); }
  }
  function go(next: number) { setStream(null); setStep(next); }
  function help(topic: 'blackhole' | 'vbcable' | 'cartesia') {
    return perform('Opening…', async () => {
      if (!window.desktop?.openAudioHelp) throw new Error('Open Silent Calls in the desktop app to continue.');
      await window.desktop.openAudioHelp(topic);
    });
  }
  async function detectDriver() {
    // Ask only on this explicit button press. No audio is recorded or retained.
    let permission: MediaStream | null = null;
    try {
      permission = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      if (!alive.current) return;
      const devices = await navigator.mediaDevices.enumerateDevices();
      const found = devices.some(device => device.kind === 'audioinput' && (windows ? /cable output/i : /blackhole.*2ch/i).test(device.label));
      if (alive.current) {
        setDriverFound(found);
        setDeviceMessage(found ? `${microphone} is available. Choose it in your meeting next.` : `${microphone} wasn’t found. Install the driver, reopen Silent Calls if needed, then check again.`);
      }
    } finally { permission?.getTracks().forEach(track => track.stop()); }
  }
  async function connectVoice() {
    if (!window.desktop?.connectSetupVoice) throw new Error('Restart the Electron app to load the updated setup.');
    await window.desktop.connectSetupVoice();
  }
  async function saveVoice() {
    if (!window.desktop?.saveVoiceSetup) throw new Error('Restart the Electron app to load the updated setup.');
    const next = await window.desktop.saveVoiceSetup({ apiKey, voiceId });
    if (alive.current) {
      setSetup(next); setApiKey(''); setVoiceId('');
      setNotice('Voice details saved with system encryption. Existing running services keep their current voice until restarted.');
    }
  }
  async function openWidget() {
    if (!window.desktop) throw new Error('Open the Electron desktop app to use the floating companion.');
    await window.desktop.openWidget();
    if (alive.current) { localStorage.setItem('silent-calls:onboarding', 'complete'); setWidgetOpened(true); }
  }
  const routeInstruction = meeting === 'meet'
    ? `Google Meet → Settings → Audio → Microphone → ${microphone}`
    : meeting === 'zoom' ? `Zoom → Settings → Audio → Microphone → ${microphone}`
      : `FaceTime → Video → Microphone → ${microphone}`;
  const nextLabel = step === 0 ? 'Set up Silent Calls' : step === 1 ? stream ? 'Camera looks good' : 'Continue with typing' : step === 2 ? 'Continue to my voice' : step === 3 ? connected ? 'Continue' : 'Connect my voice' : widgetOpened ? 'Show my companion' : 'Open my companion';
  function next() {
    if (step === 4) { void perform('Opening your companion…', openWidget); return; }
    if (step === 3 && !connected) { void perform('Connecting your voice…', connectVoice); return; }
    go(step + 1);
  }

  return <div className="app-shell guided-setup">
    <aside className="sidebar"><a className="brand" href="#" onClick={event => { event.preventDefault(); if (!busy) go(0); }}><span className="brand-icon"><Waves size={23}/></span>silent calls<span className="brand-period">.</span></a>
      <div className="sidebar-body"><p className="sidebar-intro">Make yourself heard.</p><nav aria-label="Setup progress"><ol className="step-list">{steps.map((label, index) => <li key={label} className={index === step ? 'active' : index < step ? 'finished' : ''} aria-current={index === step ? 'step' : undefined}><span className="step-index">{index < step ? <Check size={14}/> : index + 1}</span>{label}{index === step && <ChevronRight size={15}/>}</li>)}</ol></nav></div>
      <div className="sidebar-note"><ShieldCheck size={19}/><p>Your camera is optional. Only text you choose to speak is sent to the voice provider. You stay in control.</p></div><span className="version">Silent Calls · Desktop setup</span>
    </aside>
    <main className="onboarding-main"><header className="topbar"><span>Let’s make this yours</span><a href="#/workspace" className="text-button">Training & settings</a><span>Step <strong>{step + 1}</strong> of 5</span></header>
      <div className="onboarding-content"><div className="copy-column"><h1 ref={heading} tabIndex={-1}>{titles[step]}</h1><p className="lead">{descriptions[step]}</p>
        {step === 0 && <div className="setup-overview"><p><Check size={17}/><span>Use the webcam you already have</span></p><p><Check size={17}/><span>Bring your voice into Zoom, Meet or FaceTime</span></p><p><Check size={17}/><span>Speak only when you choose</span></p><p className="small">Typed speech is available now. Lip-reading will connect when the model service is ready.</p></div>}
        {step === 1 && <div className="setup-overview"><p><Check size={17}/>Camera near eye level</p><p><Check size={17}/>Whole face in the guide</p><p><Check size={17}/>Light in front, not behind</p><p className="small">This preview stays on your computer. Enrollment and practice are available later in Training & settings.</p></div>}
        {step === 2 && <div className="setup-audio-copy"><h2>{driverFound ? 'Your audio bridge is available.' : windows ? 'Install VB-Cable once.' : 'Install BlackHole 2ch once.'}</h2><p>Follow the official installer and accept its system prompts. Reopen your calling app afterwards.</p><button className="text-button" disabled={!!busy} onClick={() => void help(windows ? 'vbcable' : 'blackhole')}>Open {windows ? 'VB-Cable' : 'BlackHole'} installer <ExternalLink size={14}/></button><button className="button setup-secondary" disabled={!!busy} onClick={() => void perform('Checking audio device…', detectDriver)}>{driverFound ? 'Check again' : 'Check audio device'}</button><p className="small" role="status">{deviceMessage || 'Checking asks for temporary microphone access to identify audio devices. No audio is saved.'}</p></div>}
        {step === 3 && <div className="setup-voice-copy"><div className="setup-live-status" role="status"><span className={`dot ${connected ? '' : 'amber'}`}/>{connected ? 'Voice service connected' : busy || 'Let’s connect your voice'}</div><p className="small">We’ll use your existing setup and try to start the installed voice service for you. Your text is synthesized by Cartesia.</p><details className="setup-details"><summary>{setup?.credentialsSaved ? 'Update saved voice details' : 'First time? Add your voice details'}</summary><p>Your Cartesia key and voice ID are encrypted on this computer, outside the project. They are never saved in browser storage.</p><label htmlFor="setup-key">Cartesia API key</label><input id="setup-key" type="password" autoComplete="off" spellCheck={false} value={apiKey} onChange={event => setApiKey(event.target.value)} maxLength={512}/><label htmlFor="setup-voice">Voice ID</label><input id="setup-voice" autoComplete="off" spellCheck={false} value={voiceId} onChange={event => setVoiceId(event.target.value)} maxLength={128}/><button className="button" disabled={!!busy || !apiKey.trim() || !voiceId.trim()} onClick={() => void perform('Saving voice details…', saveVoice)}>Save voice details</button><button className="text-button" disabled={!!busy} onClick={() => void help('cartesia')}>Create or choose a voice in Cartesia <ExternalLink size={13}/></button></details><details className="setup-details"><summary>Advanced setup & troubleshooting</summary><p>{setup?.canStartService ? 'The installed Python service can be started from this app.' : 'The Python runtime is not bundled with the desktop installer yet. Install the repository’s Python dependencies or start the service separately.'} Existing .env configuration still works. For a custom port or manual setup, use the audio guide.</p><a className="text-button" href="#/audio-setup">Open detailed audio setup <ArrowRight size={14}/></a></details></div>}
        {step === 4 && <div className="setup-summary"><h2>Your setup at a glance</h2>{[[cameraChecked ? 'Camera checked this session' : 'Camera optional · type to speak', cameraChecked], [connected ? 'Voice service connected' : 'Voice service not connected', connected], [heard ? 'Meeting audio confirmed by you' : 'Meeting audio still needs confirmation', heard]].map(([label, ready]) => <p key={String(label)}><span className={`dot ${ready ? '' : 'amber'}`}/>{label}</p>)}<p className="small">Lip-reading and model training are separate. You can already use typed speech and quick phrases with your voice connected.</p><button className="text-button" disabled={!!busy} onClick={() => go(2)}>Revisit audio setup <ArrowRight size={14}/></button><button className="text-button" disabled={!!busy} onClick={() => { localStorage.removeItem('silent-calls:onboarding'); go(0); }}>Run setup again</button></div>}
        {(error || voice.error) && <p className="error" role="alert">{error || voice.error}</p>}{notice && <p className="small" role="status">{notice}</p>}
      </div><div className="visual-column">
        {step === 0 && <div className="setup-introduction"><div className="setup-example-label">Your next conversation</div><div className="setup-example"><div className="mini-brand"><Waves size={18}/> silent calls.</div><p>“I have something<br/>to add.”</p><div className="setup-example-input"><span>You type it.</span><ArrowRight size={17}/><Volume2 size={20}/><span>Your voice says it.</span></div></div><p className="visual-caption">An illustration of typed speech. Nothing is being sent.</p></div>}
        {step === 1 && <CameraPreview onStream={setStream}/>}
        {step === 2 && <section className="setup-routing"><Headphones size={28} strokeWidth={1.5}/><h2>Choose your meeting app.</h2><div className="meeting-apps" role="group" aria-label="Calling app">{[['meet','Google Meet'],['zoom','Zoom'], ...(!windows ? [['facetime','FaceTime']] : [])].map(([value,label]) => <button key={value} aria-pressed={meeting === value} onClick={() => setMeeting(value)}>{label}</button>)}</div><p className="setup-route-instruction">{routeInstruction}</p><div className="setup-device-line"><span>Silent Calls</span><ArrowRight size={18}/><strong>{microphone}</strong></div><p>Keep your meeting unmuted. Leave its speakers on your headphones or normal speakers.</p><p className="small">We can detect the device, but the microphone choice inside your meeting app needs your click.</p></section>}
        {step === 3 && <section className="setup-first-phrase"><Volume2 size={30} strokeWidth={1.5}/><h2>A familiar voice.<br/>A new way to speak.</h2><blockquote>“{SETUP_PHRASE}”</blockquote><button className="button" disabled={!connected || speaking || !!busy} onClick={() => { setHeard(false); void voice.speak(SETUP_PHRASE); }}>{speaking ? 'Waiting for voice service…' : 'Send this phrase to my meeting'}<Volume2 size={16}/></button><p className="small" role="status">{voice.state.message}</p>{acknowledged && <p className="success"><Check size={15}/>Phrase acknowledged by the service</p>}<label className="consent"><input type="checkbox" checked={heard} disabled={!acknowledged || speaking || !connected} onChange={event => setHeard(event.target.checked)}/>Someone in my call heard it, or I saw the meeting microphone meter respond.</label><p className="small">You may not hear yourself locally. The phrase goes into the meeting microphone.</p></section>}
        {step === 4 && <section className="setup-finish"><div className="mini-brand"><Waves size={21}/> silent calls.</div><h2>Stay in<br/>the conversation.</h2><p>Type your words. Choose a quick phrase.<br/>Keep the conversation moving.</p><div className="setup-shortcut"><Keyboard size={20}/><span><strong>For mouthed capture, next</strong>Enable the camera and global key in the widget. Hold F8 while your meeting is focused.</span></div>{setup?.platform === 'darwin' && !setup.keyboardAllowed && <button className="text-button" disabled={!!busy} onClick={() => void perform('Opening permissions…', async () => { await window.desktop?.openSetupKeyboardSettings(); })}>Allow keyboard access in System Settings <ExternalLink size={13}/></button>}<p className="small">Keyboard access is optional for typed speech. The widget requests the native hook only when you enable it.</p></section>}
      </div></div>
      <footer className="onboarding-footer"><button className="text-button" disabled={step === 0 || !!busy} onClick={() => go(step - 1)}><ArrowLeft size={16}/> Back</button><span className="footer-hint">{step === 0 ? 'A few small steps. Always at your pace.' : step === 3 && !connected ? <button className="text-button" disabled={!!busy} onClick={() => go(4)}>Set up voice later</button> : 'You can change these settings later.'}</span><button className="button" disabled={!!busy} onClick={next}>{busy || nextLabel}{step === 4 ? <MoveUpRight size={17}/> : <ArrowRight size={17}/>}</button></footer>
    </main>
  </div>;
}
