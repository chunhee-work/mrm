#!/bin/bash
# after this 24 h download round: freeze the photo list, extract features (whole + crosshair zoom) with big10a, retrain group models
cd "$(dirname "$0")"
until [ $(grep -c "STOP: time budget" harvest_all.log) -gt 2 ]; do sleep 600; done
python3 motor.py && python3 name_map.py >/dev/null && MIN=20 CAP=1000 STRONG_CAP=1000 python3 build_big.py
cp big_paths.txt big_paths_n.txt; cp big_meta.tsv big_meta_n.tsv
export PATHS_FILE=big_paths_n.txt META_FILE=big_meta_n.tsv
.venv/bin/python seqctx.py extract models/dinov2_b_big10a.pt big10n 2>&1 | tail -1
CROP=0.5 .venv/bin/python seqctx.py extract models/dinov2_b_big10a.pt big10n 2>&1 | tail -1
USE_CROP=0 .venv/bin/python seqctx.py train models/dinov2_b_big10a.pt big10n seqn 2>&1 | grep -E "^best"
.venv/bin/python seqctx.py train models/dinov2_b_big10a.pt big10n seqnc 2>&1 | grep -E "^best"
echo AFTER_HARVEST_DONE
