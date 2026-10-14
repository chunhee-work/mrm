#!/bin/bash
# every 30 min: ONE read-only request (a known case details page must show Vehicle Model); when it is accepted again, resume the vehicle lookup (read-only)
cd "$(dirname "$0")"
while true; do
  r=$(python3 -c '
import sys; sys.path.insert(0,".."); import driver as d
try:
    h=d.js(d.T(),"(function(){var x=new XMLHttpRequest();x.open(\"GET\",\"/claims/index.cfm?fusebox=MTRestinterface&fuseaction=dsp_details&caseid=19914598&tpins=0&%s\",false);x.send();return x.responseText.indexOf(\"Vehicle Model\")>=0?\"OK\":\"NO\"})()" % d.sess())
    print(h)
except Exception as e: print("ERR")' 2>/dev/null)
  echo "$(date '+%m-%d %H:%M') $r"
  if [ "$r" = "OK" ]; then echo MERIMEN_OK; python3 lamp_models.py > lamp_models.log 2>&1; echo LOOKUP_END; exit 0; fi
  sleep 1800
done
