#!/bin/bash
# user 2026-10-15 "keep training with merimen website": whenever the user's Merimen tab is logged in, continue the
# read-only work (vehicle lookup first, then photo download), then retrain the group model. Never logs in by itself.
cd "$(dirname "$0")"
LAST=$(python3 -c "import json;print(len(json.load(open('lamp_models.json'))))")
while true; do
  ok=$(python3 -c '
import sys; sys.path.insert(0,".."); import driver as d
t=[x["id"] for x in d.tabs() if "merimen" in x.get("url","") and "Main Menu" in d.js(x["id"],"document.body.innerText.slice(0,200)")]
if t:
    open(d.T_FILE,"w").write(str(t[0])); d.save_sess(t[0]); print("YES")
else: print("NO")' 2>/dev/null)
  echo "$(date '+%m-%d %H:%M') logged-in=$ok"
  if [ "$ok" = "YES" ]; then
    todo=$(python3 -c "
import json,re
res=json.load(open('lamp_models.json')); c=set()
for l in open('index.jsonl'):
    try: r=json.loads(l)
    except ValueError: continue
    if re.search(r'rear lamp|lamp assembly rear|tail lamp|lamp (inner|outer) rear|front panel|fender inner|front crossmember|frt panel|chassis member', r['name'], re.I): c.add(r['cid'])
print(len(c-set(res)))")
    if [ "$todo" -gt 0 ]; then
      echo "lookup todo $todo"; python3 lamp_models.py > lamp_models.log 2>&1; tail -1 lamp_models.log
    else
      echo "harvest"; DEADLINE=$(( $(date +%s) + 24*3600 )) python3 harvest.py all_cases.json >> harvest_all.log 2>&1; tail -1 harvest_all.log
    fi
    NOW=$(python3 -c "import json;print(len(json.load(open('lamp_models.json'))))")
    if [ $((NOW - LAST)) -ge 300 ]; then
      echo "retrain group model ($LAST -> $NOW vehicles)"
      python3 motor.py && python3 name_map.py >/dev/null && MIN=20 CAP=1000 STRONG_CAP=1000 python3 build_big.py | tail -1
      # new downloaded photos shift the rows -> features must be re-extracted first (5-6 h); skip until then
      .venv/bin/python -c "import numpy as np;n=len(open('big_meta.tsv').read().splitlines());f=np.load('feats_big10a.npy',mmap_mode='r').shape[0];c=np.load('feats_big10a_c.npy',mmap_mode='r').shape[0];exit(0 if n==f==c else 1)" || { echo "photos changed: features need re-extract, skip retrain"; LAST=$NOW; sleep 600; continue; }
      USE_CROP=0 .venv/bin/python seqctx.py train models/dinov2_b_big10a.pt big10a seqw 2>&1 | grep -E "^best"
      .venv/bin/python seqctx.py train models/dinov2_b_big10a.pt big10a seqwc 2>&1 | grep -E "^best"
      LAST=$NOW; echo RETRAINED
    fi
  fi
  sleep 600
done
