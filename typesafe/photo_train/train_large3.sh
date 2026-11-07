#!/bin/bash
# 2026-11-08 (user: "keep training, use all the CPU and GPU"): ViT-L epoch 2 with parallel image loading (LOADERS=8),
# float16 on the GPU (AMP=1) and the current model as teacher (TEACHER), warm from big13 (epoch 1 of the n4 run).
# Then features for the group model (whole + crosshair zoom) and BOTH group models (whole, whole+crop) = same setup as production.
cd "$(dirname "$0")"
export PATHS_FILE=big_paths_n4.txt META_FILE=big_meta_n4.tsv BB=vitl14 BS=${BS:-32} AMP=1 LOADERS=8
INIT=models/dinov2_l_big13.pt TEACHER=models/dinov2_b_big10a.pt .venv/bin/python finetune2.py 1 4 big14 > ftL14_stage1.log 2>&1
grep -E "EPOCH|best" ftL14_stage1.log | tail -2
NEED=1 .venv/bin/python seqctx.py extract models/dinov2_l_big14.pt big14 > ftL14_extract.log 2>&1
NEED=1 CROP=0.5 .venv/bin/python seqctx.py extract models/dinov2_l_big14.pt big14 > ftL14_extract_c.log 2>&1
RARE=100 EPOCHS=6 USE_CROP=0 .venv/bin/python seqctx.py train models/dinov2_l_big14.pt big14 L14 > ftL14_stage2.log 2>&1
RARE=100 EPOCHS=6 .venv/bin/python seqctx.py train models/dinov2_l_big14.pt big14 L14c > ftL14_stage2c.log 2>&1
grep -E "best|rare items" ftL14_stage2.log ftL14_stage2c.log | tail -4
echo TRAIN_LARGE3_DONE
