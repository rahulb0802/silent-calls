import type {CaptureClip, Frame} from '../capture/buffer';
import type {Decision} from '../desktop';
import type {Candidate, MeetingEvent, MeetingPort, QualityData, Route, UtteranceStart} from './meeting-port';
import {vocabularyTerms} from './personal-library';
import {LEARNED, learningOn} from './learning';
import {dictationNames, dictationOn, formatDictation} from './dictation';
import type {CopilotState} from './use-local-voice';
import type {ServiceSettings} from './settings';
import {WebmEncoder} from './webm-encoder';

const MAX_BUFFERED_BYTES = 12 * 1024 * 1024;
const RESULT_TIMEOUT_MS = 120_000;
const friendlyErrors: Record<string, string> = {
  no_face: 'No face was found. Face the webcam, improve the light, and mouth the phrase again.',
  crop_failed: 'The server could not crop your mouth. Keep your whole face visible and try again.',
  too_short: 'That capture was too short. Hold the key before you start mouthing and release after the last word.',
};

/** JPEG fallback for browsers without VP8 MediaRecorder support. */
function jpegBytes(frame: Frame): Uint8Array {
  const prefix = 'data:image/jpeg;base64,';
  if (!frame.jpeg.startsWith(prefix)) throw new Error('The camera did not produce a JPEG frame.');
  const binary = atob(frame.jpeg.slice(prefix.length));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes;
}
/** The numeric fields and flags of the server's quality report, for the camera coach. */
export function qualityNumbers(value: unknown): QualityData | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const out: QualityData = {};
  for (const [key, item] of Object.entries(value).slice(0, 40)) {
    if (typeof item === 'number' && Number.isFinite(item)) out[key.slice(0, 40)] = item;
    if (key === 'flags' && Array.isArray(item)) out.flags = item.filter((flag): flag is string => typeof flag === 'string').slice(0, 10).map(flag => flag.slice(0, 120));
  }
  return out;
}
/** Names to bias toward, sent with each utterance so the lip-reader can spell them (PROTOCOL.md, vocab): your
 * saved vocabulary, your profile name (usually your own name), and the call's names from the local service
 * (its VOCAB plus names heard in the captions). */
export function names(settings: ServiceSettings, callNames: string[] = []): string[] {
  const profile = settings.profileId.trim();
  const all = [...vocabularyTerms(), ...(/^[\p{L}' -]{2,40}$/u.test(profile) ? [profile] : []), ...callNames];
  const seen = new Set<string>();
  return all.filter(name => { const key = name.trim().toLowerCase(); if (!key || seen.has(key)) return false; seen.add(key); return true; }).slice(0, 200);
}
const COPILOT_OFF = 'silent-calls:copilot-off';
export function copilotOff(): boolean { try { return localStorage.getItem(COPILOT_OFF) === '1'; } catch { return false; } }
export function setCopilotOff(off: boolean) {
  try { if (off) localStorage.setItem(COPILOT_OFF, '1'); else localStorage.removeItem(COPILOT_OFF); } catch { /* per-device preference only */ }
  window.dispatchEvent(new Event(COPILOT_OFF));
}
export const COPILOT_CHANGED = COPILOT_OFF;
function tunnelPort(settings: ServiceSettings) {
  const port = Number(new URL(settings.websocketUrl || 'ws://127.0.0.1:8000/ws/session').port || 80);
  return Number.isInteger(port) ? port : 8000;
}
function endpoint(settings: ServiceSettings) {
  const url = new URL(settings.websocketUrl || 'ws://127.0.0.1:8000/ws/session');
  if (!['localhost', '127.0.0.1'].includes(url.hostname) || url.protocol !== 'ws:' || url.username || url.password || url.pathname !== '/ws/session') {
    throw new Error('Use the SSH tunnel URL: ws://127.0.0.1:8000/ws/session. The app opens the tunnel itself.');
  }
  if (!settings.profileId.trim() || settings.profileId.length > 128) throw new Error('Enter your profile ID in Training & settings.');
  url.hostname = '127.0.0.1';
  url.searchParams.set('user_id', settings.profileId.trim());
  return url.toString();
}

const normalize = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N} ]+/gu, '').replace(/\s+/g, ' ').trim();

/** Reorder the lip-reader's candidates by the decision layer's ranking; unchanged when there is none. */
export function rankByDecision(id: string, candidates: Candidate[], decision: Decision | null):
  {candidates: Candidate[]; confidence?: number; route?: Route; ranker: 'jev' | 'lip'} {
  if (!decision?.options.length) return {candidates, ranker: 'lip'};
  const used = new Set<string>();
  const out: Candidate[] = [];
  decision.options.forEach((option, index) => {
    const match = candidates.find(item => !used.has(item.id) && normalize(item.text) === normalize(option.text));
    const candidate = match || {id: `${id}:d${index}`, text: option.text};
    used.add(candidate.id);
    out.push({...candidate, prob: option.prob});
  });
  for (const item of candidates) if (!used.has(item.id) && !out.some(other => normalize(other.text) === normalize(item.text))) out.push(item);
  return {candidates: out.slice(0, 10), confidence: decision.options[0].prob, route: decision.route, ranker: decision.jev ? 'jev' : 'lip'};
}

export class LipreadPort implements MeetingPort {
  private listeners = new Set<(event: MeetingEvent) => void>();
  private socket: WebSocket | null = null;
  private retry: ReturnType<typeof setTimeout> | null = null;
  private opening: ReturnType<typeof setTimeout> | null = null;
  private resultTimer: ReturnType<typeof setTimeout> | null = null;
  private progressTimer: ReturnType<typeof setInterval> | null = null;
  private removeVoice: (() => void) | null = null;
  private removeRepair: (() => void) | null = null;
  private removeNames: (() => void) | null = null;
  private callNames: string[] = [];
  private written = new Map<string, Promise<string | null>>();  // dictation: punctuated text, started early
  private copilot: CopilotState | null = null;
  private desired = false;
  private retries = 0;
  private active = '';
  private waiting = false;
  private capturing = false;
  private sentFrames = 0;
  private webm: WebmEncoder | null = null;
  private choices: Candidate[] = [];
  private connected = false;
  private message = 'Connect lip-reading: the app opens the SSH tunnel to the GPU for you.';
  private voiceGeneration = 0;
  private voicePending = false;
  private disposed = false;
  constructor(private settings: ServiceSettings) {}

  private emit(event: MeetingEvent) { for (const listener of this.listeners) listener(event); }
  private connection(connected: boolean, message: string) {
    this.connected = connected; this.message = message;
    this.emit({type: 'connection', connected, message});
  }
  subscribe(listener: (event: MeetingEvent) => void) {
    this.disposed = false;
    this.listeners.add(listener);
    listener({type: 'connection', connected: this.connected, message: this.message});
    return () => { this.listeners.delete(listener); if (!this.listeners.size) this.disconnect(); };
  }
  connect(settings: ServiceSettings = this.settings) {
    if (this.voicePending) { this.emit({type:'error', message:'Wait for the confirmed phrase to finish before reconnecting.'}); return; }
    this.disconnect(); this.disposed = false; this.settings = settings;
    try { endpoint(settings); }
    catch (reason) { this.emit({type:'error', message: reason instanceof Error ? reason.message : 'Invalid lip-reading endpoint.'}); return; }
    this.desired = true; this.retries = 0; this.watchNames(); this.open();
  }
  /** The desktop app opens the SSH tunnel itself (electron/tunnel.cjs); in a browser preview, open it by hand. */
  private open() {
    if (!this.desired || this.disposed) return;
    const desktop = window.desktop;
    if (!desktop?.ensureTunnel) { this.openSocket(); return; }
    this.connection(false, this.retries ? 'Reconnecting to GPU…' : 'Opening the SSH tunnel to the GPU…');
    void desktop.ensureTunnel(tunnelPort(this.settings)).catch(() => ({ok:false, message:'Could not open the SSH tunnel.'})).then(result => {
      if (!this.desired || this.disposed) return;
      if (!result.ok) { this.connection(false, result.message); this.scheduleReconnect(); return; }
      this.openSocket();
    });
  }
  private openSocket() {
    if (!this.desired || this.disposed) return;
    this.connection(false, this.retries ? 'Reconnecting to GPU…' : 'Connecting to GPU…');
    let socket: WebSocket;
    try { socket = new WebSocket(endpoint(this.settings)); }
    catch { this.scheduleReconnect(); return; }
    this.socket = socket;
    this.opening = setTimeout(() => { if (this.socket === socket) this.lost(); }, 8000);
    socket.onopen = () => {
      if (this.socket !== socket) return;
      if (this.opening) clearTimeout(this.opening); this.opening = null;
      socket.send(JSON.stringify({type:'session.start', user_id:this.settings.profileId.trim(), use_adapter:true}));
      this.retries = 0;
      this.connection(true, 'GPU connected · hold the key, then choose a phrase to speak.');
    };
    socket.onmessage = event => {
      if (this.socket !== socket || typeof event.data !== 'string' || event.data.length > 1_000_000) return;
      let data;
      try { data = JSON.parse(event.data); } catch { return; }
      if (!data || typeof data !== 'object') return;
      const id = typeof data.utt_id === 'string' ? data.utt_id : this.active;
      if (data.type === 'learned' && Number.isInteger(data.n_corrections)) { window.dispatchEvent(new CustomEvent(LEARNED, {detail: data.n_corrections})); return; }
      if (data.type === 'error') {
        if (id !== this.active || !this.active) return;
        const message = friendlyErrors[data.code] || (typeof data.message === 'string' ? data.message.slice(0,1000) : 'The GPU could not read this capture. Please try again.');
        this.resetUtterance(); this.emit({type:'error', utteranceId:id, message, ...(typeof data.code === 'string' ? {code:data.code.slice(0,40)} : {})}); return;
      }
      if (data.type !== 'candidates' || id !== this.active || !this.waiting || !Array.isArray(data.candidates)) return;
      const scored = (data.candidates as unknown[]).slice(0,40).flatMap(value => {
        const item = value as {text?:unknown;lip_score?:unknown} | null;
        return item && typeof item.text === 'string' && item.text.trim() && item.text.length <= 5000 && typeof item.lip_score === 'number' && Number.isFinite(item.lip_score)
          ? [{text:item.text, score:item.lip_score}] : [];
      });
      const givenSet = new Set(Array.isArray(data.given) ? data.given.filter((g: unknown) => typeof g === 'string') : []);
      const candidates: Candidate[] = data.candidates.slice(0,10).flatMap((value: unknown, index: number) => {
        if (!value || typeof value !== 'object') return [];
        const item = value as {text?:unknown;lip_score?:unknown};
        if (typeof item.text !== 'string' || !item.text.trim() || item.text.length > 5000) return [];
        const reply = givenSet.has(item.text) ? this.copilot?.replies.find(r => normalize(r.text) === normalize(item.text as string)) : undefined;
        // a co-pilot reply keeps its own wording (digits, punctuation) for display and speech
        return [{id:`${id}:${index}`,text:reply?.text ?? item.text,lipScore:typeof item.lip_score === 'number' && Number.isFinite(item.lip_score) ? item.lip_score : undefined,
          ...(givenSet.has(item.text) ? {source:'copilot' as const, facts:reply?.facts ?? []} : {})}];
      });
      this.clearResultTimers(); this.waiting = false;
      const timings: Record<string,number> = {};
      if (data.timings && typeof data.timings === 'object') for (const [key,value] of Object.entries(data.timings)) {
        if (typeof value === 'number' && Number.isFinite(value) && value >= 0) timings[key.slice(0,80)] = value;
      }
      const confidence = typeof data.confidence === 'number' && data.confidence >= 0 && data.confidence <= 1 ? data.confidence : undefined;
      const quality = data.quality == null ? '' : (typeof data.quality === 'string' ? data.quality : JSON.stringify(data.quality)).slice(0,600);
      const qualityData = qualityNumbers(data.quality);
      // Nothing is spoken automatically: the decision layer only reorders, and every result requires the user's pick.
      const adapter = typeof data.adapter === 'string' ? data.adapter.slice(0,128) : null;
      void this.rank(id, candidates, scored).then(ranked => {
        if (this.active !== id || this.waiting || this.capturing) return;
        this.choices = ranked.candidates;
        // dictation: start writing out the top option now, so a nod on it types without waiting
        this.written.clear();
        const top = ranked.candidates[0]?.text;
        if (top && dictationOn() && window.desktop?.punctuate) {
          this.written.set(top, window.desktop.punctuate({text: top, names: dictationNames([...vocabularyTerms(), this.settings.profileId.trim()], this.callNames)}));
        }
        if (ranked.timings) Object.assign(timings, ranked.timings);
        this.emit({type:'candidates',utteranceId:id,candidates:ranked.candidates,confidence:ranked.confidence ?? confidence,timings,quality,qualityData,adapter,route:ranked.route,ranker:ranked.ranker});
        this.watchRepair(id);
      });
    };
    socket.onerror = () => { if (this.socket === socket) this.lost(); };
    socket.onclose = () => { if (this.socket === socket) this.lost(); };
  }
  private vocabulary(): {vocab?: string[]} {
    const vocab = names(this.settings, this.callNames);
    return vocab.length ? {vocab} : {};
  }
  /** The co-pilot's prepared replies, scored by the lip-reader against this capture (unless turned off). */
  private given(): {given?: string[]} {
    if (copilotOff() || !this.copilot?.replies.length) return {};
    return {given: this.copilot.replies.map(reply => reply.text).slice(0, 8)};
  }
  /** Follow the local service's list of names in this call and the co-pilot's prepared replies. */
  private watchNames() {
    this.removeNames?.(); this.removeNames = null;
    const desktop = window.desktop;
    if (!desktop?.onVoiceStatus) return;
    const take = (state: {callNames?: string[]; copilot?: CopilotState | null}) => {
      this.callNames = Array.isArray(state.callNames) ? state.callNames : [];
      this.copilot = state.copilot ?? null;
    };
    this.removeNames = desktop.onVoiceStatus(take);
    void desktop.getVoiceStatus().then(take).catch(() => undefined);
  }
  /** Jev reranking through the local decision service, with the call captions and your vocabulary as context. */
  private async rank(id: string, candidates: Candidate[], scored: {text:string;score:number}[]) {
    const desktop = window.desktop;
    let decision: Decision | null = null;
    if (desktop?.decide && scored.length) {
      try { decision = await desktop.decide({utteranceId:id, candidates:scored, vocab:names(this.settings, this.callNames), me:this.settings.profileId.trim()}); }
      catch { decision = null; }
    }
    const ranked = rankByDecision(id, candidates, decision);
    const timings: Record<string,number> = {};
    if (decision) for (const [key,value] of Object.entries(decision.timings)) timings[`decide_${key}`] = value;
    return {...ranked, timings};
  }
  /** Claude's repair arrives after the ranking; it is offered as one more choice, never spoken unasked. */
  private watchRepair(id: string) {
    this.removeRepair?.(); this.removeRepair = null;
    const desktop = window.desktop;
    if (!desktop?.onVoiceStatus) return;
    let sent = '';
    const check = (state: {repair?: {utteranceId:string;text:string} | null}) => {
      const repair = state.repair;
      if (this.active !== id || !repair || repair.utteranceId !== id || repair.text === sent) return;
      sent = repair.text;
      this.emit({type:'repair', utteranceId:id, text:repair.text});
    };
    this.removeRepair = desktop.onVoiceStatus(check);
    void desktop.getVoiceStatus().then(check).catch(() => undefined);
  }
  private clearResultTimers() {
    if (this.resultTimer) clearTimeout(this.resultTimer);
    if (this.progressTimer) clearInterval(this.progressTimer);
    this.resultTimer = this.progressTimer = null;
  }
  private resetUtterance() {
    this.removeRepair?.(); this.removeRepair = null;
    this.webm?.cancel(); this.webm = null;
    this.clearResultTimers(); this.active = ''; this.waiting = this.capturing = false; this.sentFrames = 0; this.choices = [];
  }
  private closeSocket() {
    const old = this.socket; this.socket = null;
    if (this.opening) clearTimeout(this.opening); this.opening = null;
    if (old) { old.onopen = old.onmessage = old.onerror = old.onclose = null; old.close(); }
  }
  private lost() {
    const interrupted = Boolean(this.active);
    this.resetUtterance(); this.closeSocket();
    this.connection(false, interrupted ? 'Connection lost. The capture was discarded; nothing will be replayed.' : 'GPU disconnected. Reconnecting…');
    this.scheduleReconnect();
  }
  private scheduleReconnect() {
    if (!this.desired || this.disposed || this.retry) return;
    const delay = Math.min(15_000, 1000 * 2 ** Math.min(this.retries++,4));
    this.retry = setTimeout(() => { this.retry = null; this.open(); }, delay);
  }
  disconnect() {
    this.desired = false; this.disposed = true;
    this.removeNames?.(); this.removeNames = null;
    if (this.retry) clearTimeout(this.retry); this.retry = null;
    this.voiceGeneration++; this.removeVoice?.(); this.removeVoice = null; this.voicePending = false;
    this.resetUtterance(); this.closeSocket();
    this.connection(false, 'Lip-reading disconnected. Your camera frames stay local.');
  }
  start(start: UtteranceStart) {
    if (!this.connected || this.socket?.readyState !== WebSocket.OPEN || this.active || this.voicePending) {
      this.emit({type:'error',utteranceId:start.utteranceId,message:'Connect lip-reading and wait for the previous request before capturing.'}); return;
    }
    this.active = start.utteranceId; this.capturing = true; this.sentFrames = 0; this.choices = [];
    if (WebmEncoder.supported()) {
      try {
        this.webm = new WebmEncoder(start.width,start.height,bytes=>{
          if (this.socket?.readyState !== WebSocket.OPEN || this.socket.bufferedAmount + bytes.byteLength > MAX_BUFFERED_BYTES) {
            throw new Error('The WebM upload queue filled. Try a shorter phrase or a faster connection.');
          }
          this.socket.send(bytes);
        },error=>{
          const id=this.active; this.lost(); this.emit({type:'error',utteranceId:id,message:error.message});
        });
      } catch { this.webm = null; }
    }
    this.socket.send(JSON.stringify({type:'utterance.start',utt_id:this.active,fps:start.targetFps,t_press_ms:Math.round(performance.timeOrigin+start.pressedAtMs),...(this.webm?{encoding:'webm'}:{}),...this.vocabulary(),...this.given()}));
  }
  frame(utteranceId: string, _sequence: number, frame: Frame) {
    if (!this.capturing || utteranceId !== this.active || this.socket?.readyState !== WebSocket.OPEN) return;
    if (this.webm) { this.webm.add(frame); this.sentFrames++; return; }
    try {
      const bytes = jpegBytes(frame);
      if (this.socket.bufferedAmount + bytes.byteLength > MAX_BUFFERED_BYTES) throw new Error('The upload queue filled. Try a shorter phrase or a faster connection.');
      this.socket.send(bytes); this.sentFrames++;
    } catch (reason) {
      const id = this.active;
      this.lost();
      this.emit({type:'error',message:reason instanceof Error ? reason.message : 'Could not send the camera frame.'});
    }
  }
  end(clip: CaptureClip) {
    if (clip.id !== this.active || !this.capturing || this.socket?.readyState !== WebSocket.OPEN) return;
    this.capturing = false; this.waiting = true;
    if (this.webm) {
      const encoder=this.webm;
      void encoder.finish().then(()=>{
        if (this.active !== clip.id || !this.waiting || this.socket?.readyState !== WebSocket.OPEN) return;
        this.webm=null;
        this.sendEnd(clip);
      }).catch(reason=>{
        if (this.active !== clip.id) return;
        this.lost();
        this.emit({type:'error',utteranceId:clip.id,message:reason instanceof Error?reason.message:'WebM capture failed.'});
      });
      return;
    }
    this.sendEnd(clip);
  }
  private sendEnd(clip: CaptureClip) {
    // WebSocket preserves chunk/JPEG and JSON ordering, including queued bytes.
    if (this.socket?.readyState !== WebSocket.OPEN) return;
    this.socket.send(JSON.stringify({type:'utterance.end',utt_id:clip.id,n_frames:this.sentFrames,t_release_ms:Math.round(performance.timeOrigin+clip.releasedAtMs)}));
    const progress = () => this.emit({type:'upload',utteranceId:clip.id,sentFrames:this.sentFrames,bufferedBytes:this.socket?.bufferedAmount || 0});
    progress(); this.progressTimer = setInterval(progress,250);
    this.resultTimer = setTimeout(() => {
      const id = this.active; this.lost();
      this.emit({type:'error',message:'The GPU did not reply within two minutes. Reconnect and capture a new phrase.'});
    },RESULT_TIMEOUT_MS);
  }
  cancel(utteranceId: string) {
    if (utteranceId !== this.active) return;
    if (this.capturing || this.waiting) {
      // Close discards the server session, including unsent frames, even if cancel is not implemented.
      this.lost();
    } else this.resetUtterance();
  }
  confirm(utteranceId: string, candidateId: string, editedText?: string) {
    if (utteranceId !== this.active || this.voicePending) return;
    const candidate = this.choices.find(item => item.id === candidateId);
    const text = (editedText ?? candidate?.text ?? '').trim();
    if (!text || text.length > 5000) { this.emit({type:'error',utteranceId,message:'Choose a candidate or enter a phrase up to 5000 characters.'}); return; }
    // a correction (not the top guess as it was) teaches your personal model, if you've opted in
    const top = this.choices[0]?.text.trim().toLowerCase();
    if (learningOn() && text.toLowerCase() !== top && this.socket?.readyState === WebSocket.OPEN) {
      try { this.socket.send(JSON.stringify({type:'utterance.confirm', utt_id:utteranceId, text:text.slice(0, 300), learn:true})); } catch { /* best effort */ }
    }
    this.voicePending = true;
    const generation = ++this.voiceGeneration;
    if (dictationOn()) void this.typeConfirmed(utteranceId,text,generation);
    else void this.speakConfirmed(utteranceId,text,generation);
  }
  /** Dictation: type the confirmed text where the cursor is (in whatever app has focus), with a space after. */
  private async typeConfirmed(id: string, text: string, generation: number) {
    const current = () => generation === this.voiceGeneration && !this.disposed;
    try {
      const desktop = window.desktop;
      if (!desktop?.typeText) throw new Error('Use the Electron desktop app to type.');
      // written form, no rewording: Claude adds capitals, punctuation and sentence breaks (checked to keep every
      // word), then the simple rules (names' spelling, "I", a final full stop) - or the rules alone if Claude's
      // version isn't available or changed a word
      const names = dictationNames([...vocabularyTerms(), this.settings.profileId.trim()], this.callNames);
      const written = await (this.written.get(text) ?? desktop.punctuate?.({text, names}) ?? Promise.resolve(null)).catch(() => null);
      this.written.clear();
      const sameWords = (a: string, b: string) => a.toLowerCase().replace(/[^a-z0-9]/g, '') === b.toLowerCase().replace(/[^a-z0-9]/g, '');
      const typed = formatDictation(written && sameWords(written, text) ? written : text, names);
      if (!current()) return;
      await desktop.typeText(`${typed} `);
      void desktop.noteDictated?.(typed).catch(() => undefined);
      if (!current()) return;
      this.voicePending = false; this.resetUtterance();
      this.emit({type:'caption',speaker:'You',text}); this.emit({type:'speech.finished',utteranceId:id});
    } catch (reason) {
      this.voicePending = false;
      if (current()) { this.resetUtterance(); this.emit({type:'error',utteranceId:id,message:reason instanceof Error ? reason.message : 'Could not type this phrase.'}); }
    }
  }
  private async speakConfirmed(id: string, text: string, generation: number) {
    const current = () => generation === this.voiceGeneration && !this.disposed;
    let replyTimer: ReturnType<typeof setTimeout> | null = null;
    const cleanup = () => {
      if (replyTimer) clearTimeout(replyTimer);
      if (generation !== this.voiceGeneration) return;
      this.removeVoice?.(); this.removeVoice = null; this.voicePending = false;
    };
    try {
      const desktop = window.desktop;
      if (!desktop) throw new Error('Use the Electron desktop app to speak a selected result.');
      let status = await desktop.getVoiceStatus();
      if (!current()) return;
      if (status.connection !== 'connected') status = await desktop.connectSetupVoice();
      if (!current()) return;
      if (status.connection !== 'connected' || status.phase !== 'idle') throw new Error('The voice service is unavailable or busy. Wait for it, then choose a new phrase.');
      const baseline = status.revision;
      this.removeVoice = desktop.onVoiceStatus(next => {
        if (!current() || next.revision <= baseline) return;
        if (next.connection !== 'connected' || next.phase === 'uncertain' || (next.phase === 'idle' && next.message.startsWith('Voice service:'))) {
          cleanup(); this.resetUtterance(); this.emit({type:'error',utteranceId:id,message:next.message}); return;
        }
        if (next.phase === 'idle' && next.lastSpoken === text) {
          cleanup(); this.resetUtterance(); this.emit({type:'caption',speaker:'You',text}); this.emit({type:'speech.finished',utteranceId:id});
        }
      });
      // Confirmation calls the existing local say path once; no pick/voice messages go to the GPU.
      replyTimer = setTimeout(() => {
        if (!current()) return;
        cleanup(); this.resetUtterance(); this.emit({type:'error',utteranceId:id,message:'Voice acknowledgement timed out. Check the call before sending anything again.'});
      },50_000);
      if (!current()) { cleanup(); return; }
      await desktop.speakText(text);
    } catch (reason) {
      cleanup();
      if (current()) { this.resetUtterance(); this.emit({type:'error',utteranceId:id,message:reason instanceof Error ? reason.message : 'Could not speak this phrase.'}); }
    }
  }
  quickPhrase(_utteranceId: string, _text: string) {
    this.emit({type:'error',message:'Use the Type to speak quick phrases; this GPU endpoint only reads lips.'});
  }
}
