const { app, BrowserWindow, ipcMain, screen, session, systemPreferences, shell, powerMonitor, protocol, net } = require('electron');
const path = require('node:path');
const {pathToFileURL}=require('node:url');
protocol.registerSchemesAsPrivileged([{scheme:'silent',privileges:{standard:true,secure:true,supportFetchAPI:true,corsEnabled:true,stream:true}}]);
const { createGlobalHold } = require('./global-hold.cjs');
let mainWindow, widget;
function emitToWidget(channel, payload) { if (widget && !widget.isDestroyed()) widget.webContents.send(channel, payload); }
const hold = createGlobalHold({systemPreferences, emit: event => emitToWidget('hold:event', event), statusChanged: status => emitToWidget('hold:status', status)});
const devURL = process.env.ELECTRON_RENDERER_URL;
function trusted(contents) { return [mainWindow, widget].some(win => win && !win.isDestroyed() && win.webContents === contents); }
function load(win, hash = '') {
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', event => event.preventDefault());
  if (devURL) win.loadURL(`${devURL}/${hash}`); else win.loadURL(`silent://app/index.html${hash}`);
}
const preferences = { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true };
function createMain() {
  mainWindow = new BrowserWindow({ width: 1160, height: 800, minWidth: 900, minHeight: 690, title: 'Silent Calls', backgroundColor: '#f7f8f4', webPreferences: preferences });
  load(mainWindow);
}
function openWidget() {
  if (widget && !widget.isDestroyed()) { widget.show(); return; }
  const area = screen.getPrimaryDisplay().workArea;
  widget = new BrowserWindow({ width: 390, height: Math.min(740, area.height - 48), x: area.x + area.width - 414, y: area.y + Math.max(24, area.height - 764), resizable: false, frame: false, alwaysOnTop: true, skipTaskbar: true, backgroundColor: '#1c2624', webPreferences: preferences });
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
  ipcMain.handle('main:show', (event, route) => { if (trusted(event.sender)) { if (!mainWindow || mainWindow.isDestroyed()) createMain(); if(route==='workspace')load(mainWindow,'#/workspace'); mainWindow.show(); mainWindow.focus(); } });
  function widgetOnly(event) { return widget && !widget.isDestroyed() && event.sender === widget.webContents; }
  ipcMain.handle('hold:start', (event, key) => { if (!widgetOnly(event)) throw new Error('Widget required'); return hold.start(key); });
  ipcMain.handle('hold:stop', event => { if (!widgetOnly(event)) throw new Error('Widget required'); return hold.stop(); });
  ipcMain.handle('hold:status', event => { if (!widgetOnly(event)) throw new Error('Widget required'); return hold.getStatus(); });
  ipcMain.handle('hold:settings', event => {
    if (!widgetOnly(event)) return;
    if (process.platform === 'darwin') return shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility');
  });
  powerMonitor.on('suspend', () => hold.stop('Global capture disabled because the computer went to sleep. Enable the camera and key again.'));
  powerMonitor.on('lock-screen', () => hold.stop('Global capture disabled because the screen was locked. Enable the camera and key again.'));
  createMain();
  app.on('activate', () => { if (!mainWindow || mainWindow.isDestroyed()) createMain(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

app.on('before-quit', () => hold.stop());
