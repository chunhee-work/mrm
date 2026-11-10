#!/bin/bash
# Watch WhatsApp (read-only) for ANY new message from chong (file, photo, text — 2026-11-10: an RC photo + text were missed when only files were watched) (+60 17-620 4606). Costs no tokens while waiting.
#   tools/whatsapp/wa_watch.sh          -> run in the background (Bash run_in_background); exits when a new file arrives,
#                                          after 90 s more for any extra files, printing one NEW: line per message, then one ROUTE line per burst
#                                          (tools/whatsapp/wa_route.py: AUTO_INTAKE / FILE_TO_CASE / ASK_USER / LOG). Then Claude
#                                          does "do the new case" (playbook 00: WhatsApp download + Phase A).
# Reads ChatStorage.sqlite with mode=ro only. Message type 8 = document. Last seen id kept in ~/.wa_watch_last.
DB="$HOME/Library/Group Containers/group.net.whatsapp.WhatsApp.shared/ChatStorage.sqlite"
JID="60176204606@%"; ST="$HOME/.wa_watch_last"
q() { sqlite3 "file:$DB?mode=ro" "select m.Z_PK||' | '||datetime(m.ZMESSAGEDATE+978307200,'unixepoch','localtime')||' | '||case m.ZMESSAGETYPE when 8 then 'FILE' when 1 then 'PHOTO' when 0 then 'TEXT' else 'TYPE'||m.ZMESSAGETYPE end||' | '||coalesce(m.ZTEXT,'')||' | '||coalesce(i.ZFILESIZE,0)
  from ZWAMESSAGE m join ZWACHATSESSION s on m.ZCHATSESSION=s.Z_PK left join ZWAMEDIAITEM i on m.ZMEDIAITEM=i.Z_PK
  where s.ZCONTACTJID like '$JID' and m.ZISFROMME=0 and m.Z_PK>$1 order by m.Z_PK;" 2>/dev/null; }
[ -f "$ST" ] || sqlite3 "file:$DB?mode=ro" "select max(m.Z_PK) from ZWAMESSAGE m join ZWACHATSESSION s on m.ZCHATSESSION=s.Z_PK where s.ZCONTACTJID like '$JID' and m.ZISFROMME=0;" > "$ST"
LAST=$(cat "$ST"); echo "watching WhatsApp from id $LAST ($(date +%H:%M:%S))"
while :; do
  NEW=$(q "$LAST")
  if [ -n "$NEW" ]; then
    sleep 90; NEW=$(q "$LAST")                       # chong often sends 2 files a few minutes apart
    echo "$NEW" | sed 's/^/NEW: /'
    # 2026-11-10: one ROUTE line per burst (code rules for files + Jev with gates). Only prints; Claude acts on it.
    python3 "$(dirname "$0")/wa_route.py" "$LAST" 2>/dev/null || echo "ROUTE other - 0.00 ASK_USER wa_route.py failed"
    echo "$NEW" | tail -1 | cut -d' ' -f1 > "$ST"; exit 0
  fi
  sleep 30
done
