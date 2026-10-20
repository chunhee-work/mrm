#!/bin/bash
# Keep ~/mrm-bot (the live copy the agent runs) and tools/mrm-bot (the copy in git) in step.
#   tools/mrm-bot/sync.sh diff      what differs (run it before every commit)
#   tools/mrm-bot/sync.sh install   repo -> ~/mrm-bot (new machine). Never overwrites a live file that differs unless FORCE=1. Runs npm install.
#   tools/mrm-bot/sync.sh collect   ~/mrm-bot -> repo, only files the repo already tracks. Never pulls session_base.txt,
#                                   relogin.mjs (holds the login) or case data. Add a NEW script to the repo by copying it by hand.
set -euo pipefail
REPO="$(cd "$(dirname "$0")" && pwd)"; LIVE="$HOME/mrm-bot"
names() { (cd "$REPO" && ls -1 | grep -vxE 'README\.md|sync\.sh|doctor\.sh|relogin\.example\.mjs|node_modules|package-lock\.json'); }

case "${1:-diff}" in
diff)
  n=0
  for f in $(names); do
    if [ ! -e "$LIVE/$f" ]; then echo "only in repo: $f"; n=$((n+1))
    elif ! cmp -s "$REPO/$f" "$LIVE/$f"; then echo "DIFFERS: $f"; n=$((n+1)); fi
  done
  echo "$n file(s) out of step."
  ;;
install)
  mkdir -p "$LIVE"
  for f in $(names); do
    if [ ! -e "$LIVE/$f" ]; then cp "$REPO/$f" "$LIVE/$f"; echo "installed $f"
    elif ! cmp -s "$REPO/$f" "$LIVE/$f"; then
      if [ "${FORCE:-0}" = 1 ]; then cp "$LIVE/$f" "$LIVE/$f.bak"; cp "$REPO/$f" "$LIVE/$f"; echo "replaced $f (old copy: $f.bak)"
      else echo "SKIPPED $f: the live copy differs (run collect first, or FORCE=1 to overwrite)"; fi
    fi
  done
  [ -d "$LIVE/node_modules/playwright-core" ] || (cd "$LIVE" && npm install --no-fund --no-audit)
  [ -e "$LIVE/relogin.mjs" ] || echo "NEXT: the USER makes ~/mrm-bot/relogin.mjs from relogin.example.mjs (see TUTORIAL.md, A4)."
  ;;
collect)
  for f in $(names); do
    if [ -e "$LIVE/$f" ] && ! cmp -s "$REPO/$f" "$LIVE/$f"; then cp "$LIVE/$f" "$REPO/$f"; echo "collected $f"; fi
  done
  if grep -l -i -E 'input\[type=password\]|pw\.value|CFID=[0-9]{3,}' "$REPO"/*.mjs 2>/dev/null | grep -v relogin.example.mjs; then
    echo "STOP: a file above holds a login or session token. Do not commit it."; exit 1
  fi
  ;;
*) sed -n '2,6p' "$0"; exit 1 ;;
esac
