#!/usr/bin/env python3
"""Auto-fix + check after apply_plan (batch 7, 2026-11-04: these fixes took ~15 min by hand).

  BATCH_DIR=<b> [NAMES_DIR=<db dump>/names] [WORKSHOP="LEE KEAN HIN"] python3 tools/step2/finish.py PLATE ...

Per case, in parallel:
  1. delrow the plan's "delete" rows (Thatcham auto-adds such as Door Rear LH/RH with no photo)
  2. fillprices APPLY (N/A rows -> other side / price lists / price_lookup; flags < 5 refs)
  3. qty-2 Sensor/Bracket/Hinge/Strut... rows with no comment -> "Front LH & Front RH" / "Rear LH & Rear RH" (08)
Then checkall.py and sync_check.py (when NAMES_DIR is given), and the Google Sheet rows (09) to paste.
"""
import datetime, json, os, re, subprocess, sys
HERE = os.path.dirname(os.path.abspath(__file__)); REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
sys.path.insert(0, os.path.join(REPO, "tools", "batch"))
from mrm import safe, par, ids, wait_login, H
from checkall import CMT_RX

B = os.environ["BATCH_DIR"]; I = ids(os.path.join(B, "ids.txt")); plates = sys.argv[1:] or list(I)


def rows(c, e):
    return json.loads(safe("rows.mjs", c, e, "session_base.txt") or "[]")


def one(p):
    c, e = I[p]; out = []
    P = json.load(open(f"{H}/s2/final_plan_{p}.json"))
    if P.get("delete"):
        o = safe("delrow.mjs", c, e, "session_base.txt", "|".join(P["delete"])); out.append("deleted " + (o.strip().splitlines() or [""])[-1][:160])
    o = subprocess.run([sys.executable, os.path.join(REPO, "tools/batch/fillprices.py"), B, p], env={**os.environ, "APPLY": "1"},
                       capture_output=True, text=True, cwd=REPO).stdout.strip()
    if o: out.append("prices: " + " | ".join(o.splitlines()))
    try:
        cm = json.loads(safe("cmtread.mjs", c, e) or "[]")
    except ValueError:
        cm = []
    has = {n for n, v in cm if v.strip()}
    fix = {}
    for x in rows(c, e):
        key = re.sub(r"\s*\[.*$", "", x[0]).strip()
        if x[1] == "2" and re.search(CMT_RX, key) and not re.search(r"Door .*Hinge", key) and key not in has:
            ax = "Front" if re.search(r"\bF(ro)?nt\b|Front", key) else "Rear" if re.search(r"\bRe?a?r\b|Rear|Tailgate|Boot", key) else None
            if ax: fix[key] = f"{ax} LH & {ax} RH"
    if fix:
        f = f"{H}/s2/autocmt_{p}.json"; json.dump(fix, open(f, "w"))
        safe("setcmt.mjs", c, e, "session_base.txt", f); out.append("comments: " + json.dumps(fix))
    open(f"{H}/state/rows_{p}_now.json", "w").write(json.dumps(rows(c, e)))
    print(f"== {p}\n  " + ("\n  ".join(out) or "nothing to fix"), flush=True)


wait_login()
par(one, plates)
print(subprocess.run([sys.executable, os.path.join(REPO, "tools/batch/checkall.py"), B] + plates, capture_output=True, text=True, cwd=REPO).stdout)
if os.environ.get("NAMES_DIR"):
    print(subprocess.run([sys.executable, os.path.join(REPO, "tools/naming-desk/sync_check.py"), os.environ["NAMES_DIR"]] + plates,
                         capture_output=True, text=True, cwd=REPO).stdout)
d = datetime.date.today().strftime("%d/%m/%Y"); w = os.environ.get("WORKSHOP", "?")
print("SHEET ROWS\n" + "\n".join(f"{d}\t{p}\t{w}\tD" for p in plates))
