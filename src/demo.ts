export type Candidate = { id: string; text: string };
export const demoCandidates: Candidate[] = [
  { id: '1', text: 'That works for me. Let’s move forward.' },
  { id: '2', text: 'That works for me. Let’s meet tomorrow.' },
  { id: '3', text: 'That looks good. Let’s move forward.' },
];
export type MeetingState = 'ready' | 'capturing' | 'processing' | 'choosing' | 'speaking' | 'paused';
export function transition(state: MeetingState, event: 'start' | 'release' | 'result' | 'select' | 'done' | 'pause' | 'resume'): MeetingState {
  if (event === 'pause') return 'paused';
  if (state === 'paused' && event === 'resume') return 'ready';
  if (state === 'ready' && event === 'start') return 'capturing';
  if (state === 'capturing' && event === 'release') return 'processing';
  if (state === 'processing' && event === 'result') return 'choosing';
  if ((state === 'choosing' || state === 'ready') && event === 'select') return 'speaking';
  if (state === 'speaking' && event === 'done') return 'ready';
  return state;
}
