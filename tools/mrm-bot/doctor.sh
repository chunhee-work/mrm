#!/bin/bash
# Read-only health check for the Merimen setup. Run at the start of every session:
#   bash tools/mrm-bot/doctor.sh
# Never prints session tokens or passwords (Merimen tab URLs carry tokens, so only the page name is shown).
REPO="$(cd "$(dirname "$0")/../.." && pwd)"; LIVE="$HOME/mrm-bot"; PT="$REPO/typesafe/photo_train"
ok() { echo "  OK    $*"; }; bad() { echo "  FIX   $*"; }; info() { echo "  info  $*"; }

echo "Tools"
command -v node >/dev/null && ok "node $(node -v)" || bad "install Node.js 18+ (brew install node)"
command -v python3 >/dev/null && ok "$(python3 --version)" || bad "install python3"
python3 -c "import fitz" 2>/dev/null && ok "PyMuPDF (PDF pages)" || bad "pip3 install pymupdf"
[ -x /tmp/rclick ] && ok "/tmp/rclick (WhatsApp clicks)" || info "/tmp/rclick missing (only for WhatsApp download): swiftc -O $REPO/tools/rclick.swift -o /tmp/rclick"

echo "Scripts (~/mrm-bot)"
[ -d "$LIVE/node_modules/playwright-core" ] && ok "playwright-core installed" || bad "bash $REPO/tools/mrm-bot/sync.sh install"
out=$(bash "$REPO/tools/mrm-bot/sync.sh" diff 2>/dev/null | tail -1); [[ "$out" == 0* ]] && ok "live copy = repo copy" || info "$out  (bash tools/mrm-bot/sync.sh diff)"
[ -e "$LIVE/relogin.mjs" ] && ok "relogin.mjs present (local only, never commit)" || bad "the USER creates ~/mrm-bot/relogin.mjs (TUTORIAL.md A4)"
if [ -s "$LIVE/session_base.txt" ] && grep -q "CFID=.*RID=" "$LIVE/session_base.txt"; then ok "session_base.txt present"; else bad "no session: ask the USER to run  cd ~/mrm-bot && node relogin.mjs"; fi

echo "Automation Chrome (port 9222)"
if v=$(curl -s --max-time 3 http://127.0.0.1:9222/json/version); then
  ok "$(echo "$v" | python3 -c 'import json,sys;print(json.load(sys.stdin).get("Browser",""))')"
  curl -s --max-time 3 http://127.0.0.1:9222/json/list | python3 -c '
import json,sys,re
t=[x for x in json.load(sys.stdin) if x.get("type")=="page"]
m=[x for x in t if "merimen" in x.get("url","")]
print("  info  %d tab(s), %d Merimen tab(s)" % (len(t),len(m)))
for x in m:
    fa=(re.search(r"fuseaction=([A-Za-z_]+)",x["url"]) or [None,"(no page name)"])[1]
    print("  info  Merimen tab:", fa, "|", x.get("title","")[:60])
if not t: print("  FIX   no window: open -na \"Google Chrome\" --args --remote-debugging-port=9222 --user-data-dir=\"$HOME/.agent-browser-chrome\"")
if len(t)>3: print("  info  close leftover tabs (keep one Merimen tab)")'
else bad "start it: open -na \"Google Chrome\" --args --remote-debugging-port=9222 --user-data-dir=\"\$HOME/.agent-browser-chrome\""; fi
pgrep -f "node keepalive.mjs" >/dev/null && ok "keepalive.mjs running" || bad "cd ~/mrm-bot && nohup node keepalive.mjs >> keepalive.log 2>&1 &"

echo "Photo model (typesafe/photo_train)"
[ -x "$PT/.venv/bin/python" ] && ok ".venv" || bad "cd $PT && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt"
for m in dinov2_b_big10a.pt seq_best.pt seq_best_crop.pt; do [ -e "$PT/models/$m" ] && ok "models/$m" || bad "models/$m missing (not in git: copy from the old Mac, see TUTORIAL.md A6)"; done
if [ -n "${TYPESAFE_API_KEY:-}" ] || security find-generic-password -a "$USER" -s TYPESAFE_API_KEY >/dev/null 2>&1; then ok "TypeSafe key (Jev second opinion)"; else info "no TypeSafe key: run predict with JEV=0"; fi

echo "Repo"
[ -e "$REPO/memory/MEMORY.md" ] && ok "memory/ ($(ls "$REPO/memory" | wc -l | tr -d ' ') files)" || bad "memory/ missing"
c=$(git -C "$REPO" status --porcelain | wc -l | tr -d ' '); [ "$c" = 0 ] && ok "git clean" || info "$c uncommitted change(s)"
