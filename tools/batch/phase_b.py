#!/usr/bin/env python3
"""Phase B for the cases the user marked 「完成」 (one or more), run as soon as each one is done.

  python3 phase_b.py <batch_dir> <db_dir> PLATE [PLATE ...]
  TEST=1 ...   no Merimen writes: builds the final names + photoplan (PHOTOPLAN=<file> to write elsewhere) and the new draft plan only

<db_dir> = ArtifactData dump of the 照片命名台 collections `names` and `orders` (naming.py final reads it).
Steps per case: 1 final names (user edits + rules) -> 2 photoplan in the final order -> 3 photo upload with the final names
(photos.py: skips a case that already has photos, re-uploads drops) -> 4 new Step 2 draft from the final names, and the list of
photo names that changed since the head start (= what the REVISE planning agent must look at). Then Claude: REVISE agent (only if
something changed) -> apply_plan.py for these plates (ends with finish.py).
"""
import json, os, subprocess, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from mrm import H

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
ND = os.path.join(REPO, "tools", "naming-desk", "naming.py")
TEST = os.environ.get("TEST") == "1"
SUF = "_test" if TEST else ""   # TEST never overwrites the real s2 files


def names(f):
    try: return [r.get("name") for r in json.load(open(f))]
    except (OSError, ValueError): return []


def main():
    b, db, plates = sys.argv[1], sys.argv[2], sys.argv[3:]
    rep = os.path.join(b, "report")
    data = {p: json.load(open(os.path.join(b, "data", p + ".json"))) for p in plates}
    before = {p: names(os.path.join(rep, f"final_{p}.json")) for p in plates}       # Phase A = the model's names
    o = subprocess.run([sys.executable, ND, "final", rep, db, *plates], capture_output=True, text=True)
    print("1 final names:", (o.stdout + o.stderr).strip()[-400:])
    o = subprocess.run([sys.executable, ND, "plan", rep, b, *plates], capture_output=True, text=True)
    print("2 photoplan:", (o.stdout + o.stderr).strip()[-200:])
    if not TEST:
        subprocess.run([sys.executable, os.path.join(os.path.dirname(__file__), "photos.py"), "upload", b, *plates])
    else:
        print("3 TEST: no upload")
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
