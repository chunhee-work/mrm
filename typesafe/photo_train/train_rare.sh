#!/bin/bash
# Warm-start the CURRENT best group models and oversample rare (冷门) items. Keep a new model only if it beats the old one.
cd "$(dirname "$0")"
export PATHS_FILE=big_paths_n.txt META_FILE=big_meta_n.tsv RARE=${RARE:-100} EPOCHS=${EPOCHS:-4}
USE_CROP=0 INIT_SEQ=models/seq_best.pt .venv/bin/python seqctx.py train models/dinov2_b_big10a.pt big10n rare 2>&1 | grep -vE "^ep "
INIT_SEQ=models/seq_best_crop.pt .venv/bin/python seqctx.py train models/dinov2_b_big10a.pt big10n rarec 2>&1 | grep -vE "^ep "
echo TRAIN_RARE_DONE
