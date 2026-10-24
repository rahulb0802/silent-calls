// Turns a video frame plus the landmarks mouth-tracking.ts already found into a CameraSample. Pixels are read
// from two tiny canvases (the frame at 160x90, the mouth at 64x32) and dropped right away: nothing is kept
// or sent anywhere.
import {cropPatch, geometry, measurePatch, regionMean, type CameraSample} from './signals';

type Point = {x: number; y: number};
const FRAME_W = 160, FRAME_H = 90, MOUTH_W = 64, MOUTH_H = 32;
export const SAMPLE_MS = 200;  // five looks a second: lighting and posture change slowly

export class CameraSampler {
  private frame = document.createElement('canvas');
  private mouth = document.createElement('canvas');
  private frameCtx: CanvasRenderingContext2D | null;
  private mouthCtx: CanvasRenderingContext2D | null;
  private last = 0;
  constructor() {
    this.frame.width = FRAME_W; this.frame.height = FRAME_H; this.mouth.width = MOUTH_W; this.mouth.height = MOUTH_H;
    this.frameCtx = this.frame.getContext('2d', {willReadFrequently: true});
    this.mouthCtx = this.mouth.getContext('2d', {willReadFrequently: true});
  }

  /** A sample at most every SAMPLE_MS; null in between. */
  sample(video: HTMLVideoElement, face: Point[] | null, pose: {yaw: number; pitch: number} | null, now: number, fps: number): CameraSample | null {
    if (now - this.last < SAMPLE_MS) return null;
    this.last = now;
    const W = video.videoWidth, H = video.videoHeight;
    const base: CameraSample = {t: now, face: false, frameW: W, frameH: H, fps, frozen: false};
    if (!face || face.length < 300 || !W || !H) return base;
    const g = geometry(face, W / H);
    const s: CameraSample = {...base, face: true, faceBox: g.faceBox, mouthBox: g.mouthBox, eyeDist: g.eyeDist,
      mouthPx: g.mouthBox.w * W / 1.3, yaw: pose?.yaw, pitch: pose?.pitch, roll: g.roll};
    const fc = this.frameCtx, mc = this.mouthCtx;
    if (!fc || !mc) return s;
    fc.drawImage(video, 0, 0, FRAME_W, FRAME_H);
    const img = fc.getImageData(0, 0, FRAME_W, FRAME_H).data;
    const facePatch = cropPatch(img, FRAME_W, FRAME_H, g.faceBox);
    const m = g.mouthBox, sx = Math.max(0, m.x * W), sy = Math.max(0, m.y * H);
    const sw = Math.min(W - sx, m.w * W), sh = Math.min(H - sy, m.h * H);
    if (sw < 4 || sh < 4) return s;
    mc.drawImage(video, sx, sy, sw, sh, 0, 0, MOUTH_W, MOUTH_H);
    const mouth = measurePatch(mc.getImageData(0, 0, MOUTH_W, MOUTH_H).data, MOUTH_W, MOUTH_H);
    const [a, b] = g.cheeks.map(box => regionMean(img, FRAME_W, FRAME_H, box));
    const cheek = (a + b) / 2;
    s.light = {
      face: measurePatch(facePatch.data, facePatch.w, facePatch.h),
      frameMean: regionMean(img, FRAME_W, FRAME_H, {x: 0, y: 0, w: 1, h: 1}),
      cheekRatio: Math.max(a, b) > 1 ? Math.min(a, b) / Math.max(a, b) : 1,
      mouth, mouthCheek: cheek > 1 ? mouth.mean / cheek : 1,
    };
    return s;
  }
}
