const { contextBridge, ipcRenderer } = require('electron');
function subscribe(channel, callback) {
  const listener = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}
contextBridge.exposeInMainWorld('desktop', {
  openWidget: () => ipcRenderer.invoke('widget:open'),
  closeWidget: () => ipcRenderer.invoke('widget:close'),
  setCompact: (height) => ipcRenderer.invoke('widget:compact', height),
  showMain: route => ipcRenderer.invoke('main:show', route),
  startGlobalHold: key => ipcRenderer.invoke('hold:start', key),
  stopGlobalHold: () => ipcRenderer.invoke('hold:stop'),
  getGlobalHoldStatus: () => ipcRenderer.invoke('hold:status'),
  openKeyboardSettings: topic => ipcRenderer.invoke('hold:settings', topic),
  getSetupStatus: () => ipcRenderer.invoke('setup:status'),
  connectSetupVoice: () => ipcRenderer.invoke('setup:connect'),
  openSetupKeyboardSettings: () => ipcRenderer.invoke('setup:keyboard'),
  ensureTunnel: port => ipcRenderer.invoke('tunnel:ensure', port),
  getVoiceStatus: () => ipcRenderer.invoke('voice:status'),
  connectVoice: port => ipcRenderer.invoke('voice:connect', port),
  disconnectVoice: () => ipcRenderer.invoke('voice:disconnect'),
  speakText: text => ipcRenderer.invoke('voice:say', text),
  cloneVoice: (wav, name) => ipcRenderer.invoke('voice:clone', wav, name),
  decide: input => ipcRenderer.invoke('voice:decide', input),
  reviewCall: vocab => ipcRenderer.invoke('voice:review', vocab),
  onVoiceStatus: callback => subscribe('voice:status', callback),
  openAudioHelp: topic => ipcRenderer.invoke('audio:help', topic),
  onGlobalHold: callback => subscribe('hold:event', callback),
  onGlobalHoldStatus: callback => subscribe('hold:status', callback),
});
