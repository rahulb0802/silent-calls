import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, ExternalLink, Headphones, Waves } from 'lucide-react';
import { VoicePanel } from './components/voice-panel';
import { useLocalVoice } from './services/use-local-voice';

type MeetingApp = 'zoom' | 'meet' | 'facetime' | 'other';
const apps: { id: MeetingApp; label: string }[] = [
  { id: 'zoom', label: 'Zoom' }, { id: 'meet', label: 'Google Meet' },
  { id: 'facetime', label: 'FaceTime' }, { id: 'other', label: 'Other apps' },
];
const START_COMMAND = '.venv/bin/python -m silentcalls.app';

export function AudioSetup() {
  const voice = useLocalVoice();
  const [platform, setPlatform] = useState<'mac' | 'windows'>('mac');
  const [meeting, setMeeting] = useState<MeetingApp>('zoom');
  const [notice, setNotice] = useState('');
  const [heard, setHeard] = useState(false);
  useEffect(() => { if (voice.state.platform === 'win32') setPlatform('windows'); }, [voice.state.platform]);
  const mac = platform === 'mac';
  const driver = mac ? 'BlackHole 2ch' : 'VB-Cable';
  const output = mac ? 'BlackHole 2ch' : 'CABLE Input';
  const microphone = mac ? 'BlackHole 2ch' : 'CABLE Output';
  const command = mac ? START_COMMAND : '.venv\\Scripts\\python -m silentcalls.app';
  const environment = `CARTESIA_API_KEY=<your key>\nCARTESIA_VOICE_ID=<your cloned voice ID>\nVIRTUAL_MIC_DEVICE=${output}`;

  async function copy(value: string) {
    try { await navigator.clipboard.writeText(value); setNotice('Copied.'); }
    catch { setNotice('Could not copy automatically. Select the command and copy it manually.'); }
  }
  async function help(topic: 'blackhole' | 'vbcable' | 'zoom' | 'meet' | 'facetime') {
    try {
      if (!window.desktop) { setNotice('Open the desktop app to launch setup documentation.'); return; }
      await window.desktop.openAudioHelp(topic);
    } catch { setNotice('Could not open the documentation. See docs/TYPED_SPEECH.md in the repository.'); }
  }
  const appInstruction = meeting === 'zoom'
    ? `In Zoom, open Settings → Audio and set Microphone to ${microphone}. Leave Speaker on your headphones or normal speakers.`
    : meeting === 'meet'
      ? `In Google Meet, open Settings → Audio and set Microphone to ${microphone}. Allow microphone access in the browser. Keep Speaker on your headphones or normal speakers.`
      : meeting === 'facetime'
        ? `On Mac, open FaceTime’s Video menu and choose ${microphone} in the Microphone section. Keep audio output on your headphones or speakers.`
        : `In the calling app’s audio settings, choose ${microphone} as its microphone. Keep its speaker output on your normal listening device.`;

  return <main className="workspace audio-setup">
    <header className="workspace-header"><a href="#/onboarding"><ArrowLeft size={16}/> Back to setup</a><span><Waves size={20}/> silent calls.</span><a className="text-button" href="#/workspace">My Silent Calls</a><button className="button" disabled={!window.desktop} onClick={() => window.desktop?.openWidget()}>Open meeting widget</button></header>
    <div className="workspace-heading"><h1>Your voice, in the call.</h1><p>Set up audio once, then type a response or use a quick phrase. Your meeting receives it through a virtual microphone, even while lip-reading is still training.</p></div>
    <div className="audio-platform" role="group" aria-label="Computer platform"><button aria-pressed={mac} onClick={() => { setPlatform('mac'); setHeard(false); }}>Mac · BlackHole</button><button aria-pressed={!mac} onClick={() => { setPlatform('windows'); setHeard(false); if (meeting === 'facetime') setMeeting('zoom'); }}>Windows · VB-Cable</button></div>
    <div className="audio-route" aria-label="Audio route"><span>Silent Calls voice service</span><ArrowRight size={17}/><strong>{output}</strong><ArrowRight size={17}/><span>Meeting microphone{!mac ? ': CABLE Output' : ''}</span></div>
    <div className="audio-setup-grid"><div className="audio-steps">
      <section><h2>1. Install {driver}</h2><p>{mac ? 'Install BlackHole 2ch from its official website. Reopen your meeting app after installation; follow any restart instructions from the installer.' : 'Install VB-Cable using its official Windows installer. Reopen your meeting app after installation and follow the installer’s restart instructions.'}</p><button className="text-button" onClick={() => void help(mac ? 'blackhole' : 'vbcable')}>Open official installer page <ExternalLink size={14}/></button><p className="small">This screen does not install a driver or change your system audio automatically.</p></section>
      <section><h2>2. Start the local voice service</h2><p>In the repository root, configure your own Cartesia key and cloned voice ID in <code>.env</code>, then select the virtual device as the service’s output.</p><pre>{environment}</pre><p>With the Python dependencies already installed, run this in a separate terminal from the repository root:</p><pre>{command}</pre><button className="text-button" onClick={() => void copy(command)}>Copy startup command</button><p className="small">Keep this terminal running. Call captions record what your speakers play (Windows) or BlackHole 16ch (Mac); Jev and Claude run when TYPESAFE_API_KEY and ANTHROPIC_API_KEY are set in .env. Device and voice configuration are read when the service starts; restart it after editing .env. Run with voice enabled, without <code>--no-voice</code>.</p></section>
      <section><h2>3. Select the meeting microphone</h2><div className="meeting-apps" role="group" aria-label="Calling app">{apps.map(app => <button key={app.id} aria-pressed={meeting === app.id} disabled={!mac && app.id === 'facetime'} onClick={() => { setMeeting(app.id); setHeard(false); }}>{app.label}</button>)}</div><p>{appInstruction}</p>{meeting !== 'other' && <button className="text-button" onClick={() => void help(meeting as 'zoom' | 'meet' | 'facetime')}>Open {apps.find(app => app.id === meeting)?.label} audio instructions <ExternalLink size={14}/></button>}<div className="audio-listening"><Headphones size={19}/><p>Use headphones to hear the other person. Leave the meeting microphone unmuted when sending a phrase. You may not hear your own generated voice locally—that is expected when it goes directly to the virtual microphone.</p></div><p className="small">Incoming-call captions need a separate loopback audio path. Keep them off for this first voice setup to avoid routing the generated voice back into transcription.</p></section>
      <section><h2>4. Confirm it reaches the call</h2><p>Connect on the right, then click Send setup phrase. Watch the meeting’s microphone meter or ask the other participant whether they heard it. A service acknowledgement confirms playback handling, not delivery to the other person.</p><label className="consent"><input type="checkbox" checked={heard} onChange={event => setHeard(event.target.checked)}/> I checked the meeting meter or the other participant confirmed they heard my voice.</label>{heard && <p className="success">Audio route confirmed by you for this setup.</p>}<p className="small">If there is no sound: check that .env uses {output}, the meeting microphone is {microphone}, the meeting is unmuted, and the voice service is running without errors.</p></section>
      {notice && <p className="small" role="status">{notice}</p>}
    </div><div className="audio-speech-column"><VoicePanel setup/><div className="audio-boundary"><h2>Works without the camera</h2><p>Only text you explicitly choose to speak goes to the local service. The existing Python service sends that text to Cartesia for synthesis. This connection never sends webcam frames.</p><p>The app cannot read the Python process’s selected audio device through its current protocol. Check its startup log and your meeting microphone selection.</p></div></div></div>
  </main>;
}
