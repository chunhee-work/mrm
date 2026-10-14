#!/usr/bin/env python3
"""Fine-tune DINOv2 ViT-B/14 (last N blocks + head) on Merimen photo names, with spatial sense (batch 10):
 - aux heads: area (FRONT/REAR/SIDE/UNDER/ID, multi-label), side (none/LH/RH), position (none/Front/Rear) -> learns where/which angle
 - horizontal flip + LH<->RH / Left<->Right label swap (never for text photos: chassis no, road tax, plates, tyre text ...)"""
import json, os, random, sys, time
import re
import numpy as np, torch, torch.nn as nn
from zones import zones
from PIL import Image
HERE = os.path.dirname(os.path.abspath(__file__))
EPOCHS = int(sys.argv[1]) if len(sys.argv) > 1 else 6
UNFREEZE = int(sys.argv[2]) if len(sys.argv) > 2 else 4
TAG = sys.argv[3] if len(sys.argv) > 3 else "ft"
dev = "mps"
paths = open(os.path.join(HERE, os.environ.get("PATHS_FILE", "feats.bin.paths"))).read().split("\n")
meta = [l.split("\t") for l in open(os.path.join(HERE, os.environ.get("META_FILE", "meta.tsv"))).read().split("\n") if l]
ALL = os.environ.get("ALL_CASES") == "1"
tr = [i for i, m in enumerate(meta) if m[3] == "train" or (ALL and m[3] == "test" and m[0])]
te = [i for i, m in enumerate(meta) if m[3] == "test" and m[0]]
labels = sorted({meta[i][0] for i in tr}); L = {k: j for j, k in enumerate(labels)}
AREAS = ["FRONT", "REAR", "SIDE", "UNDER", "ID"]
TEXT = re.compile(r"chassis (no|number)|engine (no|number)|road ?tax|plate|tyre (size|brand)|odometer|emblem|badge|logo|sticker|document|\bview\b.*\b(no|number)\b|vin\b", re.I)
def swap(n): return re.sub(r"\b(LH|RH|Left|Right)\b", lambda m: {"LH": "RH", "RH": "LH", "Left": "Right", "Right": "Left"}[m.group(1)], n)
def sidecls(n): return 1 if re.search(r"\b(LH|Left)\b", n) else 2 if re.search(r"\b(RH|Right)\b", n) else 0
def poscls(n): return 1 if re.search(r"\b(Front|Frt)\b", n, re.I) else 2 if re.search(r"\b(Rear|Rr)\b", n, re.I) else 0
AUX = {}
for k in labels:
    z = zones(k); AUX[k] = ([1.0 if a in z else 0.0 for a in AREAS], 1.0 if z else 0.0, sidecls(k), poscls(k))
FLIP = {k: (swap(k) if swap(k) in L else (k if swap(k) == k else None)) for k in labels}
for k in labels:
    if TEXT.search(k): FLIP[k] = None
print("labels", len(labels), "flippable", sum(v is not None for v in FLIP.values()), flush=True)
mean = np.array([0.485, 0.456, 0.406], np.float32); std = np.array([0.229, 0.224, 0.225], np.float32)

def load(i, aug, flip=False):
    im = Image.open(os.path.join(HERE, paths[i])).convert("RGB")
    if flip: im = im.transpose(Image.FLIP_LEFT_RIGHT)
    if aug:
        w, h = im.size; s = random.uniform(0.75, 1.0)
        cw, ch = int(w * s), int(h * s); x, y = random.randint(0, w - cw), random.randint(0, h - ch)
        im = im.crop((x, y, x + cw, y + ch))
    a = np.asarray(im.resize((224, 224), Image.BICUBIC), np.float32) / 255
    if aug:
        a = np.clip(a * random.uniform(0.8, 1.2) + random.uniform(-0.08, 0.08), 0, 1)
    return ((a - mean) / std).transpose(2, 0, 1)

_HUB = os.path.expanduser("~/.cache/torch/hub/facebookresearch_dinov2_main")
bb = torch.hub.load(_HUB, "dinov2_vitb14", source="local") if os.path.isdir(_HUB) else torch.hub.load("facebookresearch/dinov2", "dinov2_vitb14")
for p in bb.parameters(): p.requires_grad = False
for blk in bb.blocks[-UNFREEZE:]:
    for p in blk.parameters(): p.requires_grad = True
for p in bb.norm.parameters(): p.requires_grad = True
head = nn.Linear(768, len(labels))
model = nn.Sequential(bb, head)
aux = nn.ModuleDict({"area": nn.Linear(768, 5), "side": nn.Linear(768, 3), "pos": nn.Linear(768, 3)})
INIT = os.environ.get("INIT")
if INIT:
    ck = torch.load(os.path.join(HERE, INIT), map_location="cpu")
    st = ck["state"]; old = {k: j for j, k in enumerate(ck["labels"])}
    bb.load_state_dict({k[2:]: v for k, v in st.items() if k.startswith("0.")})
    with torch.no_grad():
        for k, j in L.items():
            if k in old:
                head.weight[j] = st["1.weight"][old[k]]; head.bias[j] = st["1.bias"][old[k]]
    if "aux" in ck: aux.load_state_dict(ck["aux"])
    print("init from", INIT, "shared labels", sum(k in old for k in L), "/", len(L), flush=True)
model = model.to(dev); aux = aux.to(dev)
opt = torch.optim.AdamW([{"params": [p for p in bb.parameters() if p.requires_grad], "lr": 2e-5},
                         {"params": list(head.parameters()) + list(aux.parameters()), "lr": 1e-3}], weight_decay=0.05)
steps = EPOCHS * (len(tr) // 32); sched = torch.optim.lr_scheduler.OneCycleLR(opt, max_lr=[2e-5, 1e-3], total_steps=steps)
lossf = nn.CrossEntropyLoss(label_smoothing=0.1); bce = nn.BCEWithLogitsLoss(reduction="none"); ce = nn.CrossEntropyLoss()
AUXW = float(os.environ.get("AUXW", "0.3"))

def evaluate(write=False):
    model.eval(); aux.eval(); ok = t3 = 0; out = []
    with torch.no_grad():
        for k in range(0, len(te), 64):
            ids = te[k:k + 64]
            pr = torch.softmax(model(torch.from_numpy(np.stack([load(i, False) for i in ids])).to(dev)), 1).cpu().numpy()
            for i, p in zip(ids, pr):
                o = np.argsort(-p)[:5]; lab = meta[i][0]
                ok += labels[o[0]] == lab; t3 += lab in [labels[j] for j in o[:3]]
                out.append({"i": i, "label": lab, "cid": meta[i][1], "seq": meta[i][2], "top": [[labels[j], "%.3f" % p[j]] for j in o]})
    if write:
        with open(os.path.join(HERE, "pred_%s.jsonl" % TAG), "w") as f:
            for o in out: f.write(json.dumps(o) + "\n")
    model.train(); aux.train(); return ok / len(te), t3 / len(te)

t0 = time.time(); best, best_ep = 0, 0
for ep in range(EPOCHS):
    random.shuffle(tr)
    if os.environ.get("SMOKE"): tr = tr[:int(os.environ["SMOKE"])]; te[:] = te[:128]
    for k in range(0, len(tr) - 31, 32):
        ids = tr[k:k + 32]
        labs = [meta[i][0] for i in ids]
        fl = [FLIP[l] is not None and random.random() < 0.5 for l in labs]
        labs = [FLIP[l] if f else l for l, f in zip(labs, fl)]
        x = torch.from_numpy(np.stack([load(i, True, f) for i, f in zip(ids, fl)])).to(dev)
        y = torch.tensor([L[l] for l in labs]).to(dev)
        feat = bb(x)
        ya = torch.tensor([AUX[l][0] for l in labs]).to(dev); ma = torch.tensor([AUX[l][1] for l in labs]).to(dev)
        ys = torch.tensor([AUX[l][2] for l in labs]).to(dev); yp = torch.tensor([AUX[l][3] for l in labs]).to(dev)
        la = (bce(aux["area"](feat), ya).mean(1) * ma).sum() / ma.sum().clamp(min=1)
        loss = lossf(head(feat), y) + AUXW * (la + ce(aux["side"](feat), ys) + ce(aux["pos"](feat), yp)); opt.zero_grad(); loss.backward(); opt.step(); sched.step()
        if k % 3200 == 0: print("ep", ep, k, "loss %.3f" % loss.item(), int(time.time() - t0), "s", flush=True)
    if ALL:
        torch.save({"state": model.state_dict(), "labels": labels, "aux": aux.state_dict()}, os.path.join(HERE, "models", "dinov2_b_%s.pt" % TAG))
        print("EPOCH", ep, "saved (all cases, no test set)", int(time.time() - t0), "s", flush=True); continue
    a1, a3 = evaluate()
    print("EPOCH", ep, "test top1 %.1f%% top3 %.1f%%" % (100 * a1, 100 * a3), int(time.time() - t0), "s", flush=True)
    if a1 > best:
        best, best_ep = a1, ep + 1; torch.save({"state": model.state_dict(), "labels": labels, "aux": aux.state_dict()}, os.path.join(HERE, "models", "dinov2_b_%s.pt" % TAG)); evaluate(write=True)
print("best top1 %.1f%% at epoch %d" % (100 * best, best_ep) if not ALL else "best final saved")
