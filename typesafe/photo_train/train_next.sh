#!/bin/bash
# 2026-11-10 decision (user: "decide if it's worth to keep training or which model"): STOP extra ViT-L rounds.
# ViT-L stage 1 is flat (76.7 -> 76.9 for ~45 h); group model 80.9 vs production ViT-B 82.5. Our gains come from better LABELS,
# and ViT-B stage 1 was last trained on n3 labels (before ~10k renames/drops). So: after L15 finishes, labels n6 (newest daily fixes),
# ONE ViT-B stage-1 epoch on n6 (warm from big10a, ~3.5 h), ViT-B features whole + crop (~10 h), group models B6 / B6c (~15 min).
# Swap into production only if B6+B6c beats B5+B5c on the same test photos (Claude checks + tells the user).
cd "$(dirname "$0")"; PY=.venv/bin/python
while pgrep -f train_n5b.sh >/dev/null; do sleep 60; done
sed 's/big_meta_n5/big_meta_n6/g; s/big_paths_n5/big_paths_n6/g' build_n5.py > build_n6.py && python3 build_n6.py > n6_build.log 2>&1 || { echo N6_BUILD_FAILED; exit 1; }
export PATHS_FILE=big_paths_n6.txt META_FILE=big_meta_n6.tsv BB=vitb14 BS=${BS:-64} AMP=1 LOADERS=8
INIT=models/dinov2_b_big10a.pt $PY finetune2.py 1 4 big10n6 > ftB6_stage1.log 2>&1
grep -E "EPOCH|best" ftB6_stage1.log | tail -2
NEED=1 $PY seqctx.py extract models/dinov2_b_big10n6.pt big10n6s1 > ftB6_extract.log 2>&1
NEED=1 CROP=0.5 $PY seqctx.py extract models/dinov2_b_big10n6.pt big10n6s1 > ftB6_extract_c.log 2>&1
RARE=100 EPOCHS=6 USE_CROP=0 INIT_SEQ=models/seq_best.pt $PY seqctx.py train models/dinov2_b_big10n6.pt big10n6s1 B6 > ftB6_stage2.log 2>&1
RARE=100 EPOCHS=6 INIT_SEQ=models/seq_best_crop.pt $PY seqctx.py train models/dinov2_b_big10n6.pt big10n6s1 B6c > ftB6_stage2c.log 2>&1
grep -h "best top1" ftB6_stage2.log ftB6_stage2c.log; echo NEXT_DONE
