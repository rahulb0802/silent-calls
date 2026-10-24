"""Frames -> face landmarks -> 96x96 grayscale mouth crop, exactly as in the feasibility test.

Face detection is MediaPipe (full-range model, falling back to short-range only if it finds no face in
any frame), and the crop is AutoAVSR's mean-face similarity warp. Frames are RGB uint8 (H, W, 3).
"""

import shutil
import subprocess

import av
import cv2
import numpy as np

from .paths import MODEL_FPS, add_vsr_to_path

add_vsr_to_path()
import mediapipe as mp  # noqa: E402
from pipelines.detectors.mediapipe.video_process import VideoProcess  # noqa: E402

MAX_HEIGHT = 720  # the feasibility test normalized every clip to <= 720p before detection

Landmarks = np.ndarray | None  # (4, 2) int: right eye, left eye, nose tip, mouth centre


class FaceDetector:
    """Not thread-safe: use one per worker thread."""

    def __init__(self) -> None:
        fd = mp.solutions.face_detection
        self.full = fd.FaceDetection(min_detection_confidence=0.5, model_selection=1)
        self.short = fd.FaceDetection(min_detection_confidence=0.5, model_selection=0)

    @staticmethod
    def _detect(detector, frame: np.ndarray) -> Landmarks:
        res = detector.process(frame)
        if not res.detections:
            return None
        ih, iw = frame.shape[:2]
        best, best_size = None, -1
        for det in res.detections:
            box = det.location_data.relative_bounding_box
            size = box.width * iw + box.height * ih
            if size > best_size:
                kp = det.location_data.relative_keypoints
                best = np.array([[int(kp[i].x * iw), int(kp[i].y * ih)] for i in range(4)])
                best_size = size
        return best

    def full_range(self, frame: np.ndarray) -> Landmarks:
        return self._detect(self.full, frame)

    def short_range(self, frame: np.ndarray) -> Landmarks:
        return self._detect(self.short, frame)

    def detect_all(self, frames: list[np.ndarray]) -> list[Landmarks]:
        lm = [self.full_range(f) for f in frames]
        if all(x is None for x in lm):
            lm = [self.short_range(f) for f in frames]
        return lm


_video_process = VideoProcess(convert_gray=True)


def crop_mouth(frames: list[np.ndarray], landmarks: list[Landmarks]) -> np.ndarray:
    """(T, 96, 96) uint8. Raises ValueError when no face was found or the face is too far off-centre."""
    if all(x is None for x in landmarks):
        raise ValueError("no_face")
    try:
        crop = _video_process(list(frames), list(landmarks))
    except Exception as e:  # "too much bias in height/width": face too close to the frame edge
        raise ValueError(f"crop_failed: {e}") from e
    if crop is None:
        raise ValueError("no_face")
    return crop


def limit_height(frame: np.ndarray, max_height: int = MAX_HEIGHT) -> np.ndarray:
    h, w = frame.shape[:2]
    if h <= max_height:
        return frame
    new_w = int(round(w * max_height / h / 2)) * 2
    return cv2.resize(frame, (new_w, max_height), interpolation=cv2.INTER_AREA)


def decode_jpeg(jpeg: bytes) -> np.ndarray:
    bgr = cv2.imdecode(np.frombuffer(jpeg, np.uint8), cv2.IMREAD_COLOR)
    if bgr is None:
        raise ValueError("bad_jpeg")
    return limit_height(cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB))


def face_box(det: FaceDetector, frame: np.ndarray) -> tuple[float, float, float, float] | None:
    """Largest face's bounding box (x, y, w, h) in pixels, or None."""
    res = det.full.process(frame)
    if not res.detections:
        return None
    ih, iw = frame.shape[:2]
    b = max((d.location_data.relative_bounding_box for d in res.detections), key=lambda b: b.width * b.height)
    return b.xmin * iw, b.ymin * ih, b.width * iw, b.height * ih


def encode_jpeg(frame: np.ndarray, quality: int = 80, gray: bool = False) -> bytes:
    img = cv2.cvtColor(frame, cv2.COLOR_RGB2GRAY) if gray else cv2.cvtColor(frame, cv2.COLOR_RGB2BGR)
    ok, buf = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, quality])
    assert ok
    return buf.tobytes()


def decode_webm(data: bytes, max_height: int = MAX_HEIGHT) -> list[np.ndarray]:
    """Decode a MediaRecorder webm (all chunks of one recording, concatenated) to RGB frames at a constant
    25 fps: for each 40 ms slot, the most recent frame (like ffmpeg's fps filter)."""
    import io

    out: list[np.ndarray] = []
    t0 = None
    with av.open(io.BytesIO(data), format="webm") as c:
        for f in c.decode(video=0):
            t = float(f.pts * f.time_base) if f.pts is not None else (len(out) / MODEL_FPS)
            t0 = t if t0 is None else t0
            img = limit_height(f.to_ndarray(format="rgb24"), max_height)
            while (t - t0) >= (len(out) - 0.5) / MODEL_FPS:  # fill every slot up to this frame's time
                out.append(img)
    return out


def _ffmpeg() -> str:
    exe = shutil.which("ffmpeg")
    if exe:
        return exe
    import imageio_ffmpeg  # Windows/Mac fallback

    return imageio_ffmpeg.get_ffmpeg_exe()


def read_video(path: str, max_height: int = MAX_HEIGHT) -> list[np.ndarray]:
    """Decode any video file to RGB frames at a constant 25 fps, height capped (ffmpeg's fps filter,
    same as the feasibility test, minus its intermediate x264 re-encode)."""
    with av.open(path) as c:
        s = c.streams.video[0]
        iw, ih = s.codec_context.width, s.codec_context.height
    if ih > max_height:
        w, h = int(round(iw * max_height / ih / 2)) * 2, max_height
    else:
        w, h = iw, ih
    cmd = [_ffmpeg(), "-loglevel", "error", "-i", path, "-an",
           "-vf", f"fps={MODEL_FPS},scale={w}:{h}", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"]
    raw = subprocess.run(cmd, check=True, capture_output=True).stdout
    arr = np.frombuffer(raw, np.uint8).reshape(-1, h, w, 3)
    return list(arr)


def quality(frames: list[np.ndarray], landmarks: list[Landmarks], crop: np.ndarray | None) -> dict:
    """Input diagnostics + human-readable flags (thresholds from the feasibility test)."""
    found = [x for x in landmarks if x is not None]
    n = max(1, len(landmarks))
    d: dict = {"n_frames": len(frames), "duration_s": round(len(frames) / MODEL_FPS, 2),
               "face_rate": round(len(found) / n, 3)}
    if found and frames:
        eyes = np.median([np.linalg.norm(x[0] - x[1]) for x in found])
        d["eye_dist_frac"] = round(float(eyes / frames[0].shape[1]), 3)
    if crop is not None and len(crop):
        d["mouth_brightness"] = round(float(crop.mean()), 1)
        d["mouth_contrast"] = round(float(crop.std()), 1)
        lower = crop[:, 48:, :].astype(np.float32)
        d["mouth_motion"] = round(float(np.abs(np.diff(lower, axis=0)).mean()), 2) if len(crop) > 1 else 0.0
    flags = []
    if d["face_rate"] < 0.9:
        flags.append(f"face found in only {d['face_rate']:.0%} of frames")
    if d.get("eye_dist_frac", 1) < 0.04:
        flags.append("face small in frame (sit closer)")
    if d.get("mouth_brightness", 255) < 60:
        flags.append("mouth crop dark")
    if d.get("mouth_contrast", 255) < 20:
        flags.append("mouth crop low contrast")
    if d.get("mouth_motion", 99) < 2.0:
        flags.append("very little mouth motion")
    if not 1.0 <= d["duration_s"] <= 8.0:
        flags.append(f"duration {d['duration_s']}s")
    d["flags"] = flags
    return d
