#!/usr/bin/env python3
"""Per-case photo naming for the 照片命名台 review page (user workflow 2026-10-16).
  .venv/bin/python case_report.py <case_dir> <PLATE> "<vehicle model>" <out_dir>
Names every photo in the folder with predict_case.py, puts the identification shots first when the folder
order is wrong, applies the opening rule, and writes <out_dir>/rows_<PLATE>.json + photos/<PLATE>/NN.jpg."""
import glob, json, os, re, subprocess, sys
from PIL import Image
HERE = os.path.dirname(os.path.abspath(__file__))
FIX = {"ENGINEVIEW": "Engine Compartment", "FRT GENERAL VIEW": "Front View"}
OPEN = ["Front View Right", "Front View Left", "Rear View Right", "Rear View Left"]
ID_ORDER = ["Interior View", "Road Tax", "Odometer Reading", "Chassis Number", "Engine Compartment"]


def key(f):
    b = os.path.basename(f); m = re.match(r"(\d+)", b)
    return (int(m.group(1)) if m else 10 ** 9, int((re.search(r"\((\d+)\)", b) or [0, 0])[1]), b)


from name_map import final as _final


def name_of(p):
    """best model name after the user's naming rules (name_map.final); names the user banned fall to the next guess"""
    for t in p["top"]:
        n = _final(FIX.get(t[0], t[0]))
        if n: return n
    return FIX.get(p["top"][0][0], p["top"][0][0])


def is_view(p):
    n = name_of(p)
    return bool(re.search(r"\bview\b", n, re.I)) and n not in ("Interior View",) or n in OPEN


def arrange(P):
    """Identification block = 4 corner views, then Interior View/Road Tax, Odometer, Chassis, Engine Compartment.
    user 2026-10-16 'if u detect then u arrange'; user 2026-10-30 (PRY826): whenever the folder order is wrong (corner views
    not first, ID shots not right after them) Claude arranges it in the 照片命名台 BEFORE the user reviews — the user should
    never have to drag the opening shots. Looks at the first 16 photos only."""
    W = WI = len(P)   # user 2026-10-30: look through ALL photos, first to last
    ids = []
    for n in ID_ORDER:
        hit = [i for i in range(WI) if name_of(P[i]) == n and P[i]["conf"] >= 0.5]
        ids += hit if n == "Engine Compartment" else hit[:1]
    views = [next(i for i in range(W) if name_of(P[i]) == n) for n in OPEN if any(name_of(P[i]) == n for i in range(W))]
    views += [i for i in range(W) if is_view(P[i]) and i not in ids and i not in views][:4 - len(views)]
    views.sort(key=lambda i: (OPEN.index(name_of(P[i])) if name_of(P[i]) in OPEN else 9, i))   # FVR, FVL, RVR, RVL (names are given by position)
    if not ids and len(views) < 4:
        return list(range(len(P))), False
    want = views + sorted(ids, key=lambda i: (ID_ORDER.index(name_of(P[i])), i))
    order = want + [i for i in range(len(P)) if i not in want]
    return order, order != list(range(len(P)))


def main(case_dir, plate, vehicle, out):
    fs = sorted([f for f in glob.glob(os.path.join(case_dir, "*")) if re.search(r"\.jpe?g$", f, re.I)], key=key)
    r = subprocess.run([os.path.join(HERE, ".venv/bin/python"), os.path.join(HERE, "predict_case.py"),
                        os.path.join(HERE, "models/dinov2_b_big10a.pt")] + fs,
                       capture_output=True, text=True, env=dict(os.environ, VEHICLE=vehicle), cwd=HERE)
    P = [json.loads(l) for l in r.stdout.splitlines() if l.startswith("{")]
    order, moved = arrange(P)
    os.makedirs(os.path.join(out, "photos", plate), exist_ok=True); rows = []
    # user 2026-10-16: photos are sometimes MISSING. The corner views are the photos before the first ID shot
    # (Interior View / Road Tax / Odometer / Chassis); with fewer than 4, name them from the model's view guess and flag them.
    PO = [P[i] for i in order]
    first_id = next((k for k, p in enumerate(PO[:12]) if name_of(p) in ID_ORDER[:4] and p["conf"] >= 0.5), 4)
    nviews = min(first_id, 4)
    for k, p in enumerate(PO, 1):
        name, how = name_of(p), "model"
        if k <= nviews:
            if nviews == 4:
                name, how = OPEN[k - 1], "rule"
            else:   # missing corner view(s): keep the model's own view name if it has one, else the next in order; user checks
                vn = [t[0] for t in p["top"] if FIX.get(t[0], t[0]) in OPEN]
                name, how = (vn[0] if vn else OPEN[k - 1]), "check"
        elif k == nviews + 1 and name in ("Front Windscreen", "Interior View"):
            name, how = "Interior View", "rule"
        im = Image.open(p["file"]).convert("RGB"); im.thumbnail((900, 900))
        fn = "photos/%s/%02d.jpg" % (plate, k); im.save(os.path.join(out, fn), quality=82)
        rows.append(dict(n=k, name=name, conf=p["conf"] if how != "check" else min(p["conf"], .5), how=how if how != "check" else "model",
                         jev=p.get("jev", False), alts=[a for a in (_final(FIX.get(t[0], t[0])) for t in p["top"][1:4]) if a and a != name][:2], src=os.path.basename(p["file"]), img=fn))
    have = {r["name"] for r in rows[:12]}
    missing = [n for n in OPEN + ["Odometer Reading", "Chassis Number", "Engine Compartment"] if n not in have]
    if not ({"Interior View", "Road Tax"} & have): missing.insert(4, "Interior View / Road Tax")
    if missing: print("%s pending %s photo" % (plate, ", ".join(missing)))
    json.dump(rows, open(os.path.join(out, "rows_%s.json" % plate), "w"), ensure_ascii=False)
    print(plate, len(rows), "photos", "REORDERED" if moved else "order kept", sum(r["conf"] < .6 and r["how"] == "model" for r in rows), "unsure")


if __name__ == "__main__":
    main(*sys.argv[1:5])
