// The desktop talks only to the existing loopback decision/voice service.
// No provider keys, camera frames, remote hosts, or automatic retries enter this bridge.
class LocalVoice {
  constructor(onChange) {
    this.onChange = onChange;
    this.socket = null;
    this.connectTimer = null;
    this.replyTimer = null;
    this.pendingText = null;
    this.pendingClone = null;
    this.cloneUncertain = false;
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
      personalVoiceReady: false,
      voiceName: '',
      hasVoice: false,
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
    this.cloneUncertain = false;
    if (this.pendingClone) {
      this.pendingClone.reject(new Error('Voice setup connection closed. Check status before trying again.'));
      this.pendingClone = null;
    }
  }
  disconnect(message = 'Disconnected from voice service.') {
    const interrupted = this.pendingText !== null;
    this.detach();
    return this.update({ connection: 'disconnected', phase: 'idle', message: interrupted ? `${message} Pending speech was interrupted; check the call before retrying.` : message });
  }
  connect(port = 8765) {
    if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Choose a local port from 1024 to 65535.');
    if (this.pendingText !== null || this.pendingClone) throw new Error('Wait for voice setup or speech to finish before reconnecting.');
    if (this.socket && ['connected', 'connecting'].includes(this.state.connection) && this.state.port === port) return this.snapshot();
    this.detach();
    const endpoint = `ws://127.0.0.1:${port}`;
    let socket;
    try { socket = new WebSocket(endpoint); }
    catch { return this.update({ connection: 'error', phase: 'idle', message: 'Could not open a local connection. Start the Python voice service and retry.' }); }
    this.socket = socket;
    this.update({ port, endpoint, connection: 'connecting', phase: 'idle', message: 'Connecting to the local voice service…', captions: [], personalVoiceReady: false, hasVoice: false, voiceName: '', lastSpoken: '' });
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
      if (['voice.status', 'voice.ready'].includes(message.type) &&
          typeof message.personal === 'boolean' && typeof message.has_voice === 'boolean' &&
          typeof message.name === 'string') {
        this.update({ personalVoiceReady: message.personal, voiceName: message.name.slice(0, 80),
          hasVoice: message.has_voice, message: message.personal ? 'Your personal voice is ready.' : 'Set up your personal voice before testing speech.' });
        if (message.type === 'voice.ready' && (this.pendingClone || this.cloneUncertain)) {
          const pending = this.pendingClone;
          this.pendingClone = null; this.cloneUncertain = false;
          clearTimeout(this.replyTimer); this.replyTimer = null;
          this.update({ phase: 'idle', lastSpoken: '', message: 'Your personal voice is ready. Send the setup phrase to hear it in your meeting.' });
          pending?.resolve(this.snapshot());
        }
      }
      if (message.type === 'voice.clone.error' && (this.pendingClone || this.cloneUncertain)) {
        const pending = this.pendingClone;
        this.pendingClone = null; this.cloneUncertain = false;
        clearTimeout(this.replyTimer); this.replyTimer = null;
        const detail = typeof message.message === 'string' ? message.message.slice(0, 500) : 'Voice cloning failed.';
        this.update({ phase: 'idle', message: detail });
        pending?.reject(new Error(detail));
      }
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
        if (this.pendingClone) {
          const pending = this.pendingClone;
          this.pendingClone = null;
          pending.reject(new Error(message.message.slice(0, 500)));
        }
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
    if (this.pendingText !== null || this.pendingClone || this.cloneUncertain) throw new Error('A voice request is already pending. Wait or disconnect before sending another.');
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
  clone(wav, inputName) {
    if (!(wav instanceof Uint8Array) || wav.byteLength < 96044 || wav.byteLength > 650000 ||
        Buffer.from(wav.subarray(0, 4)).toString('ascii') !== 'RIFF' ||
        Buffer.from(wav.subarray(8, 12)).toString('ascii') !== 'WAVE') throw new Error('Record a 3–20 second voice sample first.');
    const name = typeof inputName === 'string' ? inputName.trim() : '';
    if (!name || name.length > 80) throw new Error('Enter a voice name up to 80 characters.');
    if (this.state.connection !== 'connected' || !this.socket || this.socket.readyState !== 1) throw new Error('Connect the voice service before creating your voice.');
    if (this.pendingText !== null || this.pendingClone || this.cloneUncertain) throw new Error('Reconnect and check voice status before trying again. Wait for the current voice request to finish.');
    const payload = JSON.stringify({ type: 'voice.clone', name, wav: Buffer.from(wav).toString('base64') });
    if (payload.length > 900000) throw new Error('Voice sample is too large. Record up to 20 seconds.');
    this.update({ phase: 'cloning', message: 'Creating your voice with Cartesia…' });
    return new Promise((resolve, reject) => {
      this.pendingClone = { resolve, reject };
      try { this.socket.send(payload); }
      catch { this.detach(); this.update({ connection: 'error', phase: 'idle', message: 'Could not send the voice sample.' }); return; }
      this.replyTimer = setTimeout(() => {
        if (!this.pendingClone) return;
        const pending = this.pendingClone;
        this.pendingClone = null; this.cloneUncertain = true;
        this.update({ phase: 'uncertain', message: 'Voice setup timed out. Check its status before recording again.' });
        pending.reject(new Error('Voice setup timed out. It may have completed; reconnect to check before retrying.'));
      }, 125000);
    });
  }
}
module.exports = { LocalVoice };
