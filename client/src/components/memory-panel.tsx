import {useEffect, useState} from 'react';
import {loadSettings} from '../services/settings';
import {useLocalVoice} from '../services/use-local-voice';
import {profileSecret} from '../services/profile-key';

const key = () => `silent-calls:phrase-memory:v1:${encodeURIComponent(loadSettings().profileId.trim().toLowerCase())}`;
export function memoryOn(): boolean { try { return localStorage.getItem(key()) === '1'; } catch { return false; } }

/** Phrase memory (Moss): opt in, see how many phrases it holds, forget yours. Tells the local service the
 * setting whenever it (or the profile) changes; the service is told again on every reconnect. */
export function MemoryPanel() {
  const {state} = useLocalVoice();
  const [on, setOn] = useState(memoryOn);
  useEffect(() => {
    const sync = () => setOn(memoryOn());  // (the companion itself tells the service)
    window.addEventListener('silent-calls:settings', sync);
    return () => window.removeEventListener('silent-calls:settings', sync);
  }, []);
  const change = (next: boolean) => {
    try { if (next) localStorage.setItem(key(), '1'); else localStorage.removeItem(key()); } catch { /* this session only */ }
    setOn(next); void window.desktop?.setMemory?.({profile: loadSettings().profileId.trim(), on: next, secret: profileSecret()});
  };
  const memory = state.memory;
  return <section className="hands-free" aria-label="Remember my phrases">
    <label className="hands-free-toggle"><input type="checkbox" checked={on} onChange={event => change(event.target.checked)}/> Remember my phrases (Moss)</label>
    <p className="capture-help">Keeps what you say (and the line it answered). When someone asks something similar, the suggested replies are written the way you answered before, keeping facts you've already given, and still answer what's being asked now. Only your replies are kept, in your Moss project; searching happens on this computer.</p>
    {on && <p className="capture-help">{memory?.on ? `${memory.count} phrases, including 30 starting ones.` : 'Connecting to Moss…'}</p>}
    {on && <div className="hands-free-row"><button className="icon-text" disabled={!memory?.on} onClick={() => void window.desktop?.forgetPhrases?.()}>Forget my phrases</button></div>}
  </section>;
}
