#!/usr/bin/env python3
"""照片命名台 (photo-naming review page) helper: build the page, merge the user's edits, write the upload plan.

  python3 naming.py build <out_dir> <meta.json>              -> <out_dir>/naming.html + <out_dir>/pics/<PLATE>.json
  python3 naming.py final <out_dir> <db_dir> [PLATE ...]     -> <out_dir>/final_<PLATE>.json (+ prints every user edit)
  python3 naming.py plan  <out_dir> <cases_root> [PLATE ...] -> adds/replaces <PLATE> in ~/mrm-bot/photoplan.json

<out_dir>    case_report.py output: rows_<PLATE>.json + photos/<PLATE>/NN.jpg (900 px copies for the page).
<meta.json>  {"<PLATE>": "<RC make/model text shown on the tab>"}; its keys choose which cases go on the page.
<db_dir>     ArtifactData out_dir after `list` of collections `names` and `orders` of the page
             (files <db_dir>/names/<PLATE>-NN.json and <db_dir>/orders/<PLATE>.json).
             `names` holds ONLY the photos the user renamed; `orders` only the cases the user reordered.
<cases_root> folder that holds <PLATE>/<original photo files> (the `src` of each row). The upload uses the originals.
PHOTOPLAN=<path> overrides the photoplan.json location (default ~/mrm-bot/photoplan.json).
"""
import base64, glob, json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "typesafe", "photo_train"))
from name_map import final as norm  # the user's naming rules; returns None for banned names (General View, TAIL LAMP…)

CORNERS = {"Front View Right", "Front View Left", "Rear View Right", "Rear View Left"}
FTYPE = {"Odometer Reading": "Odometer Reading", "Chassis Number": "Chassis Number", "Engine Compartment": "Engine view"}


def ftype(name):
    if name in CORNERS:
        return "4 angles of vehicle photos"
    return FTYPE.get(name, "Photographs of Damaged Parts")


def rows_of(out, plate):
    return json.load(open(os.path.join(out, "rows_%s.json" % plate), encoding="utf-8"))


def plates_in(out, given):
    return given or sorted(os.path.basename(f)[5:-5] for f in glob.glob(os.path.join(out, "rows_*.json")))


def build(out, meta_file):
    meta = json.load(open(meta_file, encoding="utf-8"))
    rows = {p: rows_of(out, p) for p in meta}
    names = set(json.load(open(os.path.join(HERE, "names.json"), encoding="utf-8")))
    for rs in rows.values():
        for r in rs:
            names.add(r["name"]); names.update(r.get("alts", []))
    js = lambda o: json.dumps(o, ensure_ascii=False).replace("</", "<\\/")
    tpl = open(os.path.join(HERE, "template.html"), encoding="utf-8").read()
    html = tpl.replace("__DATA__", js({"meta": meta, "rows": rows})).replace("__NAMES__", js(sorted(names)))
    open(os.path.join(out, "naming.html"), "w", encoding="utf-8").write(html)
    os.makedirs(os.path.join(out, "pics"), exist_ok=True)
    for p, rs in rows.items():
        pics = {str(r["n"]): "data:image/jpeg;base64," + base64.b64encode(open(os.path.join(out, r["img"]), "rb").read()).decode()
                for r in rs}
        json.dump(pics, open(os.path.join(out, "pics", p + ".json"), "w"))
        print(p, len(rs), "photos")
    print("publish %s/naming.html with files {\"pics/<PLATE>.json\": ...} to the existing artifact URL" % out)


def load_db(db):
    names, orders = {}, {}
    for f in glob.glob(os.path.join(db, "names", "*.json")):
        d = json.load(open(f, encoding="utf-8")); d = d.get("data", d)
        names[(d["case"], int(d["n"]))] = d["name"]
    for f in glob.glob(os.path.join(db, "orders", "*.json")):
        d = json.load(open(f, encoding="utf-8")); d = d.get("data", d)
        orders[d.get("case") or os.path.basename(f)[:-5]] = [int(x) for x in d["order"]]
    return names, orders


def final(out, db, plates):
    names, orders = load_db(db)
    for p in plates_in(out, plates):
        rs = rows_of(out, p)
        if p in orders:
            by_n = {r["n"]: r for r in rs}
            rs = [by_n[n] for n in orders[p] if n in by_n] + [r for r in rs if r["n"] not in orders[p]]
        fixes = []
        for r in rs:
            raw = names.get((p, r["n"]), r["name"])
            if (p, r["n"]) in names:
                r["user"] = True
                if raw != r["name"]:
                    print("  %s #%d  model: %s  ->  user: %s" % (p, r["n"], r["name"], raw))
            n = norm(raw)
            if n is None:
                fixes.append("#%d %s" % (r["n"], raw)); n = raw
            r["name"] = n
        json.dump(rs, open(os.path.join(out, "final_%s.json" % p), "w", encoding="utf-8"), ensure_ascii=False)
        print(p, len(rs), "photos", "reordered" if p in orders else "", ("NEEDS A NAME (banned): " + ", ".join(fixes)) if fixes else "")


def plan(out, root, plates):
    pf = os.environ.get("PHOTOPLAN") or os.path.expanduser("~/mrm-bot/photoplan.json")
    pp = json.load(open(pf, encoding="utf-8")) if os.path.exists(pf) else {}
    for p in plates_in(out, plates):
        fp = os.path.join(out, "final_%s.json" % p)
        if not os.path.exists(fp):
            sys.exit("run `final` first: %s missing" % fp)
        rs = json.load(open(fp, encoding="utf-8"))
        missing = [r["src"] for r in rs if not os.path.exists(os.path.join(root, p, r["src"]))]
        if missing:
            sys.exit("%s: original photos not found under %s/%s: %s" % (p, root, p, missing[:5]))
        pp[p] = [[os.path.join(root, p, r["src"]), ftype(r["name"]), r["name"]] for r in rs]
        print(p, len(rs), "photos ->", pf)
    json.dump(pp, open(pf, "w", encoding="utf-8"), ensure_ascii=False)


if __name__ == "__main__":
    a = sys.argv[1:]
    if len(a) < 3 or a[0] not in ("build", "final", "plan"):
        sys.exit(__doc__)
    {"build": lambda: build(a[1], a[2]), "final": lambda: final(a[1], a[2], a[3:]), "plan": lambda: plan(a[1], a[2], a[3:])}[a[0]]()
