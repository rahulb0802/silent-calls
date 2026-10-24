#!/usr/bin/env bash
# One-time setup of a Vultr GPU box (Ubuntu 22.04/24.04 with the NVIDIA driver). About 10 minutes.
#
#   git clone https://github.com/rahulb0802/voice && cd voice && bash server/setup_gpu.sh
#
# Creates .venv (Python 3.11) in the repo, and puts the AutoAVSR code + weights in $LIPREAD_HOME
# (default /opt/lr). Safe to re-run: finished steps are skipped.
set -euo pipefail

LR=${LIPREAD_HOME:-/opt/lr}
VSR=$LR/vsr
REPO=$(cd "$(dirname "$0")/.." && pwd)

export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq git unzip curl ffmpeg libgl1 libglib2.0-0 libportaudio2 >/dev/null

if ! command -v uv >/dev/null; then
  curl -LsSf https://astral.sh/uv/install.sh | sh
fi
export PATH=$HOME/.local/bin:$PATH

mkdir -p "$LR"
[ -d "$VSR" ] || git clone -q https://github.com/mpc001/Visual_Speech_Recognition_for_Multiple_Languages "$VSR"

cd "$REPO"
[ -d .venv ] || uv venv -q --python 3.11 .venv
uv pip install -q --python .venv -r server/requirements-gpu.txt -r requirements.txt --override <(echo "numpy<2")

# Weights (Google Drive links from the AutoAVSR model zoo): LRS3 visual-only model + LRS3 subword LM.
M=$VSR/benchmarks/LRS3/models
L=$VSR/benchmarks/LRS3/language_models
mkdir -p "$M" "$L"
if [ ! -f "$M/LRS3_V_WER19.1/model.pth" ]; then
  .venv/bin/gdown -q 1t8RHhzDTTvOQkLQhmK1LZGnXRRXOXGi6 -O "$LR/vsr_model.zip"
  unzip -q -o "$LR/vsr_model.zip" -d "$M" && rm "$LR/vsr_model.zip"
fi
if [ ! -f "$L/lm_en_subword/model.pth" ]; then
  .venv/bin/gdown -q 1g31HGxJnnOwYl17b70ObFQZ1TSnPvRQv -O "$LR/lm.zip"
  unzip -q -o "$LR/lm.zip" -d "$L" && rm "$LR/lm.zip"
fi

# SentencePiece model the checkpoint was trained with (needed to tokenize LoRA training text).
SPM=$LR/spm/unigram5000.model
if [ ! -f "$SPM" ]; then
  mkdir -p "$(dirname "$SPM")"
  curl -fsSL -o "$SPM" https://raw.githubusercontent.com/mpc001/auto_avsr/main/spm/unigram/unigram5000.model
fi

.venv/bin/python - <<'EOF'
import torch, mediapipe, numpy
print("torch", torch.__version__, "| cuda", torch.cuda.is_available(),
      "|", [torch.cuda.get_device_name(i) for i in range(torch.cuda.device_count())],
      "| numpy", numpy.__version__, "| mediapipe", mediapipe.__version__)
EOF
echo SETUP_DONE
