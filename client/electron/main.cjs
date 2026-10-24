const { app, BrowserWindow, ipcMain, screen, session, systemPreferences, shell, powerMonitor, protocol, net } = require('electron');
const path = require('node:path');
const {pathToFileURL}=require('node:url');
protocol.registerSchemesAsPrivileged([{scheme:'silent',privileges:{standard:true,secure:true,supportFetchAPI:true,corsEnabled:true,stream:true}}]);
const { createSetupService } = require('./setup-service.cjs');
const { LocalVoice } = require('./local-voice.cjs');
const { createGlobalHold } = require('./global-hold.cjs');
const { Tunnel } = require('./tunnel.cjs');
// Keep the opt-in capture window responsive while Meet/Zoom is foreground.
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
let mainWindow, widget, compactAt = null;
const voice = new LocalVoice(status => {
  for (const win of [mainWindow, widget]) {
    if (win && !win.isDestroyed() && !win.webContents.isDestroyed()) win.webContents.send('voice:status', status);
  }
});
const setup = createSetupService({app, systemPreferences, voice});
const tunnel = new Tunnel();
const audioHelp = {
  cartesia: 'https://play.cartesia.ai/voices',
  blackhole: 'https://existential.audio/blackhole/',
  vbcable: 'https://vb-audio.com/Cable/',
  zoom: 'https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0060836',
  meet: 'https://support.google.com/meet/answer/10409699',
  facetime: 'https://support.apple.com/guide/facetime/fctm26739220/mac',
};
function emitToWidget(channel, payload) { if (widget && !widget.isDestroyed()) widget.webContents.send(channel, payload); }
const hold = createGlobalHold({systemPreferences, emit: event => emitToWidget('hold:event', event), statusChanged: status => emitToWidget('hold:status', status)});
const devURL = process.env.ELECTRON_RENDERER_URL;
function trusted(contents) { return [mainWindow, widget].some(win => win && !win.isDestroyed() && win.webContents === contents); }
function load(win, hash = '') {
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', event => event.preventDefault());
  if (devURL) win.loadURL(`${devURL}/${hash}`); else win.loadURL(`silent://app/index.html${hash}`);
}
const icon = path.join(__dirname, '..', 'build', 'icon.png');
const preferences = { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true };
function createMain() {
  mainWindow = new BrowserWindow({ width: 1160, height: 800, minWidth: 900, minHeight: 690, title: 'Silent Calls', icon, backgroundColor: '#f7f8f4', webPreferences: preferences });
  load(mainWindow);
}
function openWidget() {
  if (widget && !widget.isDestroyed()) { widget.show(); return; }
  const area = screen.getPrimaryDisplay().workArea;
  widget = new BrowserWindow({ width: 390, height: Math.min(740, area.height - 48), x: area.x + area.width - 414, y: area.y + Math.max(24, area.height - 764), resizable: false, frame: false, alwaysOnTop: true, skipTaskbar: true, icon, backgroundColor: '#1c2624', webPreferences: { ...preferences, backgroundThrottling: false } });
  widget.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  widget.webContents.setBackgroundThrottling(false);
  widget.webContents.on('did-start-loading', () => hold.stop());
  widget.webContents.on('render-process-gone', () => hold.stop());
  widget.on('closed', () => { hold.stop(); widget = null; });
  load(widget, '#/widget');
}
app.whenReady().then(() => {
  const dist=path.resolve(__dirname,'../dist');
  protocol.handle('silent', request=>{
    const url=new URL(request.url);
    const filename=path.resolve(dist,`.${decodeURIComponent(url.pathname)}`);
    if(url.host!=='app' || !filename.startsWith(dist+path.sep))return new Response('Forbidden',{status:403});
    return net.fetch(pathToFileURL(filename).href);
  });
  const launcherPid = Number(process.env.SILENT_CALLS_LAUNCHER_PID);
  if (devURL && Number.isSafeInteger(launcherPid) && launcherPid > 1) {
    const watcher = setInterval(() => { try { process.kill(launcherPid, 0); } catch { app.quit(); } }, 1000);
    watcher.unref();
  }
  session.defaultSession.setPermissionRequestHandler((contents, permission, callback, details) => {
    callback(trusted(contents) && permission === 'media' && details.mediaTypes?.every(type => ['video', 'audio'].includes(type)) === true);
  });
  session.defaultSession.setPermissionCheckHandler((contents, permission) => trusted(contents) && permission === 'media');
  ipcMain.handle('widget:open', event => { if (trusted(event.sender)) openWidget(); });
  ipcMain.handle('widget:close', event => { if (widget && event.sender === widget.webContents) widget.close(); });
  // Compact companion: a short strip at the top centre of the screen, just under the webcam, sized to its
  // content (height in px); null goes back to the full panel at the bottom right.
  ipcMain.handle('widget:compact', (event, height) => {
    if (!widget || event.sender !== widget.webContents) return;
    const area = screen.getDisplayMatching(widget.getBounds()).workArea;
    if (height === null) {
      compactAt = null;
      widget.setBounds({ width: 390, height: Math.min(740, area.height - 48), x: area.x + area.width - 414, y: area.y + Math.max(24, area.height - 764) });
      return;
    }
    const width = 380, h = Math.max(72, Math.min(Math.round(Number(height) || 120), area.height - 48));
    const bounds = widget.getBounds();
    if (compactAt && bounds.width === width) compactAt = { x: bounds.x, y: bounds.y };  // keep where the user dragged it
    compactAt ||= { x: area.x + Math.round((area.width - width) / 2), y: area.y + 6 };
    widget.setBounds({ x: compactAt.x, y: compactAt.y, width, height: h });
  });
  ipcMain.handle('main:show', (event, route) => { if (trusted(event.sender)) { if (!mainWindow || mainWindow.isDestroyed()) createMain(); if(route==='workspace' || route==='audio-setup' || route==='library')load(mainWindow,`#/${route}`); mainWindow.show(); mainWindow.focus(); } });
  function localVoiceCaller(event) {
    if (!trusted(event.sender)) throw new Error('Desktop app window required.');
  }
  ipcMain.handle('setup:status', event => { localVoiceCaller(event); return setup.status(); });
  ipcMain.handle('setup:connect', event => { localVoiceCaller(event); return setup.connect(); });
  ipcMain.handle('setup:keyboard', event => {
    localVoiceCaller(event);
    if (process.platform === 'darwin') return shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility');
  });
  ipcMain.handle('tunnel:ensure', (event, port) => { localVoiceCaller(event); return tunnel.ensure(port); });
  ipcMain.handle('voice:status', event => { localVoiceCaller(event); return voice.snapshot(); });
  ipcMain.handle('voice:connect', (event, port) => { localVoiceCaller(event); return voice.connect(port); });
  ipcMain.handle('voice:disconnect', event => { localVoiceCaller(event); return voice.disconnect(); });
  ipcMain.handle('voice:say', (event, text) => { localVoiceCaller(event); return voice.say(text); });
  ipcMain.handle('voice:clone', (event, wav, name) => { localVoiceCaller(event); return voice.clone(wav, name); });
  ipcMain.handle('voice:decide', (event, input) => { localVoiceCaller(event); return voice.decide(input); });
  ipcMain.handle('voice:review', (event, vocab) => { localVoiceCaller(event); return voice.review(vocab); });
  ipcMain.handle('audio:help', (event, topic) => {
    localVoiceCaller(event);
    if (typeof topic !== 'string' || !Object.hasOwn(audioHelp, topic)) throw new Error('Unknown audio setup guide.');
    return shell.openExternal(audioHelp[topic]);
  });
  powerMonitor.on('suspend', () => voice.disconnect('Voice disconnected because the computer went to sleep.'));
  powerMonitor.on('lock-screen', () => voice.disconnect('Voice disconnected because the screen was locked.'));
  function widgetOnly(event) { return widget && !widget.isDestroyed() && event.sender === widget.webContents; }
  ipcMain.handle('hold:start', (event, key) => { if (!widgetOnly(event)) throw new Error('Widget required'); return hold.start(key); });
  ipcMain.handle('hold:stop', event => { if (!widgetOnly(event)) throw new Error('Widget required'); return hold.stop(); });
  ipcMain.handle('hold:status', event => { if (!widgetOnly(event)) throw new Error('Widget required'); return hold.getStatus(); });
  ipcMain.handle('hold:settings', (event, topic = 'accessibility') => {
    if (!widgetOnly(event)) return;
    if (!['accessibility', 'input-monitoring'].includes(topic)) throw new Error('Unknown keyboard permission.');
    if (process.platform === 'darwin') return shell.openExternal(`x-apple.systempreferences:com.apple.preference.security?${topic === 'input-monitoring' ? 'Privacy_ListenEvent' : 'Privacy_Accessibility'}`);
  });
  powerMonitor.on('suspend', () => hold.stop('Global capture disabled because the computer went to sleep. Enable the camera and key again.'));
  powerMonitor.on('lock-screen', () => hold.stop('Global capture disabled because the screen was locked. Enable the camera and key again.'));
  createMain();
  // Warm up in the background so Start is quick: the local voice service takes ~6 s to start (Python
  // imports), the SSH tunnel to the GPU a second or two.
  setTimeout(() => { setup.connect().catch(() => {}); tunnel.ensure().catch(() => {}); }, 300);
  app.on('activate', () => { if (!mainWindow || mainWindow.isDestroyed()) createMain(); });
});
app.on('window-all-closed', () => { voice.disconnect(); if (process.platform !== 'darwin') app.quit(); });

app.on('before-quit', () => { hold.stop(); voice.disconnect(); setup.stop(); tunnel.stop(); });
