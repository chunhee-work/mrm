#!/bin/bash
# 2026-11-07 user: "just use ViT-L, keep training; once it passes ViT-B, replace it".
# ViT-L stage 1 continues from dinov2_l_big12 on labels n4 (audits 5+6 + harvested rare photos), 2 more epochs (big13),
# then features for the group model (whole + crosshair zoom) and the group model. Replace ViT-B only if better than 81.2/92.3.
cd "$(dirname "$0")"
export PATHS_FILE=big_paths_n4.txt META_FILE=big_meta_n4.tsv BB=vitl14 BS=${BS:-32}
INIT=models/dinov2_l_big12.pt .venv/bin/python finetune2.py ${FT_EPOCHS:-2} ${UNFREEZE:-4} big13 > ftL13_stage1.log 2>&1
grep -E "EPOCH|best" ftL13_stage1.log | tail -3
NEED=1 .venv/bin/python seqctx.py extract models/dinov2_l_big13.pt big13 > ftL13_extract.log 2>&1
NEED=1 CROP=0.5 .venv/bin/python seqctx.py extract models/dinov2_l_big13.pt big13 > ftL13_extract_c.log 2>&1
RARE=100 EPOCHS=6 .venv/bin/python seqctx.py train models/dinov2_l_big13.pt big13 L13c > ftL13_stage2.log 2>&1
grep -E "EPOCH|best|rare items" ftL13_stage2.log | tail -4
echo TRAIN_LARGE2_DONE
