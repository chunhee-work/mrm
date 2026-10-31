#!/bin/bash
# 2026-10-31: user labels (部位标注台) merged -> retrain stage 2 only, warm start from the current best group models (same settings as train_rare.sh)
# TAG=uc31b -> models/seq_uc31b.pt + seq_uc31bc.pt; renamed/merged names inherit their old rows (seqctx.py WARM_MAP)
cd "$(dirname "$0")"
export PATHS_FILE=big_paths_n2.txt META_FILE=big_meta_n2.tsv RARE=${RARE:-100} EPOCHS=${EPOCHS:-4}
USE_CROP=0 INIT_SEQ=models/seq_best.pt .venv/bin/python seqctx.py train models/dinov2_b_big10a.pt big10n ${TAG:-uc31} 2>&1 | grep -vE "^ep "
INIT_SEQ=models/seq_best_crop.pt .venv/bin/python seqctx.py train models/dinov2_b_big10a.pt big10n ${TAG:-uc31}c 2>&1 | grep -vE "^ep "
echo TRAIN_UC_DONE
