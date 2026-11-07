#!/bin/bash
# 2026-11-07: labels n4 (audits 5+6 + 69,722 harvested rare-part photos) -> features for the NEW photos only (old rows copied
# from feats_big10n3*) -> retrain the group models warm from the current best, compare with seq_best / seq_best_crop (81.2/92.3)
cd "$(dirname "$0")"
export PATHS_FILE=big_paths_n4.txt META_FILE=big_meta_n4.tsv
BASE_FEATS=feats_big10n3.npy .venv/bin/python seqctx.py extract models/dinov2_b_big10a.pt big10n4 > n4_extract.log 2>&1
BASE_FEATS=feats_big10n3_c.npy CROP=0.5 .venv/bin/python seqctx.py extract models/dinov2_b_big10a.pt big10n4 > n4_extract_c.log 2>&1
export RARE=${RARE:-100} EPOCHS=${EPOCHS:-4}
INIT_SEQ=models/seq_best_crop.pt .venv/bin/python seqctx.py train models/dinov2_b_big10a.pt big10n4 n4c > n4_train_c.log 2>&1
grep -E "EPOCH|best|rare items" n4_train_c.log | tail -6
echo TRAIN_N4_DONE
