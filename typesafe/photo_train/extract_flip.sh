#!/bin/bash
# 2026-11-04 ideas 2 + 4: mirrored features (whole photo, then crosshair crop) for the photos the group model reads
cd "$(dirname "$0")"
export PATHS_FILE=big_paths_n3.txt META_FILE=big_meta_n3.tsv
NEED=1 FLIP=1 .venv/bin/python seqctx.py extract models/dinov2_b_big10a.pt big10n3 > flip_whole.log 2>&1
NEED=1 FLIP=1 CROP=0.5 .venv/bin/python seqctx.py extract models/dinov2_b_big10a.pt big10n3 > flip_crop.log 2>&1
echo FLIP_DONE
