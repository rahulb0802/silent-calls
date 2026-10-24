const { spawn } = require('node:child_process');
const fs = require('node:fs/promises');
const path = require('node:path');

// No wire-protocol changes: this starts the existing voice-only service.
function createSetupService({ app, systemPreferences, voice }) {
  const root = path.resolve(__dirname, '../..');
  const python = path.join(root, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
  let child = null;
  let connecting = null;
  let stopping = false;
  async function available() {
    if (app.isPackaged) return false; // TODO(hackathon): bundle a signed Python service/runtime.
    try { await fs.access(python); await fs.access(path.join(root, 'silentcalls/app.py')); return true; }
    catch { return false; }
  }
  async function status() {
    return {
      platform: process.platform,
      canStartService: await available(),
      keyboardAllowed: process.platform !== 'darwin' || systemPreferences.isTrustedAccessibilityClient(false),
    };
  }
  async function connect() {
    if (stopping) throw new Error('The app is closing. Reopen it to connect.');
    if (voice.snapshot().connection === 'connected') return voice.snapshot();
    if (connecting) return connecting;
    connecting = (async () => {
      const attempt = voice.connect(8765);
      await attempt;
      // connect() starts asynchronously; wait for its existing bounded timeout.
      for (let tick = 0; tick < 85 && voice.snapshot().connection === 'connecting'; tick++) await new Promise(resolve => setTimeout(resolve, 100));
      if (voice.snapshot().connection === 'connected') return voice.snapshot();
      if (stopping) throw new Error('The app is closing.');
      if (!await available()) throw new Error('The local Python service is not installed here. Follow Advanced setup to install it or start the service separately.');
      if (!child) {
        const env = { ...process.env, HOST: '127.0.0.1', PORT: '8765' };
        env.VIRTUAL_MIC_DEVICE = process.platform === 'win32' ? 'CABLE Input' : 'BlackHole 2ch';
        // Never log or relay child output: provider errors can contain sensitive data.
        if (stopping) throw new Error('The app is closing.');
        const processChild = spawn(python, ['-m', 'silentcalls.app'], { cwd: root, env, stdio: 'ignore', windowsHide: true, shell: false });
        child = processChild;
        processChild.on('error', () => { if (child === processChild) child = null; });
        processChild.on('exit', () => {
          if (child === processChild) { child = null; voice.disconnect('Voice service stopped. Check your voice details and audio driver, then reconnect.'); }
        });
      }
      for (let tick = 0; tick < 30; tick++) {
        if (stopping || !child) break;
        await new Promise(resolve => setTimeout(resolve, 500));
        if (voice.snapshot().connection !== 'connecting') voice.connect(8765);
        if (voice.snapshot().connection === 'connected') return voice.snapshot();
      }
      if (voice.snapshot().connection === 'connected') return voice.snapshot();
      throw new Error('Could not start voice. Check that BlackHole / VB-Cable and the Python dependencies are installed, and your Cartesia details are correct. Then reconnect.');
    })().finally(() => { connecting = null; });
    return connecting;
  }
  function stop() { stopping = true; if (child) { const old = child; child = null; old.kill(); } }
  return { status, connect, stop };
}
module.exports = { createSetupService };
