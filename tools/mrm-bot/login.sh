#!/bin/bash
# Account login buttons (Macfleet pastes.json): ./login.sh <relogin script> <ACCOUNT>
# user 2026-11-06: one Merimen account per browser -> ONE fixed automation Chrome window per account (no choosing):
#   window names (user 2026-11-06): TC0607 = "437" port 9222 (case work) · NVISSAC = "ark.tg" 9223 · YUSTRI = "新账号" 9224 · CHONGAIAI = "无登录" 9225
# Opens that account's Chrome if it is not running, then runs the account's own login script in it.
# Claude never runs this; the user presses the button. Scripts for an account use CDP=$(cat ~/mrm-bot/state/cdp_<ACCOUNT>).
cd "$(dirname "$0")"; S="$1"; A="$2"; mkdir -p state
case "$A" in
  TC0607) PORT=9222; DIR="$HOME/.agent-browser-chrome"; NAME="437"; COL="#2563eb";;
  NVISSAC) PORT=9223; DIR="$HOME/.agent-browser-chrome-2"; NAME="ark.tg"; COL="#16a34a";;
  YUSTRI) PORT=9224; DIR="$HOME/.agent-browser-chrome-3"; NAME="20010"; COL="#9333ea";;
  CHONGAIAI) PORT=9225; DIR="$HOME/.agent-browser-chrome-4"; NAME="无登录"; COL="#ea580c";;
  *) echo "unknown account $A"; exit 1;;
esac
echo "$A -> Chrome window on port $PORT"
if ! curl -s "http://127.0.0.1:$PORT/json/version" >/dev/null; then
  open -na "Google Chrome" --args --user-data-dir="$DIR" --remote-debugging-port=$PORT --no-first-run "https://www.merimen.com.my/claims/index.cfm"
  for i in $(seq 1 30); do curl -s "http://127.0.0.1:$PORT/json/version" >/dev/null && break; sleep 1; done
fi
# 2026-11-07: Chrome still running but its window was closed (no tabs) -> "Browser context management is not supported". Reopen a window first.
if ! curl -s "http://127.0.0.1:$PORT/json/list" | grep -q '"type": *"page"'; then
  curl -s -X PUT "http://127.0.0.1:$PORT/json/new?https://www.merimen.com.my/claims/index.cfm" >/dev/null; sleep 3
fi
echo "http://127.0.0.1:$PORT" > "state/cdp_$A"
CDP="http://127.0.0.1:$PORT" node "$S"
