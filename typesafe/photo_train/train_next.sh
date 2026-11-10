#!/bin/bash
# 2026-11-11 user: "I want to use vit l to keep training, I believe it will pass over vit b" -> keep training ViT-L, round after round.
# Each round: labels n6 (newest 每日确认台 / 名字对应台 decisions), one ViT-L stage-1 epoch with the ViT-B teacher (warm from the
# previous round), whole-photo features only (user 2026-11-10: skip the crop extraction), group model. Then the next round starts
# by itself. Claude compares every round with production (B5+B5c) on the same test photos and swaps only when ViT-L is better.
cd "$(dirname "$0")"; PY=.venv/bin/python
while pgrep -f train_n5b.sh >/dev/null; do sleep 60; done
prev=15
for r in 16 17 18 19 20; do
  [ -f STOP_VITL ] && { echo "STOP_VITL found, stopping before round $r"; exit 0; }
  sed 's/big_meta_n5/big_meta_n6/g; s/big_paths_n5/big_paths_n6/g' build_n5.py > build_n6.py && python3 build_n6.py > n6_build.log 2>&1 || { echo N6_BUILD_FAILED; exit 1; }
  export PATHS_FILE=big_paths_n6.txt META_FILE=big_meta_n6.tsv BB=vitl14 BS=32 AMP=1 LOADERS=8
  INIT=models/dinov2_l_big$prev.pt TEACHER=models/dinov2_b_big10a.pt $PY finetune2.py 1 4 big$r > ftL${r}_stage1.log 2>&1
  NEED=1 $PY seqctx.py extract models/dinov2_l_big$r.pt big$r > ftL${r}_extract.log 2>&1
  RARE=100 EPOCHS=6 USE_CROP=0 INIT_SEQ=models/seq_L$prev.pt $PY seqctx.py train models/dinov2_l_big$r.pt big$r L$r > ftL${r}_stage2.log 2>&1
  echo "ROUND $r: stage1 $(grep -h 'best top1' ftL${r}_stage1.log | tail -1) | group $(grep -h 'best top1' ftL${r}_stage2.log | tail -1)"
  rm -f feats_big$prev.npy   # keep disk: only the newest round's features
  prev=$r
done
echo VITL_ROUNDS_DONE
