#!/bin/bash
# 2026-11-03 follow-up round (option 3): fine-tune the stage-1 backbone again (warm start big10a, last 6 blocks instead of 4)
# on today's labels (big_meta_n3.tsv), re-extract features only for the photos the group model reads (NEED=1), retrain stage 2,
# compare on the same held-out split with seq_n3 / seq_n3c (round 1). A model is swapped in only if its top-1 is higher.
cd "$(dirname "$0")"
export PATHS_FILE=big_paths_n3.txt META_FILE=big_meta_n3.tsv
best() { .venv/bin/python - "$1" <<'PY'
import re,sys
e=[(float(a),float(b)) for a,b in re.findall(r"EPOCH \d+ test top1 ([\d.]+)% top3 ([\d.]+)%",open(sys.argv[1]).read())]
print("%.1f %.1f"%max(e) if e else "0 0")
PY
}
INIT=models/dinov2_b_big10a.pt .venv/bin/python finetune2.py ${FT_EPOCHS:-2} ${UNFREEZE:-6} big11 > ft11_stage1.log 2>&1
echo "stage1 $(best ft11_stage1.log)"
NEED=1 .venv/bin/python seqctx.py extract models/dinov2_b_big11.pt big11 2>&1 | grep -E "NEED|extract done|Error|Traceback"
USE_CROP=0 RARE=100 EPOCHS=4 INIT_SEQ=models/seq_best.pt .venv/bin/python seqctx.py train models/dinov2_b_big11.pt big11 ft11 > ft11_whole.log 2>&1
read W1 W3 <<<"$(best ft11_whole.log)"; echo "whole new $W1/$W3 vs round1 82.3/92.8"
if awk "BEGIN{exit !($W1 > 82.3)}"; then
  cp models/seq_best.pt models/seq_best_prev20261103b.pt; cp models/seq_ft11.pt models/seq_best.pt; echo "whole SWAPPED"
  NEED=1 CROP=0.5 .venv/bin/python seqctx.py extract models/dinov2_b_big11.pt big11 2>&1 | grep -E "NEED|extract done|Error|Traceback"
  RARE=100 EPOCHS=4 INIT_SEQ=models/seq_best_crop.pt .venv/bin/python seqctx.py train models/dinov2_b_big11.pt big11 ft11c > ft11_crop.log 2>&1
  read C1 C3 <<<"$(best ft11_crop.log)"; echo "crop new $C1/$C3 vs round1 81.2/92.3"
  if awk "BEGIN{exit !($C1 > 81.2)}"; then cp models/seq_best_crop.pt models/seq_best_crop_prev20261103b.pt; cp models/seq_ft11c.pt models/seq_best_crop.pt; echo "crop SWAPPED"; else echo "crop kept"; fi
else echo "whole kept (crop pass skipped)"; fi
echo TRAIN_FT11_DONE
