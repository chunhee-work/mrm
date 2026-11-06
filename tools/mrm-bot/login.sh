#!/bin/bash
# Account login buttons (Macfleet pastes.json): ./login.sh <relogin script> <ACCOUNT> [--ask]
# user 2026-11-06: one Merimen account per browser. The FIRST time an account is used, ask which browser to open it in
# (remembered in state/browser_<ACCOUNT>; --ask to choose again), then open that browser and run the account's own login
# script there. Claude never runs this; the user presses the button.
#   Chrome 1 = automation Chrome, port 9222 (~/.agent-browser-chrome)   - case work (TC0607)
#   Chrome 2 = second automation Chrome, port 9223 (~/.agent-browser-chrome-2) - a second account at the same time
#   Safari   = only opens the Merimen login page; log in by hand (the scripts cannot drive Safari)
cd "$(dirname "$0")"; S="$1"; A="$2"; F="state/browser_$A"; mkdir -p state
if [ ! -f "$F" ] || [ "$3" = "--ask" ]; then
  C=$(osascript -e "choose from list {\"Chrome 1 (port 9222)\", \"Chrome 2 (port 9223)\", \"Safari\"} with prompt \"$A 要在哪个浏览器登录？（以后会记住）\" default items {\"Chrome 1 (port 9222)\"}")
  [ "$C" = "false" ] || [ -z "$C" ] && { echo "cancelled"; exit 1; }
  echo "$C" > "$F"
fi
C=$(cat "$F"); echo "$A -> $C   (choose again: ./login.sh $S $A --ask)"
case "$C" in
  Safari*) open -a Safari "https://www.merimen.com.my/claims/index.cfm"; echo "Safari opened: log in by hand"; exit 0;;
  "Chrome 2"*) PORT=9223; DIR="$HOME/.agent-browser-chrome-2";;
  *) PORT=9222; DIR="$HOME/.agent-browser-chrome";;
esac
if ! curl -s "http://127.0.0.1:$PORT/json/version" >/dev/null; then
  open -na "Google Chrome" --args --user-data-dir="$DIR" --remote-debugging-port=$PORT --no-first-run "https://www.merimen.com.my/claims/index.cfm"
  for i in $(seq 1 30); do curl -s "http://127.0.0.1:$PORT/json/version" >/dev/null && break; sleep 1; done
fi
echo "http://127.0.0.1:$PORT" > "state/cdp_$A"   # the scripts for this account use CDP=$(cat state/cdp_<ACCOUNT>)
CDP="http://127.0.0.1:$PORT" node "$S"
