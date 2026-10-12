#!/bin/bash
cd "$(dirname "$0")"
.venv/bin/python finetune.py 12 8 ft2 > finetune2.log 2>&1
N=$(grep -a "^best top1" finetune2.log | sed -E 's/.*at epoch ([0-9]+).*/\1/')
[ -z "$N" ] && N=12
echo "best epochs: $N" >> finetune2.log
ALL_CASES=1 .venv/bin/python finetune.py "$N" 8 final > finetune_final.log 2>&1
echo FINISHED >> finetune_final.log
