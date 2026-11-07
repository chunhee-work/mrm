#!/usr/bin/env python3
"""2026-11-07 (user: "ok proceed"): labels n4 = n3 + label audits 5 and 6 + the harvested rare-part photos.
- start from big_meta_n3.tsv / big_paths_n3.txt (rows 0..N-1 match feats_big10n3*.npy, so old features are reused)
- audit 5: relabel by photo path + name merges; audit 6: relabel by row index (only when the row still has the audited label)
- every label goes through name_map.final (banned -> dropped from training)
- append index.jsonl entries that carry "rare" (harvest_rare.mjs: rare parts + the photo before/after) with their Merimen
  caption -> name_map.tsv official name -> final. "General View Left/Right" and generic captions = context only ("skip").
writes big_meta_n4.tsv + big_paths_n4.txt"""
import collections, json, os, re, sys
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
from name_map import final
rows = [l.rstrip("\n").split("\t") for l in open(os.path.join(HERE, "big_meta_n3.tsv")) if l.strip()]
paths = open(os.path.join(HERE, "big_paths_n3.txt")).read().split("\n")[:len(rows)]
assert len(rows) == len(paths), (len(rows), len(paths))
st = collections.Counter()
A5 = json.load(open(os.path.join(HERE, "label_fixes_audit5.json"))); MER = A5.get("merges", {})
pidx = {p: i for i, p in enumerate(paths)}
for p, lab in A5.get("relabel", {}).items():
    i = pidx.get(p)
    if i is not None and rows[i][0] != lab: rows[i][0] = lab; st["audit5 relabel"] += 1
for x in json.load(open(os.path.join(HERE, "label_fixes_audit6.json"))):
    i = x["i"]
    if i < len(rows) and rows[i][0] == x["old"]: rows[i][0] = x["new"]; st["audit6 relabel"] += 1
def norm(lab):
    if not lab: return ""
    lab = MER.get(lab, lab); f = final(lab)
    return "" if f is None else MER.get(f, f)
for r in rows:
    if not r[0]: continue
    f = norm(r[0])
    if not f:
        st["banned"] += 1; r[0] = ""
        if r[3] == "train": r[3] = "drop"
    elif f != r[0]: st["renamed"] += 1; r[0] = f
base_train = {r[0] for r in rows if r[3] == "train" and r[0]}
NM = {}
for l in open(os.path.join(HERE, "name_map.tsv")):
    q = l.rstrip("\n").split("\t")
    if len(q) == 4 and q[2]: NM[q[0]] = q[2]
GEN = re.compile(r"pho\w*\s+of\s+da|damaged parts|after repair|accident scene|^4 angles|^general view", re.I)
known = {(r[1], r[2]) for r in rows}
for l in open(os.path.join(HERE, "index.jsonl")):
    d = json.loads(l)
    if "rare" not in d or (d["cid"], str(d["seq"])) in known: continue
    cap = d["name"].strip(); lab = "" if GEN.search(cap) else norm(NM.get(cap, cap))
    split = "train" if lab and lab in base_train else "skip"
    rows.append([lab, d["cid"], str(d["seq"]), split]); paths.append(os.path.join("data", d["file"])); known.add((d["cid"], str(d["seq"])))
    st["new " + split] += 1
open(os.path.join(HERE, "big_meta_n4.tsv"), "w").write("\n".join("\t".join(r) for r in rows) + "\n")
open(os.path.join(HERE, "big_paths_n4.txt"), "w").write("\n".join(paths))
tr = collections.Counter(r[0] for r in rows if r[3] == "train")
print(dict(st)); print("rows", len(rows), "train rows", sum(tr.values()), "train labels", len(tr), "labels < 100:", sum(1 for v in tr.values() if v < 100))
