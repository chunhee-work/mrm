#!/bin/bash
# 2026-11-10 user: "when it done then u start the next training". Waits for train_n5b.sh (L15) to finish, then:
# labels n6 = n5 + the newest 每日确认台 decisions (build_n5.py re-run into n6 files), ViT-L one more epoch with the teacher
# (big16 from big15), whole-photo features only (user: skip the crop extraction), group model L16.
cd "$(dirname "$0")"; PY=.venv/bin/python
while pgrep -f train_n5b.sh >/dev/null; do sleep 60; done
sed 's/big_meta_n5/big_meta_n6/g; s/big_paths_n5/big_paths_n6/g' build_n5.py > build_n6.py && python3 build_n6.py > n6_build.log 2>&1 || { echo N6_BUILD_FAILED; exit 1; }
export PATHS_FILE=big_paths_n6.txt META_FILE=big_meta_n6.tsv BB=vitl14 BS=32 AMP=1 LOADERS=8
INIT=models/dinov2_l_big15.pt TEACHER=models/dinov2_b_big10a.pt $PY finetune2.py 1 4 big16 > ftL16_stage1.log 2>&1
NEED=1 $PY seqctx.py extract models/dinov2_l_big16.pt big16 > ftL16_extract.log 2>&1
RARE=100 EPOCHS=6 USE_CROP=0 $PY seqctx.py train models/dinov2_l_big16.pt big16 L16 > ftL16_stage2.log 2>&1
grep -h "best top1" ftL16_stage2.log; echo NEXT_DONE
