#!/usr/bin/env python3
"""Pick rare-item (冷门) photos for the 部位标注台: labels with few training photos where the current group model
is wrong or unsure.  python3 rare_pick.py <out.json> [N=60] [RARE=100] [PER=2 photos per label]   (uses big_meta_n.tsv + feats_big10n*.npy)"""
import collections, json, os, sys, glob
import numpy as np, torch, torch.nn as nn
HERE = os.path.dirname(os.path.abspath(__file__)); OUT = sys.argv[1]
N = int(sys.argv[2]) if len(sys.argv) > 2 else 60; RARE = int(sys.argv[3]) if len(sys.argv) > 3 else 100; PER = int(sys.argv[4]) if len(sys.argv) > 4 else 2
paths = open(os.path.join(HERE, "big_paths_n.txt")).read().split("\n")
meta = [l.split("\t") for l in open(os.path.join(HERE, "big_meta_n.tsv")).read().split("\n") if l]
F = np.load(os.path.join(HERE, "feats_big10n.npy"), mmap_mode="r"); FC = np.load(os.path.join(HERE, "feats_big10n_c.npy"), mmap_mode="r")
ck = torch.load(os.path.join(HERE, "models", "seq_best_crop.pt"), map_location="cpu"); labels = ck["labels"]; WIN = ck["win"]; D = ck["dim"]
class Ctx(nn.Module):
    def __init__(s):
        super().__init__()
        s.base = nn.Linear(768, len(labels)); s.inp = nn.Linear(D, 384); s.pos = nn.Parameter(torch.zeros(2 * WIN + 1, 384))
        s.enc = nn.TransformerEncoder(nn.TransformerEncoderLayer(384, 6, 1024, 0.1, batch_first=True, norm_first=True), 2)
        s.out = nn.Linear(384, len(labels))
    def forward(s, x, m):
        h = s.enc(s.inp(x) + s.pos, src_key_padding_mask=m); return s.base(x[:, WIN, :768]) + s.out(h[:, WIN])
net = Ctx(); net.load_state_dict(ck["ctx"]); net.eval()
case = collections.defaultdict(list)
for i, m in enumerate(meta): case[m[1]].append(i)
for c in case: case[c].sort(key=lambda i: int(meta[i][2]))
where = {i: (c, p) for c, ids in case.items() for p, i in enumerate(ids)}
cnt = collections.Counter(m[0] for m in meta if m[3] == "train")
rare = {k for k, c in cnt.items() if c < RARE}
done = set()   # photos already in the labeller
for f in glob.glob(os.path.join(HERE, "..", "..", "..", "..", "..", "..", "..", "private", "tmp", "nonexistent")): pass
if os.path.exists(os.path.join(HERE, "user_corrections.json")):
    done |= set(json.load(open(os.path.join(HERE, "user_corrections.json"))).keys())
import re; from name_map import final as norm
VIEW = re.compile(r"View|Odometer|Chassis Number|Engine Compartment|Road Tax|Tyre|DASHBOARD|Photo|Accident|Damage", re.I)
ok = lambda k: norm(k) == k and not VIEW.search(k)   # skip banned / un-merged spellings and view shots
cand = [i for i, m in enumerate(meta) if m[0] in rare and ok(m[0]) and "%s:%s" % (m[1], m[2]) not in done]
print("rare labels", len(rare), "candidate photos", len(cand), flush=True)
def win(i):
    c, p = where[i]; ids = case[c]; idx, msk = [], []
    for d in range(-WIN, WIN + 1):
        q = p + d; ok = 0 <= q < len(ids); idx.append(ids[q] if ok else i); msk.append(not ok)
    return idx, msk
res = []
with torch.no_grad():
    for k in range(0, len(cand), 256):
        ids = cand[k:k + 256]; ws = [win(i) for i in ids]
        x = np.concatenate([np.stack([F[w[0]] for w in ws]), np.stack([FC[w[0]] for w in ws])], 2).astype(np.float32)
        pr = torch.softmax(net(torch.from_numpy(x), torch.tensor([w[1] for w in ws])), 1).numpy()
        for i, p, w in zip(ids, pr, ws):
            o = np.argsort(-p)[:3]; top = [[labels[j], round(float(p[j]), 3)] for j in o]
            if top[0][0] != meta[i][0] or top[0][1] < 0.6:
                res.append({"i": i, "label": meta[i][0], "cid": meta[i][1], "seq": int(meta[i][2]), "path": paths[i], "top": top,
                            "nb": [paths[w[0][WIN - 1]], paths[w[0][WIN - 2]]], "nbname": [meta[w[0][WIN - 1]][0], meta[w[0][WIN - 2]][0]], "n": cnt[meta[i][0]]})
# rarest labels first, at most 2 photos per label, wrong before unsure
res.sort(key=lambda r: (r["n"], r["top"][0][0] == r["label"], -r["top"][0][1]))
per, pick = collections.Counter(), []
for r in res:
    if per[r["label"]] < PER: pick.append(r); per[r["label"]] += 1
    if len(pick) >= N: break
json.dump(pick, open(OUT, "w"), ensure_ascii=False, indent=0)
print("wrong/unsure rare photos", len(res), "picked", len(pick), "labels", len(per))
