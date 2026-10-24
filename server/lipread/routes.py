"""HTTP endpoints for enrollment and adapter training. Mount in the orchestrator:

    from server.lipread.routes import router as lipread_router
    app.include_router(lipread_router)

GET  /enroll/sentences[?user_id=]  -> [{id, sentence}]; with user_id, personal sentences in the first 30
GET  /enroll/{user_id}             -> {n_clips, sentence_ids}
POST /enroll/{user_id}/clip        multipart: sentence_id, file (webm/mp4 from MediaRecorder), [text]
                                   -> {ok, sentence_id, quality, n_clips}; stores the mouth crop only
POST /train/{user_id}?steps=100     -> {job_id, state}  (409 if already training)
GET  /train/{user_id}/status       -> {state: queued|loading|evaluating|training|done|failed, step, steps,
                                       loss, report: {before_wer, after_wer, before_top5, after_top5, n_train, n_test}}
GET  /train/{user_id}/report       -> full report.json (per-sentence before/after, loss curve)
GET  /corrections/{user_id}        -> {n}  phrases corrected in calls (opted in), used by the next training
DELETE /corrections/{user_id}      -> {n: 0}
GET  /vocab/{user_id}              -> {words}  names/rare words the lip-reader is biased toward (vocab.py)
PUT  /vocab/{user_id}              {words: [...], practice?: [...]} -> {words, practice} (cleaned; practice
                                   sentences join the personal calibration prompts)
"""

import json
import os
import subprocess
import sys
import tempfile
import time
from pathlib import Path

from fastapi import APIRouter, Body, File, Form, HTTPException, UploadFile

from ..lora import data as lora_data
from ..lora.lora import adapter_key
from . import frames as fr
from . import vocab as vb
from .paths import ADAPTER_DIR, ENROLL_DIR

router = APIRouter()
REPO = Path(__file__).resolve().parents[2]
_jobs: dict[str, subprocess.Popen] = {}


@router.get("/enroll/sentences")
def enroll_sentences(user_id: str | None = None) -> list[dict]:
    """With user_id: their personal sentences (name + saved vocabulary, PUT /vocab first) in the first 30."""
    return lora_data.enroll_sentences(user_id)


@router.get("/enroll/{user_id}")
def enroll_progress(user_id: str) -> dict:
    ids = sorted(p.stem for p in (ENROLL_DIR / adapter_key(user_id)).glob("*.npz"))
    return {"user_id": user_id, "n_clips": len(ids), "sentence_ids": ids}


@router.post("/enroll/{user_id}/clip")
def enroll_clip(user_id: str, sentence_id: str = Form(...), file: UploadFile = File(...),
                text: str | None = Form(None)) -> dict:
    sentences = {s["id"]: s["sentence"] for s in lora_data.enroll_sentences(user_id)}
    if sentence_id not in sentences:
        raise HTTPException(400, "choose a sentence from the enrollment prompts")
    text = sentences[sentence_id]
    saved = ENROLL_DIR / adapter_key(user_id)
    if not (saved / f"{sentence_id}.npz").exists() and len(list(saved.glob("*.npz"))) >= 60:
        raise HTTPException(400, "maximum 60 enrollment sentences per profile")
    suffix = Path(file.filename or "clip.webm").suffix or ".webm"
    with tempfile.TemporaryDirectory() as d:  # the raw video is deleted as soon as the crop exists
        src = Path(d) / f"clip{suffix}"
        src.write_bytes(file.file.read())
        try:
            frames = fr.read_video(str(src))
        except Exception as e:
            raise HTTPException(400, f"could not decode video: {e}") from e
    landmarks = fr.FaceDetector().detect_all(frames)
    try:
        crop = fr.crop_mouth(frames, landmarks)
    except ValueError as e:
        return {"ok": False, "sentence_id": sentence_id, "error": str(e).split(":")[0],
                "quality": fr.quality(frames, landmarks, None)}
    q = fr.quality(frames, landmarks, crop)
    ok = q["face_rate"] >= 0.9 and q["n_frames"] >= 10
    if ok:
        lora_data.save_enrollment(adapter_key(user_id), sentence_id, text, crop, q)
    return {"ok": ok, "sentence_id": sentence_id, "quality": q, **enroll_progress(user_id)}


@router.post("/train/{user_id}")
def start_training(user_id: str, steps: int = 100, test_feasibility: bool = True) -> dict:
    key = adapter_key(user_id)
    job = _jobs.get(key)
    if job and job.poll() is None:
        raise HTTPException(409, "already training")
    n = len(list((ENROLL_DIR / key).glob("*.npz")))
    if n < lora_data.MIN_CLIPS or n > 60:
        raise HTTPException(400, f"need {lora_data.MIN_CLIPS}–60 accepted enrollment sentences, have {n}")
    out = ADAPTER_DIR / key
    out.mkdir(parents=True, exist_ok=True)
    (out / "status.json").write_text(json.dumps({"state": "queued", "started": time.time()}))
    cmd = [sys.executable, "-m", "server.lora.train", "--user", user_id, "--steps", str(steps)]
    if test_feasibility:
        cmd.append("--test-feasibility")
    log = open(out / "train.log", "w")
    _jobs[key] = subprocess.Popen(cmd, cwd=REPO, stdout=log, stderr=subprocess.STDOUT, env=os.environ.copy())
    return {"job_id": f"{key}-{_jobs[key].pid}", "state": "queued"}


@router.get("/train/{user_id}/status")
def training_status(user_id: str) -> dict:
    key = adapter_key(user_id)
    path = ADAPTER_DIR / key / "status.json"
    if not path.exists():
        return {"state": "none", "has_adapter": (ADAPTER_DIR / key / "adapter.pt").exists()}
    st = json.loads(path.read_text())
    job = _jobs.get(key)
    if job and job.poll() not in (None, 0) and st.get("state") not in ("done", "failed"):
        st["state"], st["error"] = "failed", f"trainer exited with code {job.returncode}; see train.log"
    st["has_adapter"] = (ADAPTER_DIR / key / "adapter.pt").exists()
    return st


@router.get("/train/{user_id}/report")
def training_report(user_id: str) -> dict:
    path = ADAPTER_DIR / adapter_key(user_id) / "report.json"
    if not path.exists():
        raise HTTPException(404, "no report yet")
    return json.loads(path.read_text())


@router.get("/corrections/{user_id}")
def get_corrections(user_id: str) -> dict:
    return {"user_id": user_id, "n": len(list(lora_data.corrections_dir(adapter_key(user_id)).glob("*.npz")))}


@router.delete("/corrections/{user_id}")
def delete_corrections(user_id: str) -> dict:
    lora_data.delete_corrections(adapter_key(user_id))
    return {"user_id": user_id, "n": 0}


@router.get("/vocab/{user_id}")
def get_vocab(user_id: str) -> dict:
    return {"user_id": user_id, "words": vb.load_user(user_id), "practice": vb.load_practice(user_id)}


@router.put("/vocab/{user_id}")
def put_vocab(user_id: str, words: list[str] = Body(..., embed=True),
              practice: list[str] | None = Body(None, embed=True)) -> dict:
    """practice: sentences to add to calibration (approved from the post-call review); omitted = keep."""
    return {"user_id": user_id, "words": vb.save_user(user_id, words, practice), "practice": vb.load_practice(user_id)}
