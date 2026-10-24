import type {Frame} from '../capture/buffer';

const FRAME_MS = 40;
const MAX_QUEUED_FRAMES = 375;
const MAX_VIDEO_BYTES = 20 * 1024 * 1024;

/** Records the existing pre-roll, live frames, and post-roll as one VP8 stream. */
export class WebmEncoder {
  private readonly canvas = document.createElement('canvas');
  private readonly stream: MediaStream;
  private readonly track: CanvasCaptureMediaStreamTrack;
  private readonly recorder: MediaRecorder;
  private readonly frames: Frame[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private sending: Promise<void> = Promise.resolve();
  private drawing = false;
  private ending = false;
  private closed = false;
  private bytes = 0;
  private encodedFrames = 0;
  private resolveEnd: (() => void) | null = null;
  private rejectEnd: ((reason: Error) => void) | null = null;

  static supported(): boolean {
    return typeof MediaRecorder !== 'undefined' &&
      MediaRecorder.isTypeSupported('video/webm;codecs=vp8') &&
      typeof HTMLCanvasElement.prototype.captureStream === 'function';
  }

  constructor(width: number, height: number, private readonly send: (bytes: ArrayBuffer) => void,
              private readonly fail: (error: Error) => void) {
    this.canvas.height = 480;
    this.canvas.width = Math.max(2, Math.round((480 * width / height) / 2) * 2);
    this.stream = this.canvas.captureStream(0);
    const track = this.stream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack | undefined;
    if (!track || typeof track.requestFrame !== 'function') {
      this.stream.getTracks().forEach(item => item.stop());
      throw new Error('This browser cannot record webcam frames on demand.');
    }
    this.track = track;
    try {
      this.recorder = new MediaRecorder(this.stream, {
        mimeType: 'video/webm;codecs=vp8', videoBitsPerSecond: 2_000_000,
      });
    } catch (reason) {
      this.stopTrack();
      throw reason;
    }
    this.recorder.ondataavailable = event => {
      if (this.closed || !event.data.size) return;
      this.bytes += event.data.size;
      if (this.bytes > MAX_VIDEO_BYTES) {
        this.abort(new Error('The WebM capture exceeded 20 MB. Mouth a shorter phrase.'));
        return;
      }
      this.sending = this.sending.then(async () => {
        const data = await event.data.arrayBuffer();
        if (!this.closed) this.send(data);
      }).catch(reason => this.abort(reason instanceof Error ? reason : new Error('Could not send WebM video.')));
    };
    this.recorder.onerror = () => this.abort(new Error('WebM recording failed. Enable the camera and try again.'));
    this.recorder.onstop = () => {
      this.stopTrack();
      void this.sending.then(() => {
        if (this.closed) return;
        if (!this.encodedFrames || !this.bytes) throw new Error('No WebM video was recorded.');
        this.closed = true;
        this.resolveEnd?.();
      }).catch(reason => this.abort(reason instanceof Error ? reason : new Error('WebM upload failed.')));
    };
    try {
      this.recorder.start(100);
    } catch (reason) {
      this.stopTrack();
      throw reason;
    }
    this.timer = setInterval(() => { void this.drawNext(); }, FRAME_MS);
  }

  add(frame: Frame): void {
    if (this.closed || this.ending) return;
    if (this.frames.length >= MAX_QUEUED_FRAMES) {
      this.abort(new Error('The video encoder fell behind. Try a shorter phrase.'));
      return;
    }
    this.frames.push(frame);
  }

  finish(): Promise<void> {
    if (this.closed) return Promise.reject(new Error('WebM capture was canceled.'));
    this.ending = true;
    return new Promise<void>((resolve, reject) => {
      this.resolveEnd = resolve;
      this.rejectEnd = reject;
      if (!this.drawing && !this.frames.length) this.stopRecorder();
    });
  }

  cancel(): void {
    this.closed = true;
    this.frames.length = 0;
    this.clearTimer();
    this.recorder.ondataavailable = null;
    this.recorder.onstop = null;
    this.recorder.onerror = null;
    if (this.recorder.state !== 'inactive') this.recorder.stop();
    this.stopTrack();
    this.rejectEnd?.(new Error('WebM capture was canceled.'));
    this.rejectEnd = null;
  }

  private async drawNext(): Promise<void> {
    if (this.closed || this.drawing || !this.frames.length) return;
    this.drawing = true;
    const frame = this.frames.shift()!;
    try {
      const image = new Image();
      image.src = frame.jpeg;
      await image.decode();
      if (this.closed) return;
      const context = this.canvas.getContext('2d', {alpha: false});
      if (!context) throw new Error('The video encoder cannot draw camera frames.');
      context.drawImage(image, 0, 0, this.canvas.width, this.canvas.height);
      this.track.requestFrame();
      this.encodedFrames++;
    } catch (reason) {
      this.abort(reason instanceof Error ? reason : new Error('Could not encode a camera frame.'));
    } finally {
      this.drawing = false;
      if (this.ending && !this.frames.length && !this.closed) this.stopRecorder();
    }
  }

  private stopRecorder(): void {
    this.clearTimer();
    if (this.recorder.state !== 'inactive') this.recorder.stop();
  }

  private clearTimer(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private stopTrack(): void {
    this.stream.getTracks().forEach(track => track.stop());
  }

  private abort(error: Error): void {
    if (this.closed) return;
    this.cancel();
    this.fail(error);
  }
}
