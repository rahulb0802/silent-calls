// Opens the SSH tunnel to the GPU lip-reading server so nobody has to run `ssh -L` by hand.
// Same access as before: the server's port stays closed to the internet and the tunnel needs the SSH key.
// An existing tunnel (or anything already answering /health on the port) is reused, never replaced.
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

// Override with SILENT_SSH_HOST / SILENT_SSH_USER / SILENT_SSH_KEY when starting the app.
const DEFAULTS = {
  host: process.env.SILENT_SSH_HOST || '144.202.96.192',
  user: process.env.SILENT_SSH_USER || 'root',
  key: process.env.SILENT_SSH_KEY || path.join(os.homedir(), '.ssh', 'vultr_lipread'),
  remotePort: 8000,
};
const READY_TIMEOUT_MS = 15000;

/** True if the lip-reading server answers on 127.0.0.1:port. */
function healthy(port, timeoutMs = 1500) {
  return new Promise(resolve => {
    const req = http.get({ host: '127.0.0.1', port, path: '/health', timeout: timeoutMs }, res => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { if (body.length < 2000) body += chunk; });
      res.on('end', () => resolve(res.statusCode === 200 && body.includes('"ok"')));
    });
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.on('error', () => resolve(false));
  });
}

class Tunnel {
  constructor(config = DEFAULTS, { spawnFn = spawn, healthFn = healthy, exists = fs.existsSync } = {}) {
    this.config = config;
    this.spawn = spawnFn;
    this.healthy = healthFn;
    this.exists = exists;
    this.child = null;
    this.pending = null;
    this.stopped = false;
    this.lastError = '';
  }

  /** Make sure 127.0.0.1:localPort reaches the GPU server; start ssh if needed. Resolves {ok, mode, message}. */
  ensure(localPort = 8000) {
    if (!Number.isInteger(localPort) || localPort < 1024 || localPort > 65535) return Promise.resolve({ ok: false, mode: 'none', message: 'Invalid local port for the GPU tunnel.' });
    if (this.pending) return this.pending;
    this.stopped = false;
    this.pending = this.open(localPort).finally(() => { this.pending = null; });
    return this.pending;
  }

  async open(localPort) {
    if (await this.healthy(localPort)) return { ok: true, mode: this.child ? 'started' : 'existing', message: 'GPU reachable.' };
    if (!this.exists(this.config.key)) return { ok: false, mode: 'none', message: `SSH key not found at ${this.config.key}. Set SILENT_SSH_KEY or open the tunnel yourself.` };
    if (this.child) { this.child.kill(); this.child = null; } // running but not answering: start over
    this.lastError = '';
    const args = ['-i', this.config.key, '-N', '-L', `${localPort}:localhost:${this.config.remotePort}`,
      '-o', 'ExitOnForwardFailure=yes', '-o', 'ServerAliveInterval=15', '-o', 'ServerAliveCountMax=3',
      '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=accept-new', `${this.config.user}@${this.config.host}`];
    let child;
    try { child = this.spawn('ssh', args, { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true, shell: false }); }
    catch { return { ok: false, mode: 'none', message: 'Could not run ssh. Install the OpenSSH client, or open the tunnel yourself.' }; }
    this.child = child;
    child.stderr?.setEncoding?.('utf8');
    child.stderr?.on?.('data', text => { this.lastError = String(text).trim().split('\n').pop().slice(0, 300); });
    child.on('error', () => { if (this.child === child) this.child = null; });
    child.on('exit', () => { if (this.child === child) this.child = null; });
    for (let waited = 0; waited < READY_TIMEOUT_MS; waited += 500) {
      await new Promise(resolve => setTimeout(resolve, 500));
      if (this.stopped) return { ok: false, mode: 'none', message: 'The app is closing.' };
      if (this.child !== child) return { ok: false, mode: 'none', message: `SSH tunnel closed: ${this.lastError || 'check the key and your network'}.` };
      if (await this.healthy(localPort)) return { ok: true, mode: 'started', message: 'Opened the SSH tunnel to the GPU.' };
    }
    return { ok: false, mode: 'none', message: `The GPU did not answer through the tunnel within ${READY_TIMEOUT_MS / 1000} s.${this.lastError ? ` ${this.lastError}` : ''}` };
  }

  /** Close the tunnel this app opened (an external one is left alone). */
  stop() {
    this.stopped = true;
    if (this.child) { const old = this.child; this.child = null; old.kill(); }
  }
}

module.exports = { Tunnel, healthy, DEFAULTS };
