#!/usr/bin/env python3
"""2026-11-03 retrain labels (user: "use back the image and knowledge to train").
Start from the PRE-merge labels (big_meta_n2.prev20261031c.tsv = build_big.py output before 名称对齐台 round 4),
re-apply today's name rules (name_map.final + name_decisions.json; banned -> dropped), re-apply user_corrections.json,
then append finished batches' photos with the user's final names (photoplan JSON: {PLATE: [[file, category, label], ...]}).
New photos are copied as 256 px JPEGs into data/<batch>/<PLATE>/ (data/ is not in git).
usage: python3 build_n3.py <photoplan.json> <ids.txt: PLATE caseid extid> <batch-tag> PLATE [PLATE ...]
writes big_meta_n3.tsv + big_paths_n3.txt; the first len(big_paths_n2.txt) rows match feats_big10n*.npy."""
import collections, json, os, sys
from PIL import Image
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from name_map import final

plan_f, ids_f, tag, plates = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4:]
rows = [l.rstrip("\n").split("\t") for l in open(os.path.join(HERE, "big_meta_n2.prev20261031c.tsv")) if l.strip()]
paths = open(os.path.join(HERE, "big_paths_n2.txt")).read().split("\n")
assert len(rows) == len(paths), (len(rows), len(paths))
UC = json.load(open(os.path.join(HERE, "user_corrections.json")))
st = collections.Counter()
for r in rows:
    key = "%s:%s" % (r[1], r[2])
    lab = UC.get(key, r[0])
    if key in UC and lab != r[0]: st["user_correction"] += 1
    if not lab: continue
    f = final(lab)
    if f is None:
        r[0] = ""; st["banned"] += 1
        if r[3] == "train": r[3] = "drop"
    else:
        if f != r[0]: st["renamed"] += 1
        r[0] = f
base_train = {r[0] for r in rows if r[3] == "train" and r[0]}   # a new photo trains only a name the model already has (build_big MIN rule)
plan = json.load(open(plan_f))
cid = {l.split()[0]: l.split()[1] for l in open(ids_f) if l.strip()}
for p in plates:
    out = os.path.join(HERE, "data", tag, p); os.makedirs(out, exist_ok=True)
    for seq, (src, _cat, lab) in enumerate(plan[p], 1):
        f = final(lab) if lab else None
        dst = os.path.join(out, "%03d.jpg" % seq)
        if not os.path.exists(dst):
            im = Image.open(src).convert("RGB"); im.thumbnail((256, 256)); im.save(dst, quality=90)
        paths.append(os.path.relpath(dst, HERE))
        rows.append([f or "", cid[p], str(seq), "train" if f in base_train else "skip"]); st["new " + ("train" if f in base_train else "skip")] += 1
open(os.path.join(HERE, "big_meta_n3.tsv"), "w").write("\n".join("\t".join(r) for r in rows) + "\n")
open(os.path.join(HERE, "big_paths_n3.txt"), "w").write("\n".join(paths))
tr = {r[0] for r in rows if r[3] == "train"}
print(dict(st), "rows", len(rows), "train rows", sum(r[3] == "train" for r in rows), "train labels", len(tr),
      "test rows", sum(r[3] == "test" and bool(r[0]) for r in rows))
