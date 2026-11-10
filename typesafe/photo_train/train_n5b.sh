#!/bin/bash
# 2026-11-10 user: skip the crosshair-zoom (crop) extraction for big15 (~18 h for ~+0.5%). Wait for the running whole-photo
# extraction (PID given), then train only the whole-photo group model L15.
cd "$(dirname "$0")"; PY=.venv/bin/python
export PATHS_FILE=big_paths_n5.txt META_FILE=big_meta_n5.tsv
while kill -0 $1 2>/dev/null; do sleep 60; done
grep -q "extract done" ftL15_extract.log || { echo EXTRACT_FAILED; exit 1; }
RARE=100 EPOCHS=6 USE_CROP=0 $PY seqctx.py train models/dinov2_l_big15.pt big15 L15 > ftL15_stage2.log 2>&1
grep -h "best top1" ftL15_stage2.log
echo N5B_DONE
