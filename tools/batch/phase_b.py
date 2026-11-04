#!/usr/bin/env python3
"""Phase B for the cases the user marked 「完成」 (one or more), run as soon as each one is done.

  python3 phase_b.py <batch_dir> <db_dir> PLATE [PLATE ...]
  TEST=1 ...   no Merimen writes: builds the final names + photoplan (PHOTOPLAN=<file> to write elsewhere) and the new draft plan only

<db_dir> = ArtifactData dump of the 照片命名台 collections `names` and `orders` (naming.py final reads it).
Steps per case: 1 final names (user edits + rules) -> 2 photoplan in the final order -> 3 photos (user 2026-11-04):
  - not in Merimen yet (the user pressed 完成 before Phase A reached the upload) -> upload with the final names and order;
  - already uploaded in Phase A with the model's names -> check Merimen = old plan, relabel_ui (changed names), reorder_ui
    (changed order), check Merimen = new plan -> 4 new Step 2 draft from the final names, and the list of
photo names that changed since the head start (= what the REVISE planning agent must look at). Then Claude: REVISE agent (only if
something changed) -> apply_plan.py for these plates (ends with finish.py).
"""
import json, os, re, subprocess, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from mrm import H, safe, ids, wait_login

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
ND = os.path.join(REPO, "tools", "naming-desk", "naming.py")
TEST = os.environ.get("TEST") == "1"
SUF = "_test" if TEST else ""   # TEST never overwrites the real s2 files


def names(f):
    try: return [r.get("name") for r in json.load(open(f))]
    except (OSError, ValueError): return []


def maps(old, new):
    """relabel map {pos: [old name, new name]} on the CURRENT (old) order, and reorder map {pos: [name after relabel, new pos]}
    for every photo, matched by the original file (src)."""
    lab = {}; ordm = {}; pos = {}
    for j, x in enumerate(new):
        pos.setdefault(x[0], []).append((j + 1, x[2]))
    for i, x in enumerate(old):
        j, nm = pos[x[0]].pop(0) if pos.get(x[0]) else (i + 1, x[2])
        if nm != x[2]:
            lab[str(i + 1)] = [x[2], nm]
        ordm[str(i + 1)] = [nm, j]
    return lab, ordm


def main():
    b, db, plates = sys.argv[1], sys.argv[2], sys.argv[3:]
    rep = os.path.join(b, "report")
    data = {p: json.load(open(os.path.join(b, "data", p + ".json"))) for p in plates}
    before = {p: names(os.path.join(rep, f"final_{p}.json")) for p in plates}       # Phase A = the model's names
    PPF = os.environ.get("PHOTOPLAN") or os.path.join(H, "photoplan.json")
    oldplan = {p: json.load(open(PPF)).get(p, []) for p in plates}
    I = ids(os.path.join(b, "ids.txt")); have = {}
    if not TEST:
        wait_login()
        for p in plates:   # Merimen vs the OLD plan, before the plan file changes
            o = safe("chkorder.mjs", p, *I[p]).strip().splitlines()[-1]; m = re.search(r"photos (\d+) plan (\d+) mismatch (\d+)", o)
            have[p] = (int(m.group(1)), int(m.group(3))) if m else (0, 0)
    o = subprocess.run([sys.executable, ND, "final", rep, db, *plates], capture_output=True, text=True)
    print("1 final names:", (o.stdout + o.stderr).strip()[-400:])
    o = subprocess.run([sys.executable, ND, "plan", rep, b, *plates], capture_output=True, text=True)
    print("2 photoplan:", (o.stdout + o.stderr).strip()[-200:])
    newplan = {p: json.load(open(PPF)).get(p, []) for p in plates}
    up = [p for p in plates if not TEST and have[p][0] == 0]
    if up:
        subprocess.run([sys.executable, os.path.join(os.path.dirname(__file__), "photos.py"), "upload", b, *up])
    for p in plates:
        lab, ordm = maps(oldplan[p], newplan[p])
        print(f"3 {p}: " + ("upload with final names" if p in up else f"relabel {len(lab)} · reorder {sum(1 for k, v in ordm.items() if int(k) != v[1])}"))
        json.dump(lab, open(os.path.join(b, f"relabel_{p}.json"), "w")); json.dump(ordm, open(os.path.join(b, f"reorder_{p}.json"), "w"))
        if TEST or p in up:
            continue
        n, bad = have[p]
        if bad or n != len(oldplan[p]):
            print(f"   {p}: Merimen has {n} photos / {bad} mismatches vs the Phase A plan -> NOT relabelled, fix by hand (playbook 06)"); continue
        if lab:   # one case at a time: parallel relabel windows close each other's popups (batch 8)
            print("   " + safe("relabel_ui.mjs", *I[p], json.dumps(lab), "save").strip().splitlines()[-1][:150])
        if any(int(k) != v[1] for k, v in ordm.items()):
            print("   " + safe("reorder_ui.mjs", *I[p], os.path.join(b, f"reorder_{p}.json"), "save").strip().splitlines()[-1][:150])
        print("   " + safe("chkorder.mjs", p, *I[p]).strip().splitlines()[-1][:150])
    for p in plates:
        fin = os.path.join(rep, f"final_{p}.json"); after = names(fin)
        changed = sorted({n for n in after if n} - {n for n in before[p] if n})
        gone = sorted({n for n in before[p] if n} - {n for n in after if n})
        cat = os.path.join(H, "s2", f"cat_{p}.json")
        if os.path.exists(cat):
            imp = data[p].get("report", {}).get("impact") or data[p]["case"]["acc"].get("impact", "front")
            r = subprocess.run([sys.executable, os.path.join(REPO, "typesafe", "step2_plan.py"), f"s2/cat_{p}.json", fin, imp,
                                f"s2/tick_{p}{SUF}.json", f"s2/miss_{p}{SUF}.json"], cwd=H, capture_output=True, text=True,
                               env={**os.environ, "VEHICLE": data[p]["case"]["veh"].get("modelText", "")})
            open(os.path.join(H, "s2", f"plan_{p}{SUF}.log"), "w").write(r.stdout + r.stderr)
        print(f"4 {p}: new names {changed or '-'} | removed {gone or '-'}" + ("" if os.path.exists(cat) else " | NO head-start catalogue"))
        json.dump({"new": changed, "removed": gone}, open(os.path.join(b, f"revise_{p}.json"), "w"), indent=1)


if __name__ == "__main__":
    main()
