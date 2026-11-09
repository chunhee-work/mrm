#!/usr/bin/env python3
"""2026-11-09: click the download of chong's document bubble with agent-desktop (accessibility tree, no mouse, no screenshot).
  python3 wa_click.py "<file name>"     -> opens chong's chat (whatsapp:// link), finds the newest "Document, <name> ... Received from chong", clicks it.
Only call it when wa_fetch.sh says NEEDS_CLICK (the file is NOT downloaded yet; clicking a downloaded file would open it).
Prints CLICKED / NOT_FOUND."""
import json, subprocess, sys, time, os
AD = os.path.expanduser("~/.npm-global/bin/agent-desktop"); NAME = sys.argv[1]
subprocess.run(["open", "whatsapp://send?phone=60176204606"])
def snap():
    return json.loads(subprocess.run([AD, "snapshot", "--app", "WhatsApp", "-i", "--compact"], capture_output=True, text=True).stdout)
def find(n, inchat=False):
    nm = n.get("name") or ""
    if "Messages in chat with" in nm: inchat = "chong" in nm
    hit = None
    if inchat and n.get("ref_id") and nm.lstrip("‎").startswith("Document, " + NAME) and "Received from chong" in nm: hit = n["ref_id"]
    for c in n.get("children", []):
        hit = find(c, inchat) or hit          # keep the LAST (newest) match
    return hit
for t in range(10):
    d = snap(); ref = d.get("ok") and find(d["data"]["tree"])
    if ref: break
    time.sleep(1)
else:
    print("NOT_FOUND", NAME); sys.exit(1)
if os.environ.get("DRY"): print("FOUND", ref, NAME); sys.exit()
r = json.loads(subprocess.run([AD, "click", ref], capture_output=True, text=True).stdout)
print("CLICKED" if r.get("ok") else "CLICK_FAILED " + json.dumps(r.get("error"))[:200], NAME)
