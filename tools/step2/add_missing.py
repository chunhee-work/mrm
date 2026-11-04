#!/usr/bin/env python3
"""Add photo items that are missing from a finished estimate (user 2026-11-04 audit).

  python3 add_missing.py <audit_dir> PLATE ...     # audit_dir has <PLATE>.json (cid, ext) + out_<PLATE>.json (agent decisions)
  DRY=1 ...                                          # print only

decision "add"    -> tick that catalogue value (tickall.mjs only ADDS ticks) -> gonext -> fillprices APPLY -> fillempty
decision "manual" -> addparts.mjs row with the photo name, price from price_lookup ref --model (same group as a sibling part)
Then rows.mjs refresh. Nothing else is changed.
"""
import json, os, re, subprocess, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "batch"))
from mrm import safe, wait_login
H = os.path.expanduser("~/mrm-bot"); REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
DRY = os.environ.get("DRY") == "1"


def group(cat, name):
    want = "Front" if re.search(r"front|bonnet|headlamp|fender|grille|radiator|windscreen", name, re.I) else \
           "Rear" if re.search(r"rear|tailgate|boot|quarter|trunk|spare", name, re.I) else None
    for v, l in cat:
        if want and re.search(rf"Bumper {want} Cover", l):
            return v.split("@")[0]
    return cat[0][0].split("@")[0]


def model_text(p):
    import glob
    for f in glob.glob("/private/tmp/claude-501/*/*/scratchpad/*/meta.json"):
        try:
            m = json.load(open(f))
            if p in m: return m[p]
        except Exception: pass
    return ""


def submitted():
    """caseids in the worklist's stat=3 list (submitted, Pending for Approval) — read-only caselist.mjs"""
    f = os.path.join(H, "state", "caselist_now.json")
    safe("caselist.mjs", "session_base.txt", f, timeout=600)
    return {c for c, v in json.load(open(f)).items() if v.get("st") == 3}


def main():
    d, plates = sys.argv[1], sys.argv[2:]
    if not DRY: wait_login()
    st = submitted()
    for p in plates:
        t0 = __import__("time").time()
        inp = json.load(open(os.path.join(d, f"{p}.json")))
        if inp["cid"] in st:   # user 2026-11-04: a case already submitted (Pending for Approval) is NEVER touched
            print(f"{p}: SUBMITTED (pending approval) -> not touched", flush=True); continue
        out = json.load(open(os.path.join(d, f"out_{p}.json")))
        c, e = inp["cid"], inp["ext"]
        adds = sorted({v for x in out if x.get("decision") == "add" and x.get("value")
                       for v in (x["value"] if isinstance(x["value"], list) else [x["value"]])})
        man = []
        for x in out:
            if x.get("decision") == "manual" and x.get("manual_name") and not x.get("skip"):
                r = subprocess.run([sys.executable, os.path.join(REPO, "tools", "price_lookup.py"), "ref", x["manual_name"], "--model", model_text(p)],
                                   capture_output=True, text=True, cwd=REPO).stdout
                m = re.search(r"REF .*?RM([\d,]+\.\d\d)\s+<- median of (\d+) rows, ([^\n]*)", r)
                price = m.group(1).replace(",", "") if m and "OTHER TIER" not in m.group(3) else ""
                man.append([group(inp["catalogue"], x["manual_name"]), x["manual_name"], price, "1", ""])
        print(f"{p}: tick {adds} | manual {[(m[1], m[2] or 'NO PRICE') for m in man]}", flush=True)
        if DRY or not (adds or man):
            continue
        if adds:
            json.dump({"CP": adds, "N": [], "R": [], "CM": []}, open(f"{H}/s2/add_{p}.json", "w"))
            print("  ", safe("tickall.mjs", c, e, "session_base.txt", f"{H}/s2/add_{p}.json").strip().splitlines()[:1])
            safe("gonext.mjs", c, e, "session_base.txt")
        if man:
            json.dump([m for m in man if m[2]], open(f"{H}/s2/addman_{p}.json", "w"))
            print("  ", [l for l in safe("addparts.mjs", c, e, "session_base.txt", f"{H}/s2/addman_{p}.json", "save").splitlines() if "added" in l][:1])
        subprocess.run([sys.executable, os.path.join(REPO, "tools", "batch", "fillprices.py"), d, p], env={**os.environ, "APPLY": "1"}, capture_output=True)
        safe("fillempty.mjs", c, e, "session_base.txt")
        open(f"{H}/state/rows_{p}_now.json", "w").write(safe("rows.mjs", c, e, "session_base.txt"))
        print(f"   {p} done in {__import__('time').time() - t0:.0f} s", flush=True)


if __name__ == "__main__":
    main()
