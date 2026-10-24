import {ClipboardCheck} from 'lucide-react';
import {useState} from 'react';
import {addPractice, usePersonalLibrary, vocabularyTerms} from '../services/personal-library';
import {useLocalVoice} from '../services/use-local-voice';

/** Post-call review: the coach agent proposes words and practice sentences from where lip-reading struggled;
 * nothing changes until you approve each one. */
export function ReviewPanel() {
  const {state} = useLocalVoice();
  const personal = usePersonalLibrary();
  const [approved, setApproved] = useState<Record<string, boolean>>({});
  const [error, setError] = useState('');
  if (state.connection !== 'connected') return null;
  const review = state.review;
  async function start() {
    setError(''); setApproved({});
    try { await window.desktop?.reviewCall(vocabularyTerms()); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not start the review.'); }
  }
  function approve(kind: 'vocabulary' | 'practice', value: string) {
    try {
      if (kind === 'vocabulary') personal.saveVocabulary(undefined, value, '');
      else addPractice(value);
      setApproved(previous => ({...previous, [`${kind}:${value}`]: true}));
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not save it.'); }
  }
  return <section className="review-panel" aria-label="Post-call review">
    <h2><ClipboardCheck size={13}/> After the call</h2>
    {!review && <p>When the call ends, the coach looks at where lip-reading struggled and suggests words and practice sentences.</p>}
    {review?.pending && <p role="status">Reviewing the call…</p>}
    {review && !review.pending && <>
      <p>{review.summary || 'Nothing to suggest from this call.'}</p>
      {review.proposals.length > 0 && <ul>{review.proposals.map(p => {
        const key = `${p.kind}:${p.value}`;
        return <li key={key}>{p.kind === 'vocabulary' ? `Add “${p.value}” to your words` : `Practice: “${p.value}”`}
          <span>{p.reason}</span>
          <button className="icon-text" disabled={approved[key]} onClick={() => approve(p.kind, p.value)}>{approved[key] ? 'Added' : 'Approve'}</button></li>;
      })}</ul>}
      {review.proposals.some(p => p.kind === 'practice') && <p className="small">Approved practice sentences appear first in calibration (Training &amp; settings).</p>}
    </>}
    <button className="icon-text" disabled={review?.pending} onClick={() => void start()}>{review && !review.pending ? 'Review again' : 'Review this call'}</button>
    {error && <p className="capture-error" role="alert">{error}</p>}
  </section>;
}
