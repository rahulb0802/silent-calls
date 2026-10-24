export const FPS = 25;
export const PRE_ROLL_MS = 500;
export const POST_ROLL_MS = 300;
// Server keeps at most 375 frames / 15s; reserve room for pre-roll and tail.
export const MAX_HOLD_MS = 14_000;
const MAX_BYTES = 48 * 1024 * 1024;
export type Frame = { timestampMs: number; jpeg: string };
export type CaptureClip = {
  schemaVersion: 1; id: string; width: number; height: number; targetFps: number;
  pressedAtMs: number; releasedAtMs: number; preRollMs: number; postRollMs: number;
  endedBy: 'release' | 'limit'; frames: Frame[];
};
/** All timestamps use the renderer's monotonic performance clock. */
export class FrameBuffer {
  ring: Frame[] = [];
  private active: Frame[] | null = null;
  private pressed = 0;
  private id = '';
  get utteranceId() { return this.id; }
  private released: number | null = null;
  private bytes = 0;
  private limited = false;
  get capturing() { return this.active !== null; }
  get tail() { return this.released !== null; }
  get count() { return this.active?.length ?? 0; }
  push(frame: Frame) {
    this.ring.push(frame);
    this.ring = this.ring.filter(item => item.timestampMs >= frame.timestampMs - PRE_ROLL_MS);
    if (!this.active || frame.timestampMs <= this.pressed && this.active.some(item => item.timestampMs === frame.timestampMs)) return;
    const deadline = this.released === null ? this.pressed + MAX_HOLD_MS : this.released + POST_ROLL_MS;
    if (frame.timestampMs > deadline) return;
    if (this.bytes + frame.jpeg.length * 2 > MAX_BYTES) { this.limited = true; return; }
    this.active.push(frame); this.bytes += frame.jpeg.length * 2;
  }
  begin(now: number) {
    if (this.active) return false;
    const recent = this.ring.filter(frame => frame.timestampMs >= now - PRE_ROLL_MS && frame.timestampMs <= now);
    if (!recent.length || now - recent[recent.length - 1].timestampMs > 200) return false;
    this.active = [...recent]; this.bytes = recent.reduce((sum, frame) => sum + frame.jpeg.length * 2, 0);
    this.id = crypto.randomUUID(); this.pressed = now; this.released = null; this.limited = false;
    return true;
  }
  release(now: number) { if (this.active && this.released === null) this.released = now; }
  poll(now: number, width: number, height: number): CaptureClip | null {
    if (!this.active) return null;
    const timedOut = now >= this.pressed + MAX_HOLD_MS;
    if (!timedOut && !this.limited && (this.released === null || now < this.released + POST_ROLL_MS)) return null;
    const frames = this.active;
    const releasedAtMs = this.released ?? Math.min(now, this.pressed + MAX_HOLD_MS);
    const clip: CaptureClip = {
      schemaVersion: 1, id: this.id, width, height, targetFps: FPS,
      pressedAtMs: this.pressed, releasedAtMs,
      preRollMs: frames.length ? this.pressed - frames[0].timestampMs : 0,
      postRollMs: frames.length ? Math.max(0, frames[frames.length - 1].timestampMs - releasedAtMs) : 0,
      endedBy: timedOut || this.limited ? 'limit' : 'release', frames,
    };
    this.active = null; this.released = null; this.bytes = 0; this.limited = false;
    return clip;
  }
  cancel() { this.active = null; this.released = null; this.bytes = 0; this.ring = []; this.limited = false; }
}
