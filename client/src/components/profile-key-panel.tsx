import {useState} from 'react';
import {exportProfileKey, importProfileKey} from '../services/profile-key';

/** Use this profile on another computer: copy its key here, paste it there (under the same profile name). */
export function ProfileKeyPanel() {
  const [shown, setShown] = useState(false);
  const [code, setCode] = useState('');
  const [status, setStatus] = useState('');
  const copy = async () => {
    try { await navigator.clipboard.writeText(exportProfileKey()); setStatus('Copied. Keep it private: it opens your personal model.'); }
    catch { setShown(true); setStatus('Copy it from the box below.'); }
  };
  const use = () => {
    if (importProfileKey(code)) { setCode(''); setStatus('Using that key. Reconnect lip-reading to load the profile.'); }
    else setStatus("That doesn't look like a profile key.");
  };
  return <section className="hands-free" aria-label="Profile key">
    <strong className="hands-free-toggle">Profile key</strong>
    <p className="capture-help">Your personal model and saved data on the GPU open only with this computer's key for your profile. To use the same profile on another computer, copy the key here and paste it there under the same profile name.</p>
    <div className="hands-free-row">
      <button className="icon-text" onClick={() => void copy()}>Copy my profile key</button>
      <button className="icon-text" onClick={() => setShown(!shown)}>{shown ? 'Hide' : 'Show'}</button>
    </div>
    {shown && <p className="capture-help"><code>{exportProfileKey()}</code></p>}
    <div className="hands-free-row">
      <input aria-label="Paste a profile key" placeholder="Paste a key from another computer" value={code} onChange={event => setCode(event.target.value)} style={{flex: 1, minWidth: 0}}/>
      <button className="icon-text" disabled={!code.trim()} onClick={use}>Use key</button>
    </div>
    {status && <p className="capture-help" role="status">{status}</p>}
  </section>;
}
