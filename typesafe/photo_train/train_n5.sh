#!/bin/bash
# 2026-11-09: n5 labels (🏷️ 名字对应台 + 🎯 每日确认台 + batch 8/9 photos).
# Part 1 (fast, ~3 h): group models only, on the EXISTING features (only the new photos are extracted, BASE_FEATS):
#   ViT-B (production backbone) -> B5 / B5c ; ViT-L big14 -> L5 / L5c. Then compare (compare_n5.py).
# Part 2 (~45 h): ViT-L stage 1 one more epoch on n5 with the teacher (big15), full features, group models L15 / L15c.
cd "$(dirname "$0")"; PY=.venv/bin/python
export PATHS_FILE=big_paths_n5.txt META_FILE=big_meta_n5.tsv
NEED=1 BASE_FEATS=feats_big14.npy $PY seqctx.py extract models/dinov2_l_big14.pt big14n5 > n5_extL.log 2>&1
NEED=1 CROP=0.5 BASE_FEATS=feats_big14_c.npy $PY seqctx.py extract models/dinov2_l_big14.pt big14n5 > n5_extLc.log 2>&1
RARE=100 EPOCHS=6 USE_CROP=0 INIT_SEQ=models/seq_L14.pt $PY seqctx.py train models/dinov2_l_big14.pt big14n5 L5 > n5_L5.log 2>&1
RARE=100 EPOCHS=6 INIT_SEQ=models/seq_L14c.pt $PY seqctx.py train models/dinov2_l_big14.pt big14n5 L5c > n5_L5c.log 2>&1
NEED=1 BASE_FEATS=feats_big10n3.npy $PY seqctx.py extract models/dinov2_b_big10a.pt big10n5 > n5_extB.log 2>&1
NEED=1 CROP=0.5 BASE_FEATS=feats_big10n3_c.npy $PY seqctx.py extract models/dinov2_b_big10a.pt big10n5 > n5_extBc.log 2>&1
RARE=100 EPOCHS=6 USE_CROP=0 INIT_SEQ=models/seq_best.pt $PY seqctx.py train models/dinov2_b_big10a.pt big10n5 B5 > n5_B5.log 2>&1
RARE=100 EPOCHS=6 INIT_SEQ=models/seq_best_crop.pt $PY seqctx.py train models/dinov2_b_big10a.pt big10n5 B5c > n5_B5c.log 2>&1
grep -h "best top1" n5_L5.log n5_L5c.log n5_B5.log n5_B5c.log
echo N5_PART1_DONE
export BB=vitl14 BS=32 AMP=1 LOADERS=8
INIT=models/dinov2_l_big14.pt TEACHER=models/dinov2_b_big10a.pt $PY finetune2.py 1 4 big15 > ftL15_stage1.log 2>&1
NEED=1 $PY seqctx.py extract models/dinov2_l_big15.pt big15 > ftL15_extract.log 2>&1
NEED=1 CROP=0.5 $PY seqctx.py extract models/dinov2_l_big15.pt big15 > ftL15_extract_c.log 2>&1
RARE=100 EPOCHS=6 USE_CROP=0 $PY seqctx.py train models/dinov2_l_big15.pt big15 L15 > ftL15_stage2.log 2>&1
RARE=100 EPOCHS=6 $PY seqctx.py train models/dinov2_l_big15.pt big15 L15c > ftL15_stage2c.log 2>&1
echo N5_PART2_DONE
