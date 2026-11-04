#!/bin/bash
# 2026-11-04 label audit: 2-fold cross-check of the TRAIN photos (fresh stage-2 model per fold, no warm start from seq_best)
cd "$(dirname "$0")"
for f in 0 1; do FOLD=$f USE_CROP=0 RARE=100 EPOCHS=3 .venv/bin/python seqctx.py train models/dinov2_b_big10a.pt big10n3 audf$f > audit_f$f.log 2>&1; done
echo AUDIT_DONE
