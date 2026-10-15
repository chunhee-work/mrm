#!/bin/bash
# after vehicle lookup: rebuild labels (Perodua/other Front Panel rule, lorry rule) and retrain both group models
cd "$(dirname "$0")"
until grep -aqE "^DONE|^STOP" lamp_models.log; do sleep 300; done
python3 motor.py && python3 name_map.py >/dev/null && MIN=20 CAP=1000 STRONG_CAP=1000 python3 build_big.py
USE_CROP=0 .venv/bin/python seqctx.py train models/dinov2_b_big10a.pt big10a big10e 2>&1 | grep -vE "^ep |warn"
.venv/bin/python seqctx.py train models/dinov2_b_big10a.pt big10a big10f 2>&1 | grep -vE "^ep |warn"
echo STEP3_DONE
