const { spawn } = require('node:child_process');
const fs = require('node:fs/promises');
const path = require('node:path');

// No wire-protocol changes: this starts the existing voice-only service.
function createSetupService({ app, safeStorage, systemPreferences, voice }) {
  const root = path.resolve(__dirname, '../..');
  const python = path.join(root, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
  const configPath = () => path.join(app.getPath('userData'), 'voice-config.enc');
  let child = null;
  let connecting = null;
  let stopping = false;
  async function available() {
    if (app.isPackaged) return false; // TODO(hackathon): bundle a signed Python service/runtime.
    try { await fs.access(python); await fs.access(path.join(root, 'silentcalls/app.py')); return true; }
    catch { return false; }
  }
  async function encryptionReady() {
    if (!['darwin', 'win32'].includes(process.platform)) return false;
    return safeStorage.isAsyncEncryptionAvailable
      ? safeStorage.isAsyncEncryptionAvailable()
      : safeStorage.isEncryptionAvailable();
  }
  async function readConfig() {
    try { await fs.access(configPath()); } catch { return null; }
    if (!await encryptionReady()) throw new Error('Unlock your system keychain and try again.');
    try {
      const data = await fs.readFile(configPath());
      const plain = safeStorage.decryptStringAsync
        ? (await safeStorage.decryptStringAsync(data)).result
        : safeStorage.decryptString(data);
      return JSON.parse(plain);
    } catch { throw new Error('Saved voice details could not be unlocked. Save your voice details again.'); }
  }
  async function status() {
    let saved = false;
    try { await fs.access(configPath()); saved = true; } catch {}
    return {
      platform: process.platform,
      canStartService: await available(),
      credentialsSaved: saved,
      keyboardAllowed: process.platform !== 'darwin' || systemPreferences.isTrustedAccessibilityClient(false),
    };
  }
  async function save(input) {
    if (!input || typeof input.apiKey !== 'string' || typeof input.voiceId !== 'string') throw new Error('Enter your Cartesia API key and voice ID.');
    const apiKey = input.apiKey.trim(), voiceId = input.voiceId.trim();
    if (!apiKey || apiKey.length > 512 || !/^[a-zA-Z0-9_-]{1,128}$/.test(voiceId)) throw new Error('Enter a valid key and the full voice ID copied from Cartesia.');
    if (!await encryptionReady()) throw new Error('Secure system storage is unavailable. Unlock your keychain, or use the existing .env setup.');
    const plain = JSON.stringify({ apiKey, voiceId });
    const encrypted = safeStorage.encryptStringAsync
      ? await safeStorage.encryptStringAsync(plain)
      : safeStorage.encryptString(plain);
    await fs.mkdir(path.dirname(configPath()), { recursive: true });
    await fs.writeFile(`${configPath()}.tmp`, encrypted, { mode: 0o600 });
    await fs.rename(`${configPath()}.tmp`, configPath());
    return status();
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
        const config = await readConfig();
        const env = { ...process.env, HOST: '127.0.0.1', PORT: '8765' };
        if (config) {
          env.CARTESIA_API_KEY = config.apiKey;
          env.CARTESIA_VOICE_ID = config.voiceId;
        }
        env.VIRTUAL_MIC_DEVICE = process.platform === 'win32' ? 'CABLE Input' : 'BlackHole 2ch';
        // Never log or relay child output: provider errors can contain sensitive data.
        if (stopping) throw new Error('The app is closing.');
        const processChild = spawn(python, ['-m', 'silentcalls.app', '--no-captions', '--no-jev', '--no-claude'], { cwd: root, env, stdio: 'ignore', windowsHide: true, shell: false });
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
  return { status, save, connect, stop };
}
module.exports = { createSetupService };
