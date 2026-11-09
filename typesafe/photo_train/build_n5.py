#!/usr/bin/env python3
"""2026-11-09: labels n5 = n4 (rows kept in the same order, so old features are reused) + the user's decisions:
- label_map100.json (🏷️ 名字对应台): old -> new name | KEEP | DROP | MAKE (badge "(LOGO)" -> "(<MAKE>)" from lamp_models.json, if that name is in names.json, else drop)
- label_fixes_daily.json (🎯 每日确认台): per row, choice other -> new name, keep, unsure -> drop from training
- train_queue.tsv (batch 8+9 photos): appended as new train rows (label must be a known train label, else skip)
writes big_meta_n5.tsv + big_paths_n5.txt"""
import collections, json, os, sys
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
from name_map import final
rows = [l.rstrip("\n").split("\t") for l in open(os.path.join(HERE, "big_meta_n4.tsv")) if l.strip()]
paths = open(os.path.join(HERE, "big_paths_n4.txt")).read().split("\n")[:len(rows)]
UN = json.load(open(os.path.join(HERE, "..", "..", "tools", "naming-desk", "names.json"))); UN = set(UN if isinstance(UN, list) else UN.get("names", UN))
MAP = json.load(open(os.path.join(HERE, "label_map100.json")))
DAY = json.load(open(os.path.join(HERE, "label_fixes_daily.json")))
MK = json.load(open(os.path.join(HERE, "lamp_models.json")))
MER = json.load(open(os.path.join(HERE, "label_fixes_audit5.json"))).get("merges", {})
def norm(lab):
    if not lab: return ""
    lab = MER.get(lab, lab); f = final(lab)
    return "" if f is None else MER.get(f, f)
st = collections.Counter()
def drop(r, why):
    st[why] += 1
    if r[3] == "train": r[3] = "drop"
for i, r in enumerate(rows):
    d = DAY.get(str(i))
    if d and r[0] == d.get("old"):
        if d["choice"] == "other" and d["name"]: r[0] = d["name"]; st["daily rename"] += 1
        elif d["choice"] == "unsure": drop(r, "daily unsure -> drop")
    m = MAP.get(r[0])
    if m is None: continue
    if m == "KEEP": st["map keep"] += 1
    elif m == "DROP": drop(r, "map drop")
    elif m == "MAKE":
        mk = (MK.get(r[1]) or "").split(" ")[0].upper()
        new = r[0].replace("(LOGO)", "(%s)" % mk) if mk else ""
        if new in UN: r[0] = new; st["map make"] += 1
        else: drop(r, "map make unknown -> drop")
    else: r[0] = m; st["map rename"] += 1
train_labels = {r[0] for r in rows if r[3] == "train" and r[0]}
known = {(r[1], r[2]) for r in rows}
for l in open(os.path.join(HERE, "train_queue.tsv")):
    q = l.rstrip("\n").split("\t")
    if len(q) < 4 or (q[1], q[2]) in known: continue
    lab = norm(q[0]); lab = {"KEEP": lab, "DROP": ""}.get(MAP.get(lab, lab), MAP.get(lab, lab)) if MAP.get(lab) not in ("MAKE",) else ""
    ok = lab and lab in train_labels and os.path.exists(os.path.join(HERE, q[3]))
    rows.append([lab, q[1], q[2], "train" if ok else "skip"]); paths.append(q[3]); known.add((q[1], q[2])); st["queue " + ("train" if ok else "skip")] += 1
open(os.path.join(HERE, "big_meta_n5.tsv"), "w").write("\n".join("\t".join(r) for r in rows) + "\n")
open(os.path.join(HERE, "big_paths_n5.txt"), "w").write("\n".join(paths))
tr = collections.Counter(r[0] for r in rows if r[3] == "train")
print(dict(st)); print("rows", len(rows), "train rows", sum(tr.values()), "train labels", len(tr), "labels < 100:", sum(1 for v in tr.values() if v < 100))
print("train labels not in names.json:", sum(1 for k in tr if k not in UN))
