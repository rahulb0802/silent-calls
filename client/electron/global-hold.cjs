const { fork } = require('node:child_process');
const path = require('node:path');
const keys = ['T', 'F8', 'F9', 'F10', 'CtrlRight'];
function createGlobalHold({ systemPreferences, emit, statusChanged }) {
  let child = null, held = false, safetyTimer = null, startupTimer = null;
  let status = { active: false, key: 'T', message: 'Global key is off.', receivedKey: false };
  function update(patch) { status = { ...status, ...patch }; statusChanged(status); return status; }
  function stop(message = 'Global key is off.') {
    clearTimeout(safetyTimer); clearTimeout(startupTimer);
    const old = child; child = null;
    if (old) old.kill();
    const wasActive = Boolean(old) || held || status.active;
    held = false; if (wasActive) emit({ type: 'cancel' });
    return update({ active: false, message });
  }
  function start(key) {
    stop();
    if (!keys.includes(key)) return update({ message: 'Choose one of the available hold keys.' });
    status.key = key; status.receivedKey = false;
    if (process.platform === 'darwin' && !systemPreferences.isTrustedAccessibilityClient(true)) {
      return update({ message: 'Allow Electron in System Settings → Privacy & Security → Accessibility, then retry. macOS may also request Input Monitoring.' });
    }
    try {
      child = fork(path.join(__dirname, 'hook-worker.cjs'), [key], {
        execPath: process.execPath,
        env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
        stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
      });
      const worker = child;
      worker.on('message', event => {
        if (child !== worker) return;
        if (event?.type === 'ready') { clearTimeout(startupTimer); update({ active: true, message: `Listener started. Hold ${key === 'CtrlRight' ? 'Right Ctrl' : key} in Meet to confirm access. If nothing happens, allow Accessibility AND Input Monitoring, then quit and reopen Electron.` }); }
        if (event?.type === 'error') stop('Keyboard hook could not start. Check Accessibility and Input Monitoring, restart Electron, then retry.');
        if (!status.active) return;
        if(event?.type==='cancel' && held){stop('Capture canceled with Escape. Enable the camera and global key to resume.');return;}
        if (event?.type === 'down' && !held) {
          held = true; update({ receivedKey: true, message: `Global ${key === 'CtrlRight' ? 'Right Ctrl' : key} received. Release to finish capturing. Meet must stay unmuted.` }); emit({ type: 'down' });
          safetyTimer = setTimeout(() => stop('Capture stopped after 30 seconds. Release the key and enable it again.'), 30000);
        }
        if (event?.type === 'up' && held) { held = false; clearTimeout(safetyTimer); update({ message: `Global ${key === 'CtrlRight' ? 'Right Ctrl' : key} released. Hold again for your next phrase.` }); emit({ type: 'up' }); }
      });
      worker.on('error', () => { if (child === worker) stop('Could not load the native keyboard hook. Reinstall dependencies and retry.'); });
      worker.on('exit', () => { if (child === worker) stop('Keyboard hook stopped. Check macOS permissions, restart Electron, then retry.'); });
      startupTimer = setTimeout(() => { if (child === worker && !status.active) stop('Keyboard hook did not start. Check system permissions and retry.'); }, 5000);
      return update({ active: false, message: 'Starting global keyboard hook…' });
    } catch { return stop('Could not start the global keyboard hook. Try again.'); }
  }
  return { start, stop, getStatus: () => status };
}
module.exports = { createGlobalHold };
