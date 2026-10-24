// Isolate native-library failures from the desktop app.
const { uIOhook, UiohookKey } = require('uiohook-napi');
const { HoldKey } = require('./hold-key.cjs');
const allowed = ['T', 'F8', 'F9', 'F10', 'CtrlRight'];
const selected = process.argv[2];
if (!allowed.includes(selected)) process.exit(1);
const gate = new HoldKey(UiohookKey[selected], type => process.send?.({ type }));
uIOhook.on('keydown', event => {
  if(event.keycode===UiohookKey.Escape && gate.held){process.send?.({type:'cancel'});return;}
  if (selected === 'T' && (event.ctrlKey || event.metaKey || event.altKey)) return;
  gate.down(event.keycode);
});
uIOhook.on('keyup', event => gate.up(event.keycode));
process.on('disconnect', () => process.exit(0));
try { uIOhook.start(); process.send?.({ type: 'ready' }); }
catch { process.send?.({ type: 'error' }); process.exit(1); }
