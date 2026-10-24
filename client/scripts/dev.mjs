import { createServer } from 'vite';
import { spawn } from 'node:child_process';
import path from 'node:path';
import electron from 'electron';
const server = await createServer();
await server.listen();
const env = { ...process.env, ELECTRON_RENDERER_URL: 'http://127.0.0.1:5173', SILENT_CALLS_LAUNCHER_PID: String(process.pid) };
// LaunchServices gives macOS a normal app identity for privacy permission checks.
const child = process.platform === 'darwin'
  ? spawn('/usr/bin/open', ['-n', '-W', path.resolve(path.dirname(electron), '../..'), '--env', `ELECTRON_RENDERER_URL=${env.ELECTRON_RENDERER_URL}`, '--env', `SILENT_CALLS_LAUNCHER_PID=${process.pid}`, '--args', process.cwd()], { stdio: 'inherit' })
  : spawn(electron, ['.'], { stdio: 'inherit', env });
let stopping = false;
async function stop(code = 0) { if (stopping) return; stopping = true; child.kill(); await server.close(); process.exit(code); }
child.on('exit', code => stop(code ?? 0));
child.on('error', error => { console.error(error); stop(1); });
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
