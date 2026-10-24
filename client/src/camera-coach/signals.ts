// Camera coach, per-frame part: what one look at the webcam says about lighting, framing, pose and the
// mouth. Built from the MediaPipe landmarks the app already computes (mouth-tracking.ts) plus a few pixel
// statistics of small patches, a few times a second. Pure functions, so they are testable without a camera.

export type Box = {x: number; y: number; w: number; h: number};  // fractions of the frame
export type Patch = {mean: number; p10: number; p90: number; clip: number; std: number; sharp: number};
export type Light = {
  face: Patch;          // the face box
  frameMean: number;    // the whole frame (backlight: a bright frame around a dark face)
  cheekRatio: number;   // darker cheek / brighter cheek, 1 = even
  mouth: Patch;         // the mouth box, at full resolution
  mouthCheek: number;   // mouth mean / cheek mean: lips, teeth and the mouth's shadow are darker than skin
};
export type CameraSample = {
  t: number;
  face: boolean;
  frameW: number; frameH: number;  // video size in pixels
  fps: number;                     // frames the capture loop actually got, per second
  frozen: boolean;                 // the video has not advanced for a while
  faceBox?: Box; mouthBox?: Box;
  eyeDist?: number;                // outer eye corners, fraction of the frame width (the server flags < 0.04)
  mouthPx?: number;                // mouth width in source pixels
  yaw?: number; pitch?: number; roll?: number;  // degrees
  light?: Light;
};

/** Pixel statistics of an RGBA patch on the luma channel: mean, 10th/90th percentile, clipped share,
 * spread, and sharpness (mean absolute Laplacian over the spread, so it does not depend on brightness). */
export function measurePatch(data: Uint8ClampedArray, w: number, h: number): Patch {
  const n = w * h;
  if (!n) return {mean: 0, p10: 0, p90: 0, clip: 0, std: 0, sharp: 0};
  const luma = new Float32Array(n);
  const hist = new Uint32Array(256);
  let sum = 0, sq = 0, clip = 0;
  for (let i = 0; i < n; i++) {
    const y = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
    luma[i] = y; sum += y; sq += y * y; hist[Math.min(255, y | 0)]++;
    if (y >= 250) clip++;
  }
  const mean = sum / n, std = Math.sqrt(Math.max(0, sq / n - mean * mean));
  const pct = (f: number) => { let acc = 0; for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= f * n) return v; } return 255; };
  let lap = 0, count = 0;
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x;
    lap += Math.abs(4 * luma[i] - luma[i - 1] - luma[i + 1] - luma[i - w] - luma[i + w]); count++;
  }
  return {mean, p10: pct(0.1), p90: pct(0.9), clip: clip / n, std, sharp: count && std > 1 ? lap / count / std : 0};
}

/** Mean luma of a sub-rectangle (fractions of the image) of an RGBA image. */
export function regionMean(data: Uint8ClampedArray, w: number, h: number, box: Box): number {
  const x0 = Math.max(0, Math.floor(box.x * w)), x1 = Math.min(w, Math.ceil((box.x + box.w) * w));
  const y0 = Math.max(0, Math.floor(box.y * h)), y1 = Math.min(h, Math.ceil((box.y + box.h) * h));
  let sum = 0, n = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const i = (y * w + x) * 4; sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]; n++;
  }
  return n ? sum / n : 0;
}

/** Sub-box of an RGBA image as its own patch. */
export function cropPatch(data: Uint8ClampedArray, w: number, h: number, box: Box): {data: Uint8ClampedArray; w: number; h: number} {
  const x0 = Math.max(0, Math.floor(box.x * w)), x1 = Math.min(w, Math.ceil((box.x + box.w) * w));
  const y0 = Math.max(0, Math.floor(box.y * h)), y1 = Math.min(h, Math.ceil((box.y + box.h) * h));
  const cw = Math.max(0, x1 - x0), ch = Math.max(0, y1 - y0), out = new Uint8ClampedArray(cw * ch * 4);
  for (let y = 0; y < ch; y++) out.set(data.subarray(((y0 + y) * w + x0) * 4, ((y0 + y) * w + x1) * 4), y * cw * 4);
  return {data: out, w: cw, h: ch};
}

type Point = {x: number; y: number};
// MediaPipe face mesh indices
const EYE_OUTER_R = 33, EYE_OUTER_L = 263, MOUTH_R = 61, MOUTH_L = 291, LIP_TOP = 0, LIP_BOTTOM = 17;
const CHEEK_R = 50, CHEEK_L = 280;

/** Face and mouth boxes, eye distance (fraction of the frame width) and head roll from the 478 face
 * landmarks (normalized coordinates); `aspect` is the frame's width / height. */
export function geometry(face: Point[], aspect: number) {
  let x0 = 1, y0 = 1, x1 = 0, y1 = 0;
  for (const p of face) { if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x; if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y; }
  const mx0 = Math.min(face[MOUTH_R].x, face[MOUTH_L].x), mx1 = Math.max(face[MOUTH_R].x, face[MOUTH_L].x);
  const my0 = face[LIP_TOP].y, my1 = face[LIP_BOTTOM].y;
  // pad the mouth box a little: the lips' outline plus a margin, as the server's crop does
  const mw = mx1 - mx0, mh = Math.max(my1 - my0, mw * 0.35);
  const mouthBox = {x: mx0 - mw * 0.15, y: my0 - mh * 0.2, w: mw * 1.3, h: mh * 1.4};
  const eyes = {dx: face[EYE_OUTER_L].x - face[EYE_OUTER_R].x, dy: (face[EYE_OUTER_L].y - face[EYE_OUTER_R].y) / aspect};
  const cheek = (p: Point, s: number): Box => ({x: p.x - s / 2, y: p.y - s / 2, w: s, h: s});
  const size = (x1 - x0) * 0.12;
  return {
    faceBox: {x: x0, y: y0, w: x1 - x0, h: y1 - y0}, mouthBox,
    eyeDist: Math.hypot(eyes.dx, eyes.dy), roll: Math.atan2(eyes.dy, eyes.dx) * 180 / Math.PI,
    cheeks: [cheek(face[CHEEK_R], size), cheek(face[CHEEK_L], size)] as [Box, Box],
  };
}
