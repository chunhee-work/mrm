#!/bin/bash
# Run in the background (Bash run_in_background). Exits as soon as a script is stuck waiting for the Merimen login
# (tools/batch/mrm.py wait_login writes ~/mrm-bot/state/NEED_LOGIN). Claude then sends a push notification
# "Merimen 要登录" and starts this watch again. No tokens while waiting.
F="$HOME/mrm-bot/state/NEED_LOGIN"
while [ ! -f "$F" ]; do sleep 15; done
echo "NEED_LOGIN since $(cat "$F")"
