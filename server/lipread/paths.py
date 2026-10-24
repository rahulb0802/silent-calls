"""Where the AutoAVSR code, weights and per-user data live. Override with LIPREAD_HOME / VSR_DIR."""

import os
import sys
from pathlib import Path

HOME = Path(os.environ.get("LIPREAD_HOME", "/opt/lr"))
VSR_DIR = Path(os.environ.get("VSR_DIR", HOME / "vsr"))

LRS3 = VSR_DIR / "benchmarks" / "LRS3"
MODEL_PATH = LRS3 / "models" / "LRS3_V_WER19.1" / "model.pth"
MODEL_CONF = LRS3 / "models" / "LRS3_V_WER19.1" / "model.json"
LM_PATH = LRS3 / "language_models" / "lm_en_subword" / "model.pth"
LM_CONF = LRS3 / "language_models" / "lm_en_subword" / "model.json"
SPM_MODEL = Path(os.environ.get("SPM_MODEL", HOME / "spm" / "unigram5000.model"))

CLIPS_DIR = Path(os.environ.get("CLIPS_DIR", HOME / "clips"))  # feasibility recordings
CACHE_DIR = HOME / "cache"  # mouth crops of the feasibility clips, so decoder sweeps skip face detection
ENROLL_DIR = HOME / "enroll"  # <user_id>/<sentence_id>.npz: mouth crop + text (never raw video)
ADAPTER_DIR = HOME / "adapters"  # <user_id>/adapter.pt, report.json, status.json

SERVER_DIR = Path(__file__).resolve().parent.parent
EVAL_DATA = SERVER_DIR / "eval_data"
RESULTS_DIR = SERVER_DIR / "results"

MODEL_FPS = 25  # the model's frame rate; the AutoAVSR pipeline does not resample


def add_vsr_to_path() -> None:
    if str(VSR_DIR) not in sys.path:
        sys.path.insert(0, str(VSR_DIR))
