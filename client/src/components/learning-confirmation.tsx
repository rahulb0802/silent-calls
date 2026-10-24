export function LearningConfirmation({review,notice,onSave,onSkip}:{review:{text:string}|null;notice:string;onSave:()=>void;onSkip:()=>void}){
  if(!review)return notice?<p className="learning-notice" role="status">{notice}</p>:null;
  return <section className="learning-confirmation" aria-label="Confirm training example"><h2>Is this exactly what you mouthed?</h2><blockquote>{review.text}</blockquote><p>Only save it if these are the words you actually mouthed. Choosing a useful reply alone isn’t enough.</p><div><button onClick={onSave}>Yes, save for learning</button><button onClick={onSkip}>No, skip this example</button></div><p className="learning-gesture-hint">Nod / raise your eyebrows to save. Shake / turn to skip.</p></section>;
}
