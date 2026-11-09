#!/bin/bash
# Copy a WhatsApp document (message id from wa_watch.sh) to ~/Downloads without the right-click "Save to Downloads" menu.
#   tools/whatsapp/wa_fetch.sh <msg_id> [wait_seconds=600]
# WhatsApp keeps a downloaded document at Message/<ZMEDIALOCALPATH>. If it is not downloaded yet, prints NEEDS_CLICK once:
# Claude clicks the download arrow on that bubble (playbook 00) and this script keeps waiting until the file is complete.
# Read-only on WhatsApp's data; prints "SAVED <path> <bytes>".
G="$HOME/Library/Group Containers/group.net.whatsapp.WhatsApp.shared"; DB="$G/ChatStorage.sqlite"; ID=$1; W=${2:-600}
row=$(sqlite3 -separator '|' "file:$DB?mode=ro" "select coalesce(m.ZTEXT,'file'), coalesce(i.ZMEDIALOCALPATH,''), coalesce(i.ZFILESIZE,0) from ZWAMESSAGE m left join ZWAMEDIAITEM i on m.ZMEDIAITEM=i.Z_PK where m.Z_PK=$ID;")
name=${row%%|*}; rest=${row#*|}; size=${rest##*|}
said=0
for ((t=0; t<W; t+=5)); do
  lp=$(sqlite3 "file:$DB?mode=ro" "select coalesce(i.ZMEDIALOCALPATH,'') from ZWAMESSAGE m join ZWAMEDIAITEM i on m.ZMEDIAITEM=i.Z_PK where m.Z_PK=$ID;")
  f="$G/Message/$lp"
  if [ -n "$lp" ] && [ -f "$f" ] && [ "$(stat -f %z "$f")" = "$size" ]; then
    dst="$HOME/Downloads/$name"; n=1; while [ -e "$dst" ]; do dst="$HOME/Downloads/${name%.*} ($n).${name##*.}"; n=$((n+1)); done
    cp "$f" "$dst"; echo "SAVED $dst $(stat -f %z "$dst")"; exit 0
  fi
  # 2026-11-09: agent-desktop clicks the bubble itself (wa_click.py); NEEDS_CLICK only if that fails
  [ $said = 0 ] && { python3 "$(dirname "$0")/wa_click.py" "$name" || echo "NEEDS_CLICK $name ($size bytes): click the download arrow in chong's chat"; said=1; }
  sleep 5
done
echo "TIMEOUT $name"; exit 1
