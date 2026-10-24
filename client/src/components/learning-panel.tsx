import {useEffect, useRef, useState} from 'react';
import {EnrollmentApi, trainingRunning} from '../services/enrollment-api';
import {LEARNED, LEARNING_CHANGED, learningOn, setLearning} from '../services/learning';
import {loadSettings} from '../services/settings';

/** Learn from my corrections: opt in, see how many are saved, retrain with them, or delete them. */
export function LearningPanel() {
  const [on, setOn] = useState(learningOn);
  const [count, setCount] = useState<number | null>(null);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const abort = useRef(new AbortController());
  const api = () => new EnrollmentApi(loadSettings());
  const refresh = async () => { try { setCount(await api().corrections(abort.current.signal)); } catch { setCount(null); } };
  useEffect(() => {
    const changed = () => setOn(learningOn());
    const learned = (event: Event) => { const n = (event as CustomEvent<number>).detail; if (Number.isInteger(n)) setCount(n); };
    window.addEventListener(LEARNING_CHANGED, changed); window.addEventListener(LEARNED, learned);
    void refresh();
    const controller = abort.current;
    return () => { window.removeEventListener(LEARNING_CHANGED, changed); window.removeEventListener(LEARNED, learned); controller.abort(); };
  }, []);
  async function retrain() {
    setBusy(true); setStatus('Starting…');
    try {
      const client = api();
      await client.start(abort.current.signal);
      for (let i = 0; i < 120; i++) {
        await new Promise(resolve => setTimeout(resolve, 3000));
        const s = await client.status(abort.current.signal);
        if (trainingRunning(s)) { setStatus(s.state === 'training' && s.step ? `Training · step ${s.step} of ${s.steps}` : 'Getting ready…'); continue; }
        const r = s.report;
        setStatus(s.state === 'done' ? `Updated. ${r?.before_wer !== undefined && r?.after_wer !== undefined ? `Word errors on your held-out calibration sentences: ${Math.round(r.before_wer * 100)}% → ${Math.round(r.after_wer * 100)}%.` : ''}` : `Training didn't finish: ${s.error || s.state}`);
        break;
      }
    } catch (reason) { setStatus(reason instanceof Error ? reason.message : 'Could not start training.'); }
    finally { setBusy(false); }
  }
  async function remove() {
    setBusy(true);
    try { await api().deleteCorrections(abort.current.signal); setCount(0); setStatus('Deleted. Retrain to remove them from your model too.'); }
    catch (reason) { setStatus(reason instanceof Error ? reason.message : 'Could not delete.'); }
    finally { setBusy(false); }
  }
  return <section className="hands-free" aria-label="Learn from my corrections">
    <label className="hands-free-toggle"><input type="checkbox" checked={on} onChange={event => setLearning(event.target.checked)}/> Learn from my corrections</label>
    <p className="capture-help">When you fix a phrase (pick another option, edit it, or take the suggestion), keep its mouth crop and the words you chose to train your personal model. Only the mouth area is kept, never full video or audio.</p>
    <p className="capture-help">{count === null ? 'Saved corrections: unavailable (lip-reading not connected).' : `Saved corrections: ${count}`}</p>
    <div className="hands-free-row">
      <button className="icon-text" disabled={busy || !count} onClick={() => void retrain()}>Retrain with them (about a minute)</button>
      <button className="icon-text" disabled={busy || !count} onClick={() => void remove()}>Delete saved corrections</button>
    </div>
    {status && <p className="capture-help" role="status">{status}</p>}
  </section>;
}
