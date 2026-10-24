import type {CaptureClip, Frame} from '../capture/buffer';
import type {Candidate, MeetingEvent, MeetingPort, UtteranceStart} from './meeting-port';
import type {ServiceSettings} from './settings';

const MAX_BUFFERED_BYTES = 12 * 1024 * 1024;
const RESULT_TIMEOUT_MS = 120_000;
const friendlyErrors: Record<string, string> = {
  no_face: 'No face was found. Face the webcam, improve the light, and mouth the phrase again.',
  crop_failed: 'The server could not crop your mouth. Keep your whole face visible and try again.',
  too_short: 'That capture was too short. Hold the key before you start mouthing and release after the last word.',
};

/** JPEG sender is isolated here so the future agreed video-chunk encoding can replace it. */
function jpegBytes(frame: Frame): Uint8Array {
  const prefix = 'data:image/jpeg;base64,';
  if (!frame.jpeg.startsWith(prefix)) throw new Error('The camera did not produce a JPEG frame.');
  const binary = atob(frame.jpeg.slice(prefix.length));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes;
}
function endpoint(settings: ServiceSettings) {
  const url = new URL(settings.websocketUrl || 'ws://127.0.0.1:8000/ws/session');
  if (!['localhost', '127.0.0.1'].includes(url.hostname) || url.protocol !== 'ws:' || url.username || url.password || url.pathname !== '/ws/session') {
    throw new Error('Use the SSH tunnel URL: ws://127.0.0.1:8000/ws/session. Keep your tunnel terminal open.');
  }
  if (!settings.profileId.trim() || settings.profileId.length > 128) throw new Error('Enter your profile ID in Training & settings.');
  url.hostname = '127.0.0.1';
  url.searchParams.set('user_id', settings.profileId.trim());
  return url.toString();
}

export class LipreadPort implements MeetingPort {
  private listeners = new Set<(event: MeetingEvent) => void>();
  private socket: WebSocket | null = null;
  private retry: ReturnType<typeof setTimeout> | null = null;
  private opening: ReturnType<typeof setTimeout> | null = null;
  private resultTimer: ReturnType<typeof setTimeout> | null = null;
  private progressTimer: ReturnType<typeof setInterval> | null = null;
  private removeVoice: (() => void) | null = null;
  private desired = false;
  private retries = 0;
  private active = '';
  private waiting = false;
  private capturing = false;
  private sentFrames = 0;
  private choices: Candidate[] = [];
  private connected = false;
  private message = 'Connect lip-reading to send captures through your SSH tunnel.';
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
    this.desired = true; this.retries = 0; this.open();
  }
  private open() {
    if (!this.desired || this.disposed) return;
    this.connection(false, this.retries ? 'Reconnecting to GPU… Keep the SSH tunnel open.' : 'Connecting to GPU through your SSH tunnel…');
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
      if (data.type === 'error') {
        if (id !== this.active || !this.active) return;
        const message = friendlyErrors[data.code] || (typeof data.message === 'string' ? data.message.slice(0,1000) : 'The GPU could not read this capture. Please try again.');
        this.resetUtterance(); this.emit({type:'error', utteranceId:id, message}); return;
      }
      if (data.type !== 'candidates' || id !== this.active || !this.waiting || !Array.isArray(data.candidates)) return;
      const candidates: Candidate[] = data.candidates.slice(0,10).flatMap((value: unknown, index: number) => {
        if (!value || typeof value !== 'object') return [];
        const item = value as {text?:unknown;lip_score?:unknown};
        if (typeof item.text !== 'string' || !item.text.trim() || item.text.length > 5000) return [];
        return [{id:`${id}:${index}`,text:item.text,lipScore:typeof item.lip_score === 'number' && Number.isFinite(item.lip_score) ? item.lip_score : undefined}];
      });
      this.clearResultTimers(); this.waiting = false; this.choices = candidates;
      const timings: Record<string,number> = {};
      if (data.timings && typeof data.timings === 'object') for (const [key,value] of Object.entries(data.timings)) {
        if (typeof value === 'number' && Number.isFinite(value) && value >= 0) timings[key.slice(0,80)] = value;
      }
      const confidence = typeof data.confidence === 'number' && data.confidence >= 0 && data.confidence <= 1 ? data.confidence : undefined;
      const quality = data.quality == null ? '' : (typeof data.quality === 'string' ? data.quality : JSON.stringify(data.quality)).slice(0,600);
      // This stand-in does not synthesize speech. Every result requires the user's pick.
      const adapter = typeof data.adapter === 'string' ? data.adapter.slice(0,128) : null;
      this.emit({type:'candidates',utteranceId:id,candidates,confidence,timings,quality,adapter});
    };
    socket.onerror = () => { if (this.socket === socket) this.lost(); };
    socket.onclose = () => { if (this.socket === socket) this.lost(); };
  }
  private clearResultTimers() {
    if (this.resultTimer) clearTimeout(this.resultTimer);
    if (this.progressTimer) clearInterval(this.progressTimer);
    this.resultTimer = this.progressTimer = null;
  }
  private resetUtterance() {
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
    this.connection(false, interrupted ? 'Connection lost. The capture was discarded; nothing will be replayed.' : 'GPU disconnected. Keep your SSH tunnel open.');
    this.scheduleReconnect();
  }
  private scheduleReconnect() {
    if (!this.desired || this.disposed || this.retry) return;
    const delay = Math.min(15_000, 1000 * 2 ** Math.min(this.retries++,4));
    this.retry = setTimeout(() => { this.retry = null; this.open(); }, delay);
  }
  disconnect() {
    this.desired = false; this.disposed = true;
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
    this.socket.send(JSON.stringify({type:'utterance.start',utt_id:this.active,fps:start.targetFps,t_press_ms:Math.round(performance.timeOrigin+start.pressedAtMs)}));
  }
  frame(utteranceId: string, _sequence: number, frame: Frame) {
    if (!this.capturing || utteranceId !== this.active || this.socket?.readyState !== WebSocket.OPEN) return;
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
    // WebSocket preserves binary JPEG and JSON ordering, including queued bytes.
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
    this.voicePending = true;
    const generation = ++this.voiceGeneration;
    void this.speakConfirmed(utteranceId,text,generation);
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
