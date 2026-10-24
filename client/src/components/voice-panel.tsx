import { useEffect, useId, useState } from 'react';
import { ArrowUpRight, Link2, Unlink, Volume2 } from 'lucide-react';
import {SavedPhrases} from './saved-phrases';
import { useLocalVoice } from '../services/use-local-voice';

export const QUICK_PHRASES = ['Yes', 'One moment, please.', 'Thank you.', 'Could you repeat that?'];
export const SETUP_PHRASE = 'Hi, this is my Silent Calls voice. Can you hear me clearly?';

export function VoicePanel({ setup = false }: { setup?: boolean }) {
  const voice = useLocalVoice();
  const { state } = voice;
  const id = useId();
  const [text, setText] = useState('');
  const [port, setPort] = useState(() => localStorage.getItem('silent-calls:voice-port:v1') || '8765');
  const [notice, setNotice] = useState('');
  const connected = state.connection === 'connected';
  const busy = state.phase !== 'idle';
  const canSpeak = connected && !busy;

  useEffect(() => {
    if (state.connection === 'connected' || state.connection === 'connecting') setPort(String(state.port));
  }, [state.connection, state.port]);

  async function connect() {
    setNotice('');
    const number = Number(port);
    if (!Number.isInteger(number) || number < 1024 || number > 65535) {
      setNotice('Enter a local port between 1024 and 65535.'); return;
    }
    if (await voice.connect(number)) localStorage.setItem('silent-calls:voice-port:v1', String(number));
  }
  async function send(value: string) {
    setNotice('');
    if (!canSpeak) return;
    await voice.speak(value);
  }

  return <section className={`voice-panel ${setup ? 'voice-panel-setup' : ''}`} aria-labelledby={`${id}-title`}>
    <div className="voice-panel-heading"><h2 id={`${id}-title`}>Type to speak</h2><span className={`voice-connection ${connected ? 'connected' : ''}`}><span className="dot" />{connected ? 'Connected' : state.connection === 'connecting' ? 'Connecting' : 'Not connected'}</span></div>
    <p className="voice-description">Your text goes to Nilesh’s local service. It speaks through the audio device selected in the server’s .env file.</p>
    <div className="voice-connect"><label htmlFor={`${id}-port`}>Local port</label><input id={`${id}-port`} type="number" inputMode="numeric" min={1024} max={65535} value={port} disabled={connected || state.connection === 'connecting'} onChange={event => setPort(event.target.value)} />
      {connected || state.connection === 'connecting' ? <button className="icon-text" onClick={() => void voice.disconnect()}><Unlink size={14}/>{busy ? 'Disconnect & interrupt' : 'Disconnect'}</button> : <button className="icon-text" disabled={!voice.available} onClick={() => void connect()}><Link2 size={14}/>Connect</button>}
    </div>
    <p className="voice-endpoint">ws://127.0.0.1:{port || '8765'} · This computer only</p>
    <label className="voice-text-label" htmlFor={`${id}-text`}>What would you like to say?</label>
    <textarea id={`${id}-text`} rows={setup ? 4 : 2} maxLength={5000} value={text} placeholder="Type your response…" onChange={event => setText(event.target.value)} onKeyDown={event => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); if (canSpeak && text.trim()) void send(text); }
    }} />
    <div className="voice-send"><span>{text.length} / 5000</span><button className="button" disabled={!canSpeak || !text.trim()} onClick={() => void send(text)}><Volume2 size={15}/>{busy ? 'Waiting for service…' : 'Speak now'}</button></div>
    <div className="quick-phrases"><span>Quick phrases</span><div>{QUICK_PHRASES.map(phrase => <button key={phrase} disabled={!canSpeak} onClick={() => void send(phrase)}>{phrase}</button>)}</div></div>
    <SavedPhrases disabled={busy} light={setup}/>
    {setup && <div className="setup-send-phrase"><p>“{SETUP_PHRASE}”</p><button className="button" disabled={!canSpeak} onClick={() => void send(SETUP_PHRASE)}><Volume2 size={15}/>Send setup phrase</button></div>}
    <p className="voice-status" role={state.connection === 'error' || state.phase === 'uncertain' ? 'alert' : 'status'}>{!voice.available ? 'Local voice is available in the Electron desktop app. Restart Electron after updating its main/preload files.' : state.message}</p>
    {(voice.error || notice) && <p className="voice-error" role="alert">{voice.error || notice}</p>}
    {state.lastSpoken && <p className="voice-last">Last acknowledged: “{state.lastSpoken}”{state.firstAudioMs !== null && state.firstAudioMs > 0 && <span>First audio reported by service: {Math.round(state.firstAudioMs)}ms</span>}</p>}
    {state.captions.length > 0 && <div className="voice-captions" aria-live="polite">{state.captions.map((line, index) => <p key={index}><strong>{line.speaker}</strong>{line.text}</p>)}</div>}
    {!setup && <button className="icon-text" onClick={() => window.desktop ? void window.desktop.showMain('audio-setup') : window.open(`${location.pathname}#/audio-setup`, '_blank')}>Set up Zoom, Meet or FaceTime <ArrowUpRight size={13}/></button>}
  </section>;
}
