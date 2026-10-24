// Dictation: press paste (Ctrl+V, or Cmd+V on macOS) in whatever app has focus. A separate process, like
// hook-worker.cjs, so a native-library failure can't take the desktop app down.
const { uIOhook, UiohookKey } = require('uiohook-napi');
try {
  uIOhook.keyTap(UiohookKey.V, [process.platform === 'darwin' ? UiohookKey.Meta : UiohookKey.Ctrl]);
  process.exit(0);
} catch { process.exit(1); }
