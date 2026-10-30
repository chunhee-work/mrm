#!/usr/bin/env python3
"""ONE command for the end-of-batch checks (playbook 07/08/09), all cases in parallel.

  python3 checkall.py <batch_dir> [PLATE ...]

Per case it prints only problems:
  - EMPTY COND   rows with no Damage Condition
  - NO PRICE     rows with N/A / 0.00 price           (fix: fillprices.py)
  - QTY2 NO CMT  qty-2 sensor/bracket/hinge/strut rows without "LH & RH" comment
  - HINGE        a lone Boot Lid / Tailgate Hinge row that is not qty 2
  - DOOR?        Door Front/Rear LH/RH part with no photo of that door (Thatcham auto-add, Saga/Myvi)
  - SYNC         photo name <-> estimate row problems (tools/naming-desk/sync_check.py), if <batch_dir>/db_names exists
  - TOTAL        Adj Rpt total (Claim Subfolder page); "< 6000" is flagged
Needs <batch_dir>/ids.txt; photo names from ~/mrm-bot/photoplan.json.
"""
import json, os, re, subprocess, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from mrm import safe, par, ids, wait_login, H

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
CMT_RX = r"Sensor|Bracket|Hinge|Spring|Shock|Driveshaft|Strut|Retainer"


def main():
    b = sys.argv[1]; I = ids(os.path.join(b, "ids.txt")); plates = sys.argv[2:] or list(I)
    wait_login()
    photos = json.load(open(os.path.join(H, "photoplan.json")))
    tmp = os.path.join(b, "_one_ids")
    os.makedirs(tmp, exist_ok=True)

    def one(p):
        c, e = I[p]; probs = []
        f1 = os.path.join(tmp, p + ".txt"); open(f1, "w").write(f"{p} {c} {e}\n")
        rows = json.loads(safe("rows.mjs", c, e, "session_base.txt") or "[]")
        json.dump(rows, open(os.path.join(H, "state", f"rows_{p}_now.json"), "w"))
        open(os.path.join(H, "state", f"sel_{p}_now.json"), "w").write(safe("selstate.mjs", c, e, "session_base.txt"))
        empty = safe("emptycond.mjs", f1).strip().split(" ", 1)[-1]
        if empty not in ("[]", ""):
            probs.append("EMPTY COND " + empty)
        na = [x[0] for x in rows if x[2] in ("", "N/A", "0.00")]
        if na:
            probs.append("NO PRICE " + ", ".join(na))
        try:
            cm = json.loads(safe("cmtread.mjs", c, e) or "[]")
        except ValueError:
            cm = []
        has = {}
        for n, v in cm:
            has.setdefault(n, []).append(v.strip())
        for x in rows:
            if x[1] == "2" and re.search(CMT_RX, x[0]) and not re.search(r"Door .*Hinge", x[0]):
                key = re.sub(r"\s*\[.*$", "", x[0]).strip()
                if not any(v for k, vs in has.items() if k == key or k.startswith(key) for v in vs):
                    probs.append(f"QTY2 NO CMT {x[0]}")
        for ax in ("Front", "Rear"):   # user 2026-10-30: a front/rear bumper ALWAYS has its bumper brackets
            bump = [x for x in rows if re.search(rf"Bumper {ax} Cover|{ax} Bumper$|Bumper {ax}$", x[0])]
            brk = [x for x in rows if re.search(r"Bracket|Retainer", x[0]) and re.search(ax, x[0])]
            if bump and not brk:
                probs.append(f"NO {ax.upper()} BUMPER BRACKET (bumper selected, no {ax} bracket/retainer)")
        hinges = [x for x in rows if re.search(r"(Boot Lid|Tailgate) Hinge", x[0])]
        if len(hinges) == 1 and hinges[0][1] != "2":
            probs.append(f"HINGE {hinges[0][0]} qty {hinges[0][1]} (must be 2 + Rear LH & Rear RH)")
        names = {x[2] for x in photos.get(p, [])}
        for x in rows:
            m = re.match(r"Door (Front|Rear) (LH|RH)$", x[0])
            if m and not any(n.startswith(f"Door {m.group(1)} {m.group(2)}") for n in names):
                probs.append(f"DOOR? {x[0]} has no photo (Thatcham? delete with delrow.mjs)")
        tot = safe("adjtotal.mjs", f1).strip().split()
        t = tot[1] if len(tot) > 1 else "?"
        try:
            low = float(t.replace(",", "")) < 6000
        except ValueError:
            low = True
        probs.append(f"TOTAL RM{t}" + ("  < 6000 !" if low else ""))
        return p, probs

    res = par(one, plates)
    dbn = os.path.join(b, "db_names")
    if os.path.isdir(dbn):
        r = subprocess.run([sys.executable, os.path.join(REPO, "tools", "naming-desk", "sync_check.py"), dbn, *plates], capture_output=True, text=True)
        sync = r.stdout
    else:
        sync = ""
    for p, probs in res:
        bad = [x for x in probs if not x.startswith("TOTAL") or "!" in x]
        print(f"{p}: {'OK' if not bad else ''}  " + " | ".join(probs))
    if sync:
        bad = "\n".join(l for l in sync.splitlines() if l.strip() and not l.endswith(": OK"))
        print("SYNC: all OK" if not bad else "SYNC:\n" + bad)
    safe("closetabs.mjs")


if __name__ == "__main__":
    main()
