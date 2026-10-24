"""The lip-reading service the orchestrator calls (spec: docs/specs/lipread.md).

    reader = LipReader()                         # loads the model, warms up the GPU (~10 s)
    reader.on_frame("u7", jpeg)                  # per frame, as it arrives: decode + face detect now
    result = await reader.finish("u7", "rahul")  # crop + model -> top 10, frees the frames
    result = await reader.finish("u7", "rahul", vocab=["Sarvajith"])  # ... biased toward names (vocab.py)
    reader.cancel("u7")

Face detection runs on a CPU thread pool while the user is still mouthing, so after release only the
crop (~50 ms) and the model (~1 s on an A16) remain. The model runs on one GPU thread, so requests are
serialized. Frames are only ever held in memory.
"""

import asyncio
import logging
import os
import threading
import time
from concurrent.futures import Future, ThreadPoolExecutor
from dataclasses import dataclass, field

import numpy as np
import torch

from ..lora import data as lora_data
from ..lora import lora
from . import frames as fr
from . import vocab as vb
from .model import DecodeConfig, decode, load, normalize_text
from .paths import ADAPTER_DIR, MODEL_FPS

log = logging.getLogger(__name__)

MAX_GIVEN = 8  # sentences scored per utterance (each ~5-10 ms on the GPU)


def clean_given(given: list[str] | None) -> list[str]:
    out = [g.strip()[:300] for g in given or [] if isinstance(g, str) and g.strip()]
    return list(dict.fromkeys(out))[:MAX_GIVEN]


MIN_FRAMES = 10  # 0.4 s; shorter than this is a mis-press
MAX_FRAMES = 15 * MODEL_FPS  # frames past 15 s are ignored


KEEP_S, KEEP_N = 180, 20  # recent crops held in memory for corrections


@dataclass
class LipResult:
    candidates: list[tuple[str, float]]  # (text, log-prob), sorted best-first, len <= 10, lowercase
    crop_ms: int
    lipread_ms: int
    face_wait_ms: int = 0  # time after finish() spent waiting for face detection to catch up
    n_tokens: list[int] = field(default_factory=list)  # per candidate, for length-normalized scores
    adapter: str | None = None  # user whose LoRA adapter was used, if any
    name_variants: list[str] = field(default_factory=list)  # candidates added by the lip-shape name match
    given: list[str] = field(default_factory=list)  # candidates that are one of the given sentences (co-pilot)
    quality: dict = field(default_factory=dict)  # see frames.quality(); "flags" is human-readable
    error: str | None = None  # "no_face" | "crop_failed" | "too_short"; candidates is then empty
    timings_ms: dict = field(default_factory=dict)


class _Utterance:
    def __init__(self) -> None:
        self.futures: list[Future] = []  # JPEG frames: decode + face detection, started on arrival
        self.webm = bytearray()  # or: MediaRecorder webm chunks, decoded on finish()
        self.t_first = time.perf_counter()


class LipReader:
    def __init__(self, device: str | None = None, cfg: DecodeConfig = DecodeConfig(),
                 detect_workers: int = 3, warmup: bool = True) -> None:
        t0 = time.perf_counter()
        self.device = device or os.environ.get("LIPREAD_DEVICE") or ("cuda:0" if torch.cuda.is_available() else "cpu")
        self.cfg = cfg
        self.avsr = load(cfg, self.device)
        lora.inject(self.avsr.model)  # no adapter is active until a user's is loaded
        self._adapters: dict[str, float] = {}  # adapter key -> mtime of the loaded file
        self._utts: dict[str, _Utterance] = {}
        self._local = threading.local()
        self._cpu = ThreadPoolExecutor(max_workers=detect_workers, thread_name_prefix="face")
        self._gpu = ThreadPoolExecutor(max_workers=1, thread_name_prefix="model")
        if warmup:
            self._gpu.submit(self._warmup).result()
        self.load_s = time.perf_counter() - t0
        log.info("lip-reader ready on %s in %.1fs (beam %d, lm %.2f, ctc %.2f)", self.device, self.load_s,
                 cfg.beam, cfg.lm_weight, cfg.ctc_weight)

    # ---- streaming API (orchestrator) ----

    def on_frame(self, utt_id: str, jpeg: bytes) -> None:
        utt = self._utts.setdefault(utt_id, _Utterance())
        if len(utt.futures) < MAX_FRAMES:
            utt.futures.append(self._cpu.submit(self._decode_detect, jpeg))

    def on_chunk(self, utt_id: str, data: bytes) -> None:
        """Alternative to on_frame: a chunk of a MediaRecorder webm stream (`utterance.start` with
        `encoding: "webm"`). ~15x less upload than JPEG frames; decoding waits for finish()."""
        utt = self._utts.setdefault(utt_id, _Utterance())
        if len(utt.webm) < 50_000_000:
            utt.webm.extend(data)

    async def finish(self, utt_id: str, user_id: str | None = None, use_adapter: bool = True,
                     vocab: list[str] | None = None, given: list[str] | None = None) -> LipResult:
        """vocab: names/rare words for this utterance (e.g. heard in the call), added to the user's saved list.
        given: sentences the user may be mouthing (the call co-pilot's prepared replies), scored against the
        video and ranked with the model's own guesses."""
        utt =self._utts.pop(utt_id, None) or _Utterance()
        t0 = time.perf_counter()
        loop = asyncio.get_running_loop()
        if utt.webm:
            frames, landmarks = await self._decode_webm(bytes(utt.webm))
        else:
            done = await asyncio.gather(*(asyncio.wrap_future(f) for f in utt.futures), return_exceptions=True)
            pairs = [d for d in done if not isinstance(d, BaseException)]
            frames = [p[0] for p in pairs]
            landmarks = [p[1] for p in pairs]
        face_wait_ms = (time.perf_counter() - t0) * 1000
        res = await loop.run_in_executor(self._cpu, self._crop, frames, landmarks)
        if isinstance(res, LipResult):
            res.face_wait_ms = round(face_wait_ms)
            return res
        crop, q, crop_ms = res
        self._keep(utt_id, crop)
        out = await loop.run_in_executor(self._gpu, self._run_model, crop, user_id if use_adapter else None,
                                         self.vocab_for(user_id, vocab), clean_given(given))
        out.crop_ms, out.quality, out.face_wait_ms = round(crop_ms), q, round(face_wait_ms)
        out.timings_ms.update(face_wait_ms=out.face_wait_ms, crop_ms=out.crop_ms)
        return out

    def cancel(self, utt_id: str) -> None:
        utt = self._utts.pop(utt_id, None)
        if utt:
            for f in utt.futures:
                f.cancel()

    # ---- whole-clip API (eval, enrollment) ----

    def vocab_for(self, user_id: str | None, extra: list[str] | None = None) -> list[str]:
        return vb.clean(vb.load_user(user_id) + list(extra or []))

    def read_frames(self, frames: list[np.ndarray], user_id: str | None = None,
                    vocab: list[str] | None = None) -> LipResult:
        landmarks = self._cpu.submit(lambda: self._detector().detect_all(frames)).result()
        res = self._crop(frames, landmarks, fallback=False)
        if isinstance(res, LipResult):
            return res
        crop, q, crop_ms = res
        out = self.read_crop(crop, user_id, vocab)
        out.crop_ms, out.quality = round(crop_ms), q
        out.timings_ms["crop_ms"] = out.crop_ms
        return out

    def _keep(self, utt_id: str, crop: np.ndarray) -> None:
        """Hold the last few crops in memory for a couple of minutes, in case the user corrects the phrase and
        has opted in to learning from corrections (save_correction). Never written to disk otherwise."""
        now = time.monotonic()
        self._recent = {k: v for k, v in getattr(self, "_recent", {}).items() if now - v[0] < KEEP_S}
        self._recent[utt_id] = (now, crop)
        while len(self._recent) > KEEP_N:
            self._recent.pop(next(iter(self._recent)))

    def save_correction(self, user_id: str, utt_id: str, text: str) -> int | None:
        """Save a corrected phrase for this user's next training; None if the crop is gone or the text odd."""
        kept = getattr(self, "_recent", {}).pop(utt_id, None)
        text = normalize_text(text)
        if kept is None or time.monotonic() - kept[0] >= KEEP_S or not text or len(text.split()) > 25:
            return None
        return lora_data.save_correction(lora.adapter_key(user_id), utt_id, text, kept[1])

    def read_crop(self, crop: np.ndarray, user_id: str | None = None, vocab: list[str] | None = None,
                  given: list[str] | None = None) -> LipResult:
        """vocab is used as given (the eval passes its own list); finish() also adds the user's saved list."""
        return self._gpu.submit(self._run_model, crop, user_id, vb.clean(vocab), clean_given(given)).result()

    # ---- internals ----

    def _detector(self) -> fr.FaceDetector:
        d = getattr(self._local, "det", None)
        if d is None:
            d = self._local.det = fr.FaceDetector()
        return d

    async def _decode_webm(self, data: bytes) -> tuple[list[np.ndarray], list[fr.Landmarks]]:
        loop = asyncio.get_running_loop()
        try:
            frames = await loop.run_in_executor(self._cpu, fr.decode_webm, data)
        except Exception as e:  # truncated/corrupt stream
            log.warning("webm decode failed: %s", e)
            return [], []
        n = self._cpu._max_workers
        parts = [frames[i::n] for i in range(n)]  # interleaved, so every worker gets the same amount
        found = await asyncio.gather(*(loop.run_in_executor(self._cpu, self._detect_many, p) for p in parts))
        landmarks: list[fr.Landmarks] = [None] * len(frames)
        for i, lm in enumerate(found):
            landmarks[i::n] = lm
        return frames, landmarks

    def _detect_many(self, frames: list[np.ndarray]) -> list[fr.Landmarks]:
        det = self._detector()
        return [det.full_range(f) for f in frames]

    def _decode_detect(self, jpeg: bytes) -> tuple[np.ndarray, fr.Landmarks]:
        frame = fr.decode_jpeg(jpeg)
        return frame, self._detector().full_range(frame)

    def _crop(self, frames, landmarks, fallback: bool = True):
        t0 = time.perf_counter()
        if len(frames) < MIN_FRAMES:
            return LipResult([], 0, 0, quality={"n_frames": len(frames)}, error="too_short")
        if fallback and all(x is None for x in landmarks):  # same rule as the feasibility pipeline
            det = self._detector()
            landmarks = [det.short_range(f) for f in frames]
        try:
            crop = fr.crop_mouth(frames, landmarks)
        except ValueError as e:
            code = str(e).split(":")[0]
            return LipResult([], round((time.perf_counter() - t0) * 1000), 0,
                             quality=fr.quality(frames, landmarks, None), error=code)
        return crop, fr.quality(frames, landmarks, crop), (time.perf_counter() - t0) * 1000

    def _use_adapter(self, user_id: str | None) -> str | None:
        """Activate user_id's adapter if one exists on disk (reloading it if retrained); else the base model."""
        name = None
        if user_id:
            key = lora.adapter_key(user_id)
            path = ADAPTER_DIR / key / "adapter.pt"
            if path.exists():
                mtime = path.stat().st_mtime
                if self._adapters.get(key) != mtime:
                    lora.load(self.avsr.model, key, path)
                    self._adapters[key] = mtime
                    log.info("loaded adapter for %s", key)
                name = key
        lora.set_active(self.avsr.model, name)
        return name

    def _run_model(self, crop: np.ndarray, user_id: str | None, vocab: list[str] | None = None,
                   given: list[str] | None = None) -> LipResult:
        t0 = time.perf_counter()
        adapter = self._use_adapter(user_id)
        nbest, t = decode(self.avsr, crop, self.cfg.nbest, vocab if self.cfg.name_bias > 0 else None, given,
                          self.cfg.given_bonus)
        given_set = {normalize_text(g) for g in given or []}
        decoded = {c[0] for c in nbest}
        if self.cfg.name_variants:
            nbest = vb.add_name_variants(nbest, vocab or [], self.cfg.nbest)
        ms = (time.perf_counter() - t0) * 1000
        return LipResult(candidates=[(c[0], c[1]) for c in nbest], crop_ms=0, lipread_ms=round(ms),
                         n_tokens=[c[2] for c in nbest], adapter=adapter,
                         name_variants=[c[0] for c in nbest if c[0] not in decoded],
                         given=[c[0] for c in nbest if c[0] in given_set],
                         timings_ms={"lipread_ms": round(ms), **{k: round(v) for k, v in t.items()}})

    def _warmup(self) -> None:
        crop = np.random.default_rng(0).integers(0, 255, (50, 96, 96), dtype=np.uint8)
        lora.set_active(self.avsr.model, None)
        decode(self.avsr, crop, 1)
