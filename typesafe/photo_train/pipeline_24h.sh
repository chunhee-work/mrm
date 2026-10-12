#!/bin/bash
# company-wide: enumerate -> harvest (newest first) until deadline/disk limit
cd "$(dirname "$0")"
export DEADLINE=$(python3 -c "import time;print(time.time()+24*3600)")
while pgrep -f "list_all.py" >/dev/null; do sleep 60; done
grep -q "^DONE" list_all.log || python3 list_all.py >> list_all.log 2>&1
python3 harvest.py all_cases.json > harvest_all.log 2>&1
echo PIPELINE_FINISHED >> harvest_all.log
