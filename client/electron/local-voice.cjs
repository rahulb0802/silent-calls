// The desktop talks only to the existing loopback decision/voice service.
// No provider keys, camera frames, remote hosts, or automatic retries enter this bridge.
class LocalVoice {
  constructor(onChange) {
    this.onChange = onChange;
    this.socket = null;
    this.connectTimer = null;
    this.replyTimer = null;
    this.pendingText = null;
    this.state = {
      revision: 0,
      connection: 'disconnected',
      phase: 'idle',
      port: 8765,
      endpoint: 'ws://127.0.0.1:8765',
      platform: process.platform,
      message: 'Connect to the local voice service to speak.',
      lastSpoken: '',
      firstAudioMs: null,
      captions: [],
    };
  }

  snapshot() { return { ...this.state, captions: this.state.captions.map(line => ({ ...line })) }; }
  update(patch) {
    this.state = { ...this.state, ...patch, revision: this.state.revision + 1 };
    this.onChange(this.snapshot());
    return this.snapshot();
  }
  clearTimers() {
    clearTimeout(this.connectTimer);
    clearTimeout(this.replyTimer);
    this.connectTimer = this.replyTimer = null;
  }
  detach() {
    this.clearTimers();
    const old = this.socket;
    this.socket = null;
    if (old) { try { old.close(); } catch { /* Already closed. */ } }
    this.pendingText = null;
  }
  disconnect(message = 'Disconnected from voice service.') {
    const interrupted = this.pendingText !== null;
    this.detach();
    return this.update({ connection: 'disconnected', phase: 'idle', message: interrupted ? `${message} Pending speech was interrupted; check the call before retrying.` : message });
  }
  connect(port = 8765) {
    if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Choose a local port from 1024 to 65535.');
    if (this.pendingText !== null) throw new Error('Wait for speech to finish, or disconnect before reconnecting.');
    if (this.socket && ['connected', 'connecting'].includes(this.state.connection) && this.state.port === port) return this.snapshot();
    this.detach();
    const endpoint = `ws://127.0.0.1:${port}`;
    let socket;
    try { socket = new WebSocket(endpoint); }
    catch { return this.update({ connection: 'error', phase: 'idle', message: 'Could not open a local connection. Start the Python voice service and retry.' }); }
    this.socket = socket;
    this.update({ port, endpoint, connection: 'connecting', phase: 'idle', message: 'Connecting to the local voice service…', captions: [] });
    this.connectTimer = setTimeout(() => {
      if (this.socket !== socket) return;
      this.detach();
      this.update({ connection: 'error', phase: 'idle', message: 'Local connection timed out. Start the Python service, check its port, then retry.' });
    }, 8000);
    socket.addEventListener('open', () => {
      if (this.socket !== socket) return;
      clearTimeout(this.connectTimer); this.connectTimer = null;
      this.update({ connection: 'connected', message: 'Voice service connected. Meeting audio routing still needs to be checked.' });
    });
    socket.addEventListener('message', event => {
      if (this.socket !== socket || typeof event.data !== 'string' || event.data.length > 100000) return;
      let message;
      try { message = JSON.parse(event.data); } catch { return; }
      if (!message || typeof message !== 'object') return;
      if (message.type === 'caption' && ['them', 'me'].includes(message.speaker) && typeof message.text === 'string') {
        this.update({ captions: [...this.state.captions.slice(-2), { speaker: message.speaker === 'them' ? 'Other person' : 'You', text: message.text.slice(0, 5000) }] });
      }
      if (message.type === 'spoken' && this.pendingText !== null && message.text === this.pendingText) {
        const text = this.pendingText;
        this.pendingText = null; clearTimeout(this.replyTimer); this.replyTimer = null;
        const firstAudioMs = typeof message.first_audio_ms === 'number' && Number.isFinite(message.first_audio_ms) && message.first_audio_ms >= 0 ? message.first_audio_ms : null;
        this.update({ phase: 'idle', lastSpoken: text, firstAudioMs, message: 'Service acknowledged the phrase. Confirm that the meeting receives audio.', captions: [...this.state.captions.slice(-2), { speaker: 'You', text }] });
      }
      if (message.type === 'error' && typeof message.message === 'string') {
        this.pendingText = null; clearTimeout(this.replyTimer); this.replyTimer = null;
        this.update({ phase: 'idle', message: `Voice service: ${message.message.slice(0, 1000)}` });
      }
    });
    socket.addEventListener('close', () => {
      if (this.socket !== socket) return;
      this.disconnect('Voice service connection closed.');
    });
    socket.addEventListener('error', () => {
      if (this.socket !== socket) return;
      const pending = this.pendingText !== null;
      this.detach();
      this.update({ connection: 'error', phase: 'idle', message: pending ? 'Connection failed during speech. Check the call before reconnecting; nothing will be resent automatically.' : 'Cannot reach the local service. Start Python on the selected port, then connect again.' });
    });
    return this.snapshot();
  }
  say(input) {
    if (typeof input !== 'string' || !input.trim() || input.trim().length > 5000) throw new Error('Enter between 1 and 5000 characters.');
    if (this.state.connection !== 'connected' || !this.socket || this.socket.readyState !== 1) throw new Error('Connect the local voice service first.');
    if (this.pendingText !== null) throw new Error('A phrase is already pending. Wait or disconnect before sending another.');
    if (this.socket.bufferedAmount > 65536) throw new Error('The local connection is busy. Disconnect and reconnect before retrying.');
    const text = input.trim();
    this.pendingText = text;
    this.update({ phase: 'waiting', message: 'Phrase sent. Waiting for the voice service to finish…' });
    try { this.socket.send(JSON.stringify({ type: 'say', text })); }
    catch { return this.disconnect('Could not send the phrase.'); }
    this.replyTimer = setTimeout(() => {
      if (this.pendingText !== text) return;
      this.update({ phase: 'uncertain', message: 'No completion received. Speech may still be playing. Disconnect before retrying; the phrase will not be resent automatically.' });
    }, 45000);
    return this.snapshot();
  }
}
module.exports = { LocalVoice };
