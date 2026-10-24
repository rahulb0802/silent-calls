import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, ChevronRight, ExternalLink, Headphones, Keyboard, MoveUpRight, ShieldCheck, Volume2, Waves } from 'lucide-react';
import { CameraPreview } from './camera';
import type { SetupStatus } from './desktop';
import { useLocalVoice } from './services/use-local-voice';
import { voiceSampleWav } from './services/voice-sample';
import {CalibrationFlow} from './components/calibration-flow';
import {loadSettings,saveSettings} from './services/settings';

const steps = ['Welcome', 'Your camera', 'Meeting audio', 'Your voice', 'Learn your words', 'Your companion'];
const titles = ['A little quieter.\nStill entirely you.', 'Find your\ncomfortable angle.', 'One small bridge.\nEvery conversation.', 'Let’s hear\nyour voice.', 'A little practice.\nMore like you.', 'Your words.\nWithin reach.'];
const descriptions = [
  'Connect your devices, make your voice, and teach Silent Calls how you mouth words. We’ll take it one step at a time.',
  'Set your webcam close to eye level. Keep your whole face visible with light in front of you. You’ll use this camera to personalize your lip-reading.',
  'A virtual microphone carries your generated voice into your call. Install it once, then choose it in your meeting’s audio settings.',
  'Record or choose a short sample to create your voice, then continue to your personal calibration.',
  'Record 30–60 short sentences. We’ll learn your mouth movements and get everything ready for your calls.',
  'Your personal calibration is ready. Your floating companion stays beside the conversation, using this profile when you mouth a phrase.',
];

export function Onboarding() {
  const [step, setStep] = useState(0);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [cameraChecked, setCameraChecked] = useState(false);
  const [settings,setSettings]=useState(loadSettings);
  const [calibrationLocked,setCalibrationLocked]=useState(false);
  const [calibrationDone,setCalibrationDone]=useState(false);
  const [routingConfirmed, setRoutingConfirmed] = useState(false);
  const [setup, setSetup] = useState<SetupStatus | null>(null);
  const [driverFound, setDriverFound] = useState(false);
  const [deviceMessage, setDeviceMessage] = useState('');
  const [meeting, setMeeting] = useState('meet');
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [widgetOpened, setWidgetOpened] = useState(false);
  const [sample, setSample] = useState<Blob | null>(null);
  const [sampleUrl, setSampleUrl] = useState('');
  const [recordingVoice, setRecordingVoice] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [recordingInput, setRecordingInput] = useState('');
  const voiceClock = useRef<ReturnType<typeof setInterval> | null>(null);
  const captureEpoch = useRef(0);
  const [voiceName, setVoiceName] = useState('My voice');
  const [voiceConsent, setVoiceConsent] = useState(false);
  const voiceRecorder = useRef<MediaRecorder | null>(null);
  const voiceStream = useRef<MediaStream | null>(null);
  const voiceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const alive = useRef(true);
  const taskLock = useRef(false);
  const autoConnectAttempted = useRef(false);
  const voice = useLocalVoice();
  const windows = (setup?.platform || voice.state.platform) === 'win32';
  const microphone = windows ? 'CABLE Output' : 'BlackHole 2ch';
  const connected = voice.state.connection === 'connected';
  const speaking = voice.state.phase !== 'idle';

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; captureEpoch.current++; stopVoiceCapture(); };
  }, []);
  useEffect(() => {
    if (!sample) { setSampleUrl(''); return; }
    const url = URL.createObjectURL(sample);
    setSampleUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [sample]);
  useEffect(() => {
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
  useEffect(() => {
    if (step !== 3) { autoConnectAttempted.current = false; return; }
    if (autoConnectAttempted.current) return;
    autoConnectAttempted.current = true;
    void perform('Connecting your voice…', connectVoice);
    // One attempt per visit; manual retry remains available after a failure.
    // StrictMode and repeated renders must not spawn duplicate services.
  }, [step]);

  async function perform(label: string, task: () => Promise<void>) {
    if (taskLock.current) return;
    taskLock.current = true; setBusy(label); setError(''); setNotice('');
    try { await task(); }
    catch (reason) { if (alive.current) setError(reason instanceof Error ? reason.message.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '') : 'Something went wrong. Please try again.'); }
    finally { taskLock.current = false; if (alive.current) setBusy(''); }
  }
  function stopVoiceCapture() {
    if (voiceTimer.current) clearTimeout(voiceTimer.current);
    if (voiceClock.current) clearInterval(voiceClock.current);
    voiceTimer.current = null;
    voiceClock.current = null;
    const recorder = voiceRecorder.current;
    if (recorder && recorder.state !== 'inactive') recorder.stop();
    voiceStream.current?.getTracks().forEach(track => track.stop());
    voiceStream.current = null;
  }
  async function recordVoice() {
    if (voiceRecorder.current) return;
    if (typeof MediaRecorder === 'undefined') throw new Error('Microphone recording is unavailable. Choose an existing recording instead.');
    const epoch = ++captureEpoch.current;
    let media: MediaStream | null = null;
    try {
      media = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }, video: false });
      if (!alive.current || epoch !== captureEpoch.current) { media.getTracks().forEach(track => track.stop()); return; }
      // A virtual meeting microphone contains generated speech, not the user's voice.
      if (/blackhole|cable (input|output)|vb-audio/i.test(media.getAudioTracks()[0]?.label || '')) {
        media.getTracks().forEach(track => track.stop());
        const inputs = await navigator.mediaDevices.enumerateDevices();
        const physical = inputs.find(device => device.kind === 'audioinput' && device.deviceId !== 'default' && !/blackhole|cable (input|output)|vb-audio/i.test(device.label));
        if (!physical) throw new Error('Choose a built-in or USB microphone as your system input, then record again. BlackHole/VB-Cable cannot record your voice.');
        media = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: { exact: physical.deviceId }, echoCancellation: false, noiseSuppression: false, autoGainControl: false }, video: false });
      }
      if (!alive.current || epoch !== captureEpoch.current) { media.getTracks().forEach(track => track.stop()); return; }
      const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find(type => MediaRecorder.isTypeSupported(type));
      if (!mime) throw new Error('No supported audio recorder was found. Choose an existing recording instead.');
      const stream = media;
      const recorder = new MediaRecorder(stream, { mimeType: mime });
      const chunks: Blob[] = [];
      let failed = false;
      let bytes = 0;
      voiceStream.current = stream;
      voiceRecorder.current = recorder;
      recorder.ondataavailable = event => {
        bytes += event.data.size;
        if (bytes > 10 * 1024 * 1024) {
          failed = true; stopVoiceCapture();
          if (alive.current) setError('Recording exceeded 10 MB. Please record a shorter sample.');
        } else if (event.data.size) chunks.push(event.data);
      };
      recorder.onerror = () => {
        failed = true; stopVoiceCapture();
        if (alive.current) setError('Microphone recording stopped unexpectedly. Check your microphone and try again.');
      };
      recorder.onstop = () => {
        stream.getTracks().forEach(track => track.stop());
        if (voiceTimer.current) clearTimeout(voiceTimer.current);
        if (voiceClock.current) clearInterval(voiceClock.current);
        voiceTimer.current = null; voiceClock.current = null;
        voiceStream.current = null; voiceRecorder.current = null;
        if (alive.current) setRecordingVoice(false);
        if (!alive.current || epoch !== captureEpoch.current || failed) return;
        const clip = new Blob(chunks, { type: mime });
        if (!clip.size) { setError('The microphone returned no audio. Record again or choose a file.'); return; }
        setSample(clip); setVoiceConsent(false);
      };
      recorder.start(250);
      setSample(null); setVoiceConsent(false); setRecordingSeconds(0);
      setRecordingInput(stream.getAudioTracks()[0]?.label || 'Microphone');
      setRecordingVoice(true);
      const started = performance.now();
      voiceClock.current = setInterval(() => setRecordingSeconds(Math.min(15, Math.floor((performance.now() - started) / 1000))), 250);
      voiceTimer.current = setTimeout(stopVoiceCapture, 15000);
    } catch (reason) {
      media?.getTracks().forEach(track => track.stop());
      voiceStream.current = null; voiceRecorder.current = null;
      if (reason instanceof DOMException && reason.name === 'NotAllowedError') throw new Error('Microphone access was denied. Allow Electron in System Settings → Privacy & Security → Microphone, then restart the app. You can also choose a recording.');
      if (reason instanceof DOMException && reason.name === 'NotFoundError') throw new Error('No microphone was found. Connect a microphone or choose an existing voice recording.');
      throw reason;
    }
  }
  async function createVoice() {
    if (!sample || !voiceConsent || !window.desktop?.cloneVoice) throw new Error('Review your sample and agree to upload it first.');
    const wav = await voiceSampleWav(sample);
    await window.desktop.cloneVoice(wav,voiceName);
    if (alive.current) { setSample(null); setVoiceConsent(false); setNotice('Your personal voice is ready. Continue to teach Silent Calls your mouth movements.'); }
  }
  function go(next: number) { captureEpoch.current++; stopVoiceCapture(); setStream(null); setStep(next); }
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
  async function openWidget() {
    if (!window.desktop) throw new Error('Open the Electron desktop app to use the floating companion.');
    await window.desktop.openWidget();
    if (alive.current) { localStorage.setItem('silent-calls:onboarding', 'complete'); setWidgetOpened(true); }
  }
  const routeInstruction = meeting === 'meet'
    ? `Google Meet → Settings → Audio → Microphone → ${microphone}`
    : meeting === 'zoom' ? `Zoom → Settings → Audio → Microphone → ${microphone}`
      : `FaceTime → Video → Microphone → ${microphone}`;
  const canContinue = step === 0 && Boolean(settings.profileId.trim()) || step === 1 && cameraChecked || step === 2 && driverFound && routingConfirmed || step === 3 && connected && voice.state.hasVoice && !speaking || step === 5 && calibrationDone;
  const stepHint = step === 1 ? 'Enable your camera to continue.' : step === 2 ? 'Check the audio device and confirm your meeting microphone.' : step === 3 ? 'Connect or create your voice to continue.' : 'You can change these settings later.';
  const nextLabel = step === 0 ? 'Set up Silent Calls' : step === 1 ? 'Camera looks good' : step === 2 ? 'Continue to my voice' : step === 3 ? connected ? 'Continue' : 'Retry connection' : widgetOpened ? 'Show my companion' : 'Open my companion';
  function next() {
    if (!canContinue) return;
    if(step===0){try{const nextSettings={...settings,profileId:settings.profileId.trim()};if(nextSettings.profileId.length>80)throw new Error('Choose a profile name up to 80 characters.');saveSettings(nextSettings);setSettings(nextSettings);}catch(reason){setError(reason instanceof Error?reason.message:'Could not save your profile.');return;}}
    if (step === 5) { void perform('Opening your companion…', openWidget); return; }
    go(step + 1);
  }

  return <div className="app-shell guided-setup">
    <aside className="sidebar"><a className="brand" href="#" onClick={event => { event.preventDefault(); if (!busy && !recordingVoice && !calibrationLocked) go(0); }}><span className="brand-icon"><Waves size={23}/></span>silent calls<span className="brand-period">.</span></a>
      <div className="sidebar-body"><p className="sidebar-intro">Make yourself heard.</p><nav aria-label="Setup progress"><ol className="step-list">{steps.map((label, index) => <li key={label} className={index === step ? 'active' : index < step ? 'finished' : ''} aria-current={index === step ? 'step' : undefined}><span className="step-index">{index < step ? <Check size={14}/> : index + 1}</span>{label}{index === step && <ChevronRight size={15}/>}</li>)}</ol></nav></div>
      <div className="sidebar-note"><ShieldCheck size={19}/><p>Recordings are shared only after your consent. Your voice goes to Cartesia; your mouth movements personalize your lip-reading.</p></div><span className="version">Silent Calls · Desktop setup</span>
    </aside>
    <main className="onboarding-main"><header className="topbar"><span>Let’s make this yours</span>{!busy && !recordingVoice && !calibrationLocked && <a href="#/workspace" className="text-button">Training & settings</a>}<span>Step <strong>{step + 1}</strong> of {steps.length}</span></header>
      <div className={`onboarding-content ${step===4?'calibration-step':step===3?'voice-step':''}`}><div className="copy-column"><h1 ref={heading} tabIndex={-1}>{titles[step]}</h1><p className="lead">{descriptions[step]}</p>
        {step === 0 && <div className="setup-overview"><p><Check size={17}/><span>Use the webcam you already have</span></p><p><Check size={17}/><span>Bring your voice into Zoom, Meet or FaceTime</span></p><p><Check size={17}/><span>Speak only when you choose</span></p><label className="setup-profile-label" htmlFor="setup-profile">Your profile name</label><input id="setup-profile" className="setup-profile-input" maxLength={80} value={settings.profileId} onChange={event=>{setSettings({...settings,profileId:event.target.value});setCalibrationDone(false);}}/><p className="small">Use your own profile. Each person needs their own mouth-movement calibration. Saved sentences resume when you use this name again.</p></div>}
        {step === 1 && <div className="setup-overview"><p><Check size={17}/>Camera near eye level</p><p><Check size={17}/>Whole face in the guide</p><p><Check size={17}/>Light in front, not behind</p><p className="small">This preview stays on your computer. Keep this framing for the sentence practice later in setup.</p></div>}
        {step === 2 && <div className="setup-audio-copy"><h2>{driverFound ? 'Your audio bridge is available.' : windows ? 'Install VB-Cable once.' : 'Install BlackHole 2ch once.'}</h2><p>Follow the official installer and accept its system prompts. Reopen your calling app afterwards.</p><button className="text-button" disabled={!!busy} onClick={() => void help(windows ? 'vbcable' : 'blackhole')}>Open {windows ? 'VB-Cable' : 'BlackHole'} installer <ExternalLink size={14}/></button><button className="button setup-secondary" disabled={!!busy} onClick={() => void perform('Checking audio device…', detectDriver)}>{driverFound ? 'Check again' : 'Check audio device'}</button><p className="small" role="status">{deviceMessage || 'Checking asks for temporary microphone access to identify audio devices. No audio is saved.'}</p></div>}
        {step === 3 && <div className="setup-voice-copy"><div className="setup-live-status" role="status"><span className={`dot ${connected ? '' : 'amber'}`}/>{connected ? 'Voice service connected' : busy || 'Let’s connect your voice'}</div><p className="small">{voice.state.personalVoiceReady ? `Personal voice ready: ${voice.state.voiceName}` : voice.state.hasVoice ? 'Your configured voice is ready. Continue, or create a new personal voice below.' : 'Create your voice to continue. Your recording stays on this computer until you choose Create my voice.'}</p><>{!connected && <button className="button setup-secondary" disabled={!!busy || recordingVoice || calibrationLocked} onClick={() => void perform('Connecting your voice…', connectVoice)}>Retry voice connection</button>}</><div className="voice-enrollment"><h2>Create your voice</h2><p className="small">Read the sentences below in your usual meeting voice, at a comfortable pace. Aim for 10–15 seconds in a quiet room. If you cannot speak now, choose an existing recording of your voice instead.</p><div className="voice-reading-prompt"><h3>Read this aloud</h3><blockquote>Hi, thanks for joining me today. I have a quick question about the project. That sounds good to me. Let’s talk through the next steps together.</blockquote><p className="small">Sound like yourself. Keep your normal accent, pitch and energy. Avoid whispering, exaggerated pronunciation, music and long pauses. Stop after the last sentence; the recording ends automatically at 15 seconds.</p></div><button className="button" disabled={!!busy || speaking || !connected} onClick={() => recordingVoice ? stopVoiceCapture() : void perform('Opening microphone…',recordVoice)}>{recordingVoice ? 'Stop recording' : 'Record my voice'}</button>{recordingVoice && <p className="voice-recording-status" role="status"><span className="dot"/>Recording · {recordingSeconds} / 15 s<span>{recordingInput}</span></p>}<label className="small" htmlFor="voice-sample-file">Or choose an existing recording</label><input id="voice-sample-file" type="file" accept="audio/*,.wav,.mp3,.m4a,.webm" disabled={recordingVoice || !!busy} onChange={event=>{const file=event.target.files?.[0];if(file){if(file.size === 0 || file.size > 10 * 1024 * 1024){setError('Choose a nonempty audio file smaller than 10 MB.');}else{setSample(file);setVoiceConsent(false);setError('');}}event.currentTarget.value='';}}/>{sample && <div className="voice-sample-review"><audio controls src={sampleUrl} aria-label="Review your voice sample"/><p className="small">Listen before creating your voice. This sample is not saved by Silent Calls.</p><button className="text-button" disabled={!!busy} onClick={()=>{setSample(null);setVoiceConsent(false);}}>Discard sample</button></div>}<label className="consent"><input type="checkbox" checked={voiceConsent} disabled={!sample || !!busy} onChange={event=>setVoiceConsent(event.target.checked)}/>This is my voice or a recording I have permission to use. I agree to send this sample to Cartesia to create my voice.</label><label htmlFor="personal-voice-name">Voice name</label><input id="personal-voice-name" disabled={!!busy || recordingVoice || calibrationLocked} maxLength={80} value={voiceName} onChange={event=>setVoiceName(event.target.value)}/><button className="button" disabled={!connected || !sample || !voiceConsent || !!busy || speaking || recordingVoice || !voiceName.trim()} onClick={()=>void perform('Creating your voice…',createVoice)}>Create my voice</button></div><details className="setup-details"><summary>Advanced setup & troubleshooting</summary><button className="text-button" disabled={!!busy || recordingVoice || calibrationLocked || voice.state.phase === 'cloning' || voice.state.phase === 'waiting'} onClick={() => void perform('Checking voice status…', async () => { await voice.disconnect(); await connectVoice(); })}>Reconnect and check voice status</button><p>{setup?.canStartService ? 'The installed Python service can be started from this app.' : 'The Python runtime is not bundled with the desktop installer yet. Install the repository’s Python dependencies or start the service separately.'} The service uses the developer’s Cartesia key, kept in Python. If connection fails, check the service and audio driver.</p><a className="text-button" href="#/audio-setup">Open detailed audio setup <ArrowRight size={14}/></a></details></div>}
        {step === 4 && <CalibrationFlow settings={settings} onLockChange={setCalibrationLocked} onComplete={()=>{setCalibrationDone(true);go(5);}}/>}
        {step === 5 && <div className="setup-summary"><h2>Your setup at a glance</h2>{[[cameraChecked ? 'Camera checked this session' : 'Camera needs checking', cameraChecked], [connected ? 'Voice service connected' : 'Voice service not connected', connected], [routingConfirmed ? 'Meeting microphone selected by you' : 'Meeting microphone needs selecting', routingConfirmed], [calibrationDone ? 'Personal calibration ready' : 'Calibration needed',calibrationDone]].map(([label, ready]) => <p key={String(label)}><span className={`dot ${ready ? '' : 'amber'}`}/>{label}</p>)}<p className="small">Your personal lip-reading calibration is saved for {settings.profileId}. The widget uses this same profile. Keep your camera framing similar to practice.</p><button className="text-button" disabled={!!busy} onClick={() => go(2)}>Revisit audio setup <ArrowRight size={14}/></button><button className="text-button" disabled={!!busy} onClick={() => { localStorage.removeItem('silent-calls:onboarding'); setCameraChecked(false);  setDriverFound(false); setRoutingConfirmed(false); setCalibrationDone(false); go(0); }}>Run setup again</button></div>}
        {(error || voice.error) && <p className="error" role="alert">{error || voice.error}</p>}{notice && <p className="small" role="status">{notice}</p>}
      </div><div className="visual-column">
        {step === 0 && <div className="setup-introduction"><div className="setup-example-label">Your next conversation</div><div className="setup-example"><div className="mini-brand"><Waves size={18}/> silent calls.</div><p>“I have something<br/>to add.”</p><div className="setup-example-input"><span>You type it.</span><ArrowRight size={17}/><Volume2 size={20}/><span>Your voice says it.</span></div></div><p className="visual-caption">An illustration of typed speech. Nothing is being sent.</p></div>}
        {step === 1 && <CameraPreview onStream={setStream}/>}
        {step === 2 && <section className="setup-routing"><Headphones size={28} strokeWidth={1.5}/><h2>Choose your meeting app.</h2><div className="meeting-apps" role="group" aria-label="Calling app">{[['meet','Google Meet'],['zoom','Zoom'], ...(!windows ? [['facetime','FaceTime']] : [])].map(([value,label]) => <button key={value} aria-pressed={meeting === value} onClick={() => { setMeeting(value); setRoutingConfirmed(false); }}>{label}</button>)}</div><p className="setup-route-instruction">{routeInstruction}</p><div className="setup-device-line"><span>Silent Calls</span><ArrowRight size={18}/><strong>{microphone}</strong></div><p>Keep your meeting unmuted. Leave its speakers on your headphones or normal speakers.</p><p className="small">We can detect the device, but the microphone choice inside your meeting app needs your click.</p><label className="consent setup-routing-confirm"><input type="checkbox" checked={routingConfirmed} disabled={!driverFound} onChange={event => setRoutingConfirmed(event.target.checked)}/>I selected {microphone} as my meeting microphone and left it unmuted.</label></section>}
        {step === 5 && <section className="setup-finish"><div className="mini-brand"><Waves size={21}/> silent calls.</div><h2>Stay in<br/>the conversation.</h2><p>Mouth your words. Choose what to say.<br/>Stay part of the conversation.</p><div className="setup-shortcut"><Keyboard size={20}/><span><strong>Your personal model is ready</strong>Enable the camera and global key in the widget. Hold T while your meeting is focused.</span></div>{setup?.platform === 'darwin' && !setup.keyboardAllowed && <button className="text-button" disabled={!!busy} onClick={() => void perform('Opening permissions…', async () => { await window.desktop?.openSetupKeyboardSettings(); })}>Allow keyboard access in System Settings <ExternalLink size={13}/></button>}<p className="small">Keyboard access is optional for typed speech. The widget requests the native hook only when you enable it.</p></section>}
      </div></div>
      <footer className="onboarding-footer"><button className="text-button" disabled={step === 0 || !!busy || recordingVoice || calibrationLocked} onClick={() => go(step - 1)}><ArrowLeft size={16}/> Back</button><span className="footer-hint">{step===4?'Your saved sentences stay with your profile.':step === 0 ? 'A few small steps. Always at your pace.' : stepHint}</span>{step!==4 && <button className="button" disabled={!!busy || recordingVoice || calibrationLocked || !canContinue} onClick={next}>{busy || nextLabel}{step === 5 ? <MoveUpRight size={17}/> : <ArrowRight size={17}/>}</button>}</footer>
    </main>
  </div>;
}
