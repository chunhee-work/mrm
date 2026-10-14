#!/bin/bash
# label cleanup + crosshair zoom: retrain the group model (seqctx) only
cd "$(dirname "$0")"
while pgrep -f "seqctx.py train" >/dev/null; do sleep 60; done
python3 motor.py && python3 name_map.py >/dev/null && MIN=20 CAP=1000 STRONG_CAP=1000 python3 build_big.py
USE_CROP=0 .venv/bin/python seqctx.py train models/dinov2_b_big10a.pt big10a big10c 2>&1 | grep -vE "^ep |warn"
until [ -f feats_big10a_c.npy ]; do sleep 300; pgrep -f "CROP|seqctx.py extract" >/dev/null || [ -f feats_big10a_c.npy ] || { echo "crop extract stopped"; exit 1; }; done
.venv/bin/python seqctx.py train models/dinov2_b_big10a.pt big10a big10d 2>&1 | grep -vE "^ep |warn"
echo STEP2_DONE
