#!/bin/sh
# systemd: 见 autopilot-worker.service
# pm2:     pm2 start /opt/mrm/worker/run.sh --name autopilot-worker --interpreter bash
set -eu
cd "$(dirname "$0")"
export PYTHONPATH="$PWD${PYTHONPATH:+:$PYTHONPATH}"
exec python3 -m autopilot_worker
