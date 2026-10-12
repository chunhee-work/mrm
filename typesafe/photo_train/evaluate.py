#!/usr/bin/env python3
"""Build meta.tsv for knn, run it, and score top-1 / top-3 on unseen test cases.
User-confirmed truth overrides Merimen captions where Merimen was wrong."""
import collections, json, os, subprocess, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from build_dataset import label, MIN_PER_LABEL
import csv
_M = {r["raw"]: r for r in csv.DictReader(open(os.path.join(HERE, "name_map.tsv")), delimiter="\t")}
def clean(raw):
    r = _M.get(raw)
    if r and r["method"].startswith("generic"):
        return None
    return (r["official"] if r and r["official"] else label(raw))

OVERRIDE = {("21915115", 37): "Front Panel", ("21915115", 38): "Front Bumper Reinforcement",
            ("21915115", 39): "Front Bumper Reinforcement", ("21915115", 40): "Front Bumper Reinforcement"}

idx = {"data/" + json.loads(l)["file"]: json.loads(l) for l in open(os.path.join(HERE, "index.jsonl"))}
paths = open(os.path.join(HERE, "feats.bin.paths")).read().split("\n")
test = set(json.load(open(os.path.join(HERE, "test_cases.json"))))
rows = [r for r in (idx[p] for p in paths)]
cnt = collections.Counter(clean(r["name"]) for r in rows if r["cid"] not in test)
with open(os.path.join(HERE, "meta.tsv"), "w") as f:
    for r in rows:
        lab = OVERRIDE.get((r["cid"], r["seq"]), clean(r["name"]))
        if lab is None:
            lab, role = "", "skip"
        else:
            role = "test" if r["cid"] in test else ("train" if cnt[lab] >= MIN_PER_LABEL else "skip")
        f.write("%s\t%s\t%d\t%s\n" % (lab, r["cid"], r["seq"], role))
MODE = sys.argv[1] if len(sys.argv) > 1 else "softmax"
FE = sys.argv[2] if len(sys.argv) > 2 else "feats.bin"
subprocess.run([os.path.join(HERE, MODE), FE, "meta.tsv", "pred.jsonl"], cwd=HERE, check=True)
P = [json.loads(l) for l in open(os.path.join(HERE, "pred.jsonl"))]
P = [p for p in P if p["label"] and p["cid"] in test]
trainlab = set(l.split("\t")[0] for l in open(os.path.join(HERE, "meta.tsv")) if l.rstrip().endswith("train"))
print("test photos with a name never seen in training: %.1f%%" % (100 * sum(p["label"] not in trainlab for p in P) / len(P)))
def score(ps, name):
    t1 = sum(p["top"][0][0] == p["label"] for p in ps)
    t3 = sum(p["label"] in [x[0] for x in p["top"][:3]] for p in ps)
    conf = [p for p in ps if float(p["top"][0][1]) >= 0.6]
    c1 = sum(p["top"][0][0] == p["label"] for p in conf)
    print("%-22s n=%5d  top1 %.1f%%  top3 %.1f%%  | conf>=0.6: %d photos (%.0f%%), %.1f%% correct"
          % (name, len(ps), 100 * t1 / len(ps), 100 * t3 / len(ps), len(conf), 100 * len(conf) / len(ps), 100 * c1 / max(1, len(conf))))
score(P, "ALL unseen cases")
score([p for p in P if p["cid"] == "21915115"], "CDD5894")
