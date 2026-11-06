#!/bin/bash
# Account login buttons (Macfleet pastes.json): ./login.sh <relogin script> <ACCOUNT>
# user 2026-11-06: one Merimen account per browser -> ONE fixed automation Chrome window per account (no choosing):
#   TC0607 = port 9222 (~/.agent-browser-chrome, case work) · NVISSAC = 9223 · YUSTRI = 9224 · CHONGAIAI = 9225
# Opens that account's Chrome if it is not running, then runs the account's own login script in it.
# Claude never runs this; the user presses the button. Scripts for an account use CDP=$(cat ~/mrm-bot/state/cdp_<ACCOUNT>).
cd "$(dirname "$0")"; S="$1"; A="$2"; mkdir -p state
case "$A" in
  TC0607) PORT=9222; DIR="$HOME/.agent-browser-chrome";;
  NVISSAC) PORT=9223; DIR="$HOME/.agent-browser-chrome-2";;
  YUSTRI) PORT=9224; DIR="$HOME/.agent-browser-chrome-3";;
  CHONGAIAI) PORT=9225; DIR="$HOME/.agent-browser-chrome-4";;
  *) echo "unknown account $A"; exit 1;;
esac
echo "$A -> Chrome window on port $PORT"
if ! curl -s "http://127.0.0.1:$PORT/json/version" >/dev/null; then
  open -na "Google Chrome" --args --user-data-dir="$DIR" --remote-debugging-port=$PORT --no-first-run "https://www.merimen.com.my/claims/index.cfm"
  for i in $(seq 1 30); do curl -s "http://127.0.0.1:$PORT/json/version" >/dev/null && break; sleep 1; done
fi
echo "http://127.0.0.1:$PORT" > "state/cdp_$A"
CDP="http://127.0.0.1:$PORT" node "$S"
