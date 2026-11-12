#!/bin/bash
# 2026-11-12 (user: training used >20 GB on the 16 GB Mac mini, WindowServer crashed and logged the user out): every 30 s add up
# the RSS of all Python processes; above 10 GB pause the training (kill -STOP), resume below 8 GB. Log in mem_guard.log.
cd "$(dirname "$0")"
while :; do
  # top's MEM (phys footprint) includes the GPU (MPS) memory; ps RSS does not (it showed 0.1 GB while top showed 12 GB)
  gb=$(top -l 1 -stats command,mem | awk '/^[Pp]ython/{v=$2; m=1; if(v~/G/)m=1024; else if(v~/K/)m=1/1024; gsub(/[^0-9.]/,"",v); s+=v*m} END{printf "%.1f", s/1024}')
  pids=$(pgrep -f "finetune2.py|seqctx.py")
  if [ -n "$pids" ] && awk "BEGIN{exit !($gb>10)}"; then kill -STOP $pids; echo "$(date +%H:%M:%S) $gb GB -> PAUSED $pids" >> mem_guard.log; touch PAUSED_MEM
  elif [ -f PAUSED_MEM ] && awk "BEGIN{exit !($gb<8)}"; then kill -CONT $pids 2>/dev/null; rm -f PAUSED_MEM; echo "$(date +%H:%M:%S) $gb GB -> resumed" >> mem_guard.log; fi
  # a paused process keeps its memory: still above 10 GB after 10 min of pause -> stop the training for good (train_next.sh too)
  if [ -f PAUSED_MEM ] && [ $(( $(date +%s) - $(stat -f %m PAUSED_MEM) )) -gt 600 ] && awk "BEGIN{exit !($gb>10)}"; then
    pkill -f train_next.sh; kill -9 $pids 2>/dev/null; rm -f PAUSED_MEM; echo "$(date +%H:%M:%S) $gb GB for 10 min -> training KILLED" >> mem_guard.log; exit 1; fi
  sleep 30
done
