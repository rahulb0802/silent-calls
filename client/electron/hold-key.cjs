// Gate repeats and match only the configured key. No other keystrokes leave this module.
class HoldKey {
  constructor(keycode, emit) { this.keycode = keycode; this.emit = emit; this.held = false; }
  down(keycode) { if (keycode !== this.keycode || this.held) return; this.held = true; this.emit('down'); }
  up(keycode) { if (keycode !== this.keycode || !this.held) return; this.held = false; this.emit('up'); }
}
module.exports = { HoldKey };
