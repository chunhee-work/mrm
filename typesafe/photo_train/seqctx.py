#!/usr/bin/env python3
"""Batch 10 stage 2: look at the whole photo group, not one photo alone.
A photo set is shot in order (wide view first, then close-ups), so the photos before/after tell WHERE on the car a close-up is.
  extract: run the stage-1 model (finetune2.py) once over every photo -> feats_<ft>.npy (fp16, 768-d)
  train:   small transformer over a window of +-WIN photos of the same case -> name of the centre photo
           logits = stage-1 head(centre) + context correction (starts at zero = starts at stage-1 accuracy)
Usage: python seqctx.py extract models/dinov2_b_big10a.pt big10a
       python seqctx.py train   models/dinov2_b_big10a.pt big10a big10      (labels from big_meta.tsv = latest rules)"""
import collections, json, os, random, sys, time
import numpy as np, torch, torch.nn as nn
from PIL import Image
HERE = os.path.dirname(os.path.abspath(__file__))
dev = "mps" if torch.backends.mps.is_available() else "cpu"
WIN = int(os.environ.get("WIN", "4"))
mode, CK, FT = sys.argv[1], sys.argv[2], sys.argv[3]
paths = open(os.path.join(HERE, os.environ.get("PATHS_FILE", "big_paths.txt"))).read().split("\n")
meta = [l.split("\t") for l in open(os.path.join(HERE, os.environ.get("META_FILE", "big_meta.tsv"))).read().split("\n") if l]
CROP = float(os.environ.get("CROP", "0"))          # extract: >0 = only the centre (crosshair) part, e.g. 0.5 = middle half, zoomed in
FEATS = os.path.join(HERE, "feats_%s%s.npy" % (FT, "_c" if CROP and mode == "extract" else ""))
FEATC = os.path.join(HERE, "feats_%s_c.npy" % FT)   # train: used when it exists (whole photo + crosshair zoom)
ck = torch.load(os.path.join(HERE, CK), map_location="cpu")
mean = np.array([0.485, 0.456, 0.406], np.float32); std = np.array([0.229, 0.224, 0.225], np.float32)

def img(i):
    try:
        im = Image.open(os.path.join(HERE, paths[i])).convert("RGB")
        if CROP:
            w, h = im.size; cw, ch = w * CROP, h * CROP; im = im.crop((int((w - cw) / 2), int((h - ch) / 2), int((w + cw) / 2), int((h + ch) / 2)))
        a = np.asarray(im.resize((224, 224), Image.BICUBIC), np.float32) / 255
    except Exception: a = np.zeros((224, 224, 3), np.float32) + mean
    return ((a - mean) / std).transpose(2, 0, 1)

if mode == "extract":
    _HUB = os.path.expanduser("~/.cache/torch/hub/facebookresearch_dinov2_main")
    bb = torch.hub.load(_HUB, "dinov2_vitb14", source="local")
    bb.load_state_dict({k[2:]: v for k, v in ck["state"].items() if k.startswith("0.")}); bb = bb.to(dev).eval()
    N = len(meta); F = np.lib.format.open_memmap(FEATS + ".part", "w+", np.float16, (N, 768)); t0 = time.time()
    from concurrent.futures import ThreadPoolExecutor
    ex = ThreadPoolExecutor(6)
    with torch.no_grad():
        for k in range(0, N, 128):
            x = torch.from_numpy(np.stack(list(ex.map(img, range(k, min(N, k + 128)))))).to(dev)
            F[k:k + len(x)] = bb(x).float().cpu().numpy().astype(np.float16)
            if k % 25600 == 0: print("extract", k, "/", N, int(time.time() - t0), "s", flush=True)
    F.flush(); del F; os.replace(FEATS + ".part", FEATS); print("extract done", int(time.time() - t0), "s", flush=True); sys.exit()

# ---- train ----
TAG = sys.argv[4]
F = np.load(FEATS, mmap_mode="r")
FC = np.load(FEATC, mmap_mode="r") if os.path.exists(FEATC) and os.environ.get("USE_CROP", "1") == "1" else None
D = 768 * (2 if FC is not None else 1); print("crosshair zoom features:", FC is not None, flush=True)
case = collections.defaultdict(list)
for i, m in enumerate(meta): case[m[1]].append(i)
for c in case: case[c].sort(key=lambda i: int(meta[i][2]))
where = {}
for c, ids in case.items():
    for p, i in enumerate(ids): where[i] = (c, p)
tr = [i for i, m in enumerate(meta) if m[3] == "train"]
te = [i for i, m in enumerate(meta) if m[3] == "test" and m[0]]
labels = sorted({meta[i][0] for i in tr}); L = {k: j for j, k in enumerate(labels)}
old = {k: j for j, k in enumerate(ck["labels"])}

def window(i, drop=0.0):
    c, p = where[i]; ids = case[c]; idx = []; msk = []
    for d in range(-WIN, WIN + 1):
        q = p + d; ok = 0 <= q < len(ids) and (d == 0 or random.random() >= drop)
        idx.append(ids[q] if ok else i); msk.append(not ok)
    return idx, msk

class Ctx(nn.Module):
    def __init__(s):
        super().__init__()
        s.base = nn.Linear(768, len(labels)); s.inp = nn.Linear(D, 384); s.pos = nn.Parameter(torch.zeros(2 * WIN + 1, 384))
        s.enc = nn.TransformerEncoder(nn.TransformerEncoderLayer(384, 6, 1024, 0.1, batch_first=True, norm_first=True), 2)
        s.out = nn.Linear(384, len(labels)); nn.init.zeros_(s.out.weight); nn.init.zeros_(s.out.bias)
    def forward(s, x, m):
        h = s.enc(s.inp(x) + s.pos, src_key_padding_mask=m)
        return s.base(x[:, WIN, :768]) + s.out(h[:, WIN])
net = Ctx()
with torch.no_grad():   # stage-1 head as the starting point
    for k, j in L.items():
        if k in old: net.base.weight[j] = ck["state"]["1.weight"][old[k]]; net.base.bias[j] = ck["state"]["1.bias"][old[k]]
net = net.to(dev)
EP = int(os.environ.get("EPOCHS", "6")); B = 256
opt = torch.optim.AdamW([{"params": net.base.parameters(), "lr": 1e-4}, {"params": [p for n, p in net.named_parameters() if not n.startswith("base.")], "lr": 5e-4}], weight_decay=0.05)
sched = torch.optim.lr_scheduler.OneCycleLR(opt, max_lr=[1e-4, 5e-4], total_steps=EP * (len(tr) // B))
lossf = nn.CrossEntropyLoss(label_smoothing=0.1)

def batch(ids, drop):
    ws = [window(i, drop) for i in ids]
    x = np.stack([F[w[0]] for w in ws]).astype(np.float32)
    if FC is not None: x = np.concatenate([x, np.stack([FC[w[0]] for w in ws]).astype(np.float32)], 2)
    x = torch.from_numpy(x).to(dev)
    return x, torch.tensor([w[1] for w in ws]).to(dev)

def evaluate(write=False):
    net.eval(); ok = t3 = 0; out = []
    with torch.no_grad():
        for k in range(0, len(te), B):
            ids = te[k:k + B]; pr = torch.softmax(net(*batch(ids, 0)), 1).cpu().numpy()
            for i, p in zip(ids, pr):
                o = np.argsort(-p)[:5]; lab = meta[i][0]
                ok += labels[o[0]] == lab; t3 += lab in [labels[j] for j in o[:3]]
                out.append({"i": i, "label": lab, "cid": meta[i][1], "seq": meta[i][2], "top": [[labels[j], "%.3f" % p[j]] for j in o]})
    if write:
        with open(os.path.join(HERE, "pred_%s.jsonl" % TAG), "w") as f:
            for o in out: f.write(json.dumps(o) + "\n")
    net.train(); return ok / len(te), t3 / len(te)

a1, a3 = evaluate(); print("start (stage-1 head only) top1 %.1f%% top3 %.1f%%" % (100 * a1, 100 * a3), flush=True)
best = 0; t0 = time.time()
for ep in range(EP):
    random.shuffle(tr)
    for k in range(0, len(tr) - B + 1, B):
        ids = tr[k:k + B]; y = torch.tensor([L[meta[i][0]] for i in ids]).to(dev)
        loss = lossf(net(*batch(ids, 0.15)), y); opt.zero_grad(); loss.backward(); opt.step(); sched.step()
        if k % (B * 200) == 0: print("ep", ep, k, "loss %.3f" % loss.item(), int(time.time() - t0), "s", flush=True)
    a1, a3 = evaluate(); print("EPOCH", ep, "test top1 %.1f%% top3 %.1f%%" % (100 * a1, 100 * a3), int(time.time() - t0), "s", flush=True)
    if a1 > best:
        best = a1; torch.save({"ctx": net.state_dict(), "labels": labels, "win": WIN, "backbone": CK, "crop": 0.5 if FC is not None else 0, "dim": D}, os.path.join(HERE, "models", "seq_%s.pt" % TAG)); evaluate(write=True)
print("best top1 %.1f%%" % (100 * best))
