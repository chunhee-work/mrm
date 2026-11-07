#!/usr/bin/env python3
"""2026-11-07 quick fair test (user: "try DINOv3 vitb16 first"): FROZEN backbones, same photos, same linear head.
DINOv2 ViT-B/14 (pretrained, what our model started from) vs DINOv3 ViT-B/16 (pretrained). Train photos: up to 60 per label
(labels n4), test: the usual 3,306 test photos. Prints top-1/top-3 of a linear classifier on each. Usage: probe_v3.py [PER=60]"""
import collections, json, os, random, sys, time
import numpy as np, torch, torch.nn as nn
from PIL import Image
HERE = os.path.dirname(os.path.abspath(__file__)); random.seed(0); torch.manual_seed(0)
PER = int(sys.argv[1]) if len(sys.argv) > 1 else 60
dev = "mps" if torch.backends.mps.is_available() else "cpu"
meta = [l.rstrip("\n").split("\t") for l in open(os.path.join(HERE, "big_meta_n4.tsv")) if l.strip()]
paths = open(os.path.join(HERE, "big_paths_n4.txt")).read().split("\n")
by = collections.defaultdict(list)
for i, m in enumerate(meta):
    if m[3] == "train" and m[0]: by[m[0]].append(i)
tr = [i for k, v in by.items() for i in random.sample(v, min(PER, len(v)))]
te = [i for i, m in enumerate(meta) if m[3] == "test" and m[0] in by]
labels = sorted(by); L = {k: j for j, k in enumerate(labels)}
print("train", len(tr), "test", len(te), "labels", len(labels), flush=True)
mean = np.array([0.485, 0.456, 0.406], np.float32); std = np.array([0.229, 0.224, 0.225], np.float32)
def load(i, size):
    im = Image.open(os.path.join(HERE, paths[i])).convert("RGB").resize((size, size), Image.BICUBIC)
    return ((np.asarray(im, np.float32) / 255 - mean) / std).transpose(2, 0, 1)
def feats(fn, size, ids):
    out = []
    with torch.no_grad():
        for k in range(0, len(ids), 64):
            x = torch.from_numpy(np.stack([load(i, size) for i in ids[k:k + 64]])).to(dev)
            out.append(fn(x).float().cpu())
    return torch.cat(out)
def probe(name, fn, size):
    t = time.time(); Xtr = feats(fn, size, tr); Xte = feats(fn, size, te)
    ytr = torch.tensor([L[meta[i][0]] for i in tr]); yte = torch.tensor([L[meta[i][0]] for i in te])
    mu, sd = Xtr.mean(0), Xtr.std(0) + 1e-6; Xtr = (Xtr - mu) / sd; Xte = (Xte - mu) / sd
    head = nn.Linear(Xtr.shape[1], len(labels)); opt = torch.optim.AdamW(head.parameters(), 1e-3, weight_decay=1e-4)
    for ep in range(60):
        perm = torch.randperm(len(Xtr))
        for k in range(0, len(perm), 512):
            b = perm[k:k + 512]; loss = nn.functional.cross_entropy(head(Xtr[b]), ytr[b]); opt.zero_grad(); loss.backward(); opt.step()
    with torch.no_grad():
        p = head(Xte); t3 = p.topk(3, 1).indices
    a1 = (t3[:, 0] == yte).float().mean().item(); a3 = (t3 == yte[:, None]).any(1).float().mean().item()
    print(f"{name}: top1 {100*a1:.1f}%  top3 {100*a3:.1f}%  ({int(time.time()-t)} s)", flush=True)
v2 = torch.hub.load(os.path.expanduser("~/.cache/torch/hub/facebookresearch_dinov2_main"), "dinov2_vitb14", source="local").to(dev).eval()
probe("DINOv2 ViT-B/14 (frozen)", lambda x: v2(x), 224); del v2
from transformers import AutoModel
v3 = AutoModel.from_pretrained(os.path.join(HERE, "models/dinov3_vitb16")).to(dev).eval()
probe("DINOv3 ViT-B/16 (frozen)", lambda x: v3(pixel_values=x).pooler_output, 224)
