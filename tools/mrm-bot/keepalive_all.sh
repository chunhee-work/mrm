#!/bin/bash
# keep every account window's Merimen session alive (user 2026-11-06: 4 windows). keepalive.mjs clicks "Continue Session".
cd "$(dirname "$0")"
for p in 9223 9224 9225; do pgrep -f "KA_PORT=$p" >/dev/null || (CDP=http://127.0.0.1:$p nohup node keepalive.mjs KA_PORT=$p > state/keepalive_$p.log 2>&1 &); done
pgrep -f "node keepalive.mjs$" >/dev/null || (nohup node keepalive.mjs > state/keepalive_9222.log 2>&1 &)
