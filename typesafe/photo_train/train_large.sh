#!/bin/bash
# 2026-11-05 idea 6 (user: "use this device, 30 h+ is OK"): bigger backbone DINOv2 ViT-L/14 (1024-d) instead of ViT-B.
# stage 1 fine-tune (last 4 blocks, 2 epochs) -> features for the photos the group model reads (whole + crosshair zoom)
# -> stage 2 group model -> compare with the current models on the same held-out split (TTA=1 both). Swap only if better.
cd "$(dirname "$0")"
export PATHS_FILE=big_paths_n3.txt META_FILE=big_meta_n3.tsv BB=vitl14 BS=${BS:-32}
.venv/bin/python finetune2.py ${FT_EPOCHS:-2} ${UNFREEZE:-4} big12 > ftL_stage1.log 2>&1
grep -E "EPOCH|best" ftL_stage1.log | tail -3
NEED=1 .venv/bin/python seqctx.py extract models/dinov2_l_big12.pt big12 > ftL_extract.log 2>&1
NEED=1 CROP=0.5 .venv/bin/python seqctx.py extract models/dinov2_l_big12.pt big12 > ftL_extract_c.log 2>&1
RARE=100 EPOCHS=6 TTA=1 .venv/bin/python seqctx.py train models/dinov2_l_big12.pt big12 L12c > ftL_stage2.log 2>&1
grep -E "EPOCH|best" ftL_stage2.log | tail -3
echo TRAIN_LARGE_DONE
