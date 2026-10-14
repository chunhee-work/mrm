#!/bin/bash
# batch 10 chain: stage 1 (finetune2) -> vehicle lookup done -> rebuild labels -> extract features -> stage 2 (seqctx)
cd "$(dirname "$0")"
until grep -aqE "^best|Traceback" finetune_big10a.log; do sleep 300; done
grep -aq Traceback finetune_big10a.log && { echo "stage1 failed"; exit 1; }
python3 motor.py && python3 name_map.py >/dev/null && MIN=20 CAP=1000 STRONG_CAP=1000 python3 build_big.py
.venv/bin/python seqctx.py extract models/dinov2_b_big10a.pt big10a || exit 1
.venv/bin/python seqctx.py train models/dinov2_b_big10a.pt big10a big10
