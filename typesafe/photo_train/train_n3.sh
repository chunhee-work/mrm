#!/bin/bash
# 2026-11-03: pre-merge labels + today's name rules + user corrections + batch 7 final names (build_n3.py) -> retrain stage 2
# same recipe as train_uc.sh (warm start from the current best group models, RARE=100, 4 epochs); new photos' features appended to feats_big10n*
cd "$(dirname "$0")"
export PATHS_FILE=big_paths_n3.txt META_FILE=big_meta_n3.tsv
BASE_FEATS=feats_big10n.npy .venv/bin/python seqctx.py extract models/dinov2_b_big10a.pt big10n3 2>&1 | tail -2
BASE_FEATS=feats_big10n_c.npy CROP=0.5 .venv/bin/python seqctx.py extract models/dinov2_b_big10a.pt big10n3 2>&1 | tail -2
export RARE=${RARE:-100} EPOCHS=${EPOCHS:-4}
USE_CROP=0 INIT_SEQ=models/seq_best.pt .venv/bin/python seqctx.py train models/dinov2_b_big10a.pt big10n3 ${TAG:-n3} 2>&1 | grep -vE "^ep "
INIT_SEQ=models/seq_best_crop.pt .venv/bin/python seqctx.py train models/dinov2_b_big10a.pt big10n3 ${TAG:-n3}c 2>&1 | grep -vE "^ep "
echo TRAIN_N3_DONE
