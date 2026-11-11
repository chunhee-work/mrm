#!/bin/bash
# 2026-11-11 (user: "without my instruction, what will you do next"): wakes Claude at the end of every ViT-L round.
# Exits when a new ftL<r>_stage2.log has "best top1" that was not seen before -> Claude compares with production,
# swaps if better, applies the stop rule, tells the user, and starts this watcher again.
cd "$(dirname "$0")"; SEEN=state_rounds_seen.txt; touch $SEEN
while :; do
  for f in $(ls ftL1[6-9]_stage2.log ftL20_stage2.log 2>/dev/null); do
    grep -q "best top1" $f && ! grep -qx "$f" $SEEN && { echo "$f" >> $SEEN; echo "ROUND_DONE $f $(grep -h 'best top1' $f | tail -1)"; exit 0; }
  done
  pgrep -f train_next.sh >/dev/null || { echo "TRAIN_NEXT_STOPPED"; exit 0; }
  sleep 300
done
