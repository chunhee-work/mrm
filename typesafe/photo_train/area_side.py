#!/usr/bin/env python3
"""Shooting position for each labeling task: area (FRONT/REAR/SIDE/UNDER) + side (LH/RH/centre),
from the whole photo and the 2 photos before it, with our best model.  -> {task: {area, side, a, s}}
  .venv/bin/python area_side.py <ckpt> tasks_dump_dir out.json"""
import glob, json, os, re, sys
import numpy as np, torch, torch.nn as nn
from PIL import Image
from zones import zones
HERE = os.path.dirname(os.path.abspath(__file__))
ck = torch.load(sys.argv[1], map_location="cpu"); labels = ck["labels"]
bb = torch.hub.load(os.path.expanduser("~/.cache/torch/hub/facebookresearch_dinov2_main"), "dinov2_vitb14", source="local", pretrained=False)
model = nn.Sequential(bb, nn.Linear(768, len(labels))); model.load_state_dict(ck["state"])
dev = "mps" if torch.backends.mps.is_available() else "cpu"; model.to(dev).eval()
mean = np.array([0.485, 0.456, 0.406], np.float32); std = np.array([0.229, 0.224, 0.225], np.float32)
def scene_z(n):
    if re.search(r"front view|frt .*view|engine comp", n, re.I): return {"FRONT"}
    if re.search(r"rear view|rr .*view", n, re.I): return {"REAR"}
    if re.search(r"side view", n, re.I): return {"SIDE"}
    z = zones(n); return set() if "ID" in z else z
SZ = [scene_z(n) for n in labels]
SIDE = [("LH" if re.search(r"\b(LH|left|ns)\b", n, re.I) else "RH" if re.search(r"\b(RH|right|os)\b", n, re.I) else None) for n in labels]
def photo(cid, seq):
    f = glob.glob(os.path.join(HERE, "data", cid, "%03d_*.jpg" % seq)); return f[0] if f else None
out = {}
for fn in sorted(glob.glob(os.path.join(sys.argv[2], "*.json"))):
    t = json.load(open(fn)); tid = os.path.basename(fn)[:-5]
    if "cid" not in t: continue
    fs = [photo(t["cid"], int(t["seq"]) - k) for k in (0, 1, 2)]; w = [1.0, 0.5, 0.5]
    xs, ws = [], []
    for f, wi in zip(fs, w):
        if f: xs.append(((np.asarray(Image.open(f).convert("RGB").resize((224, 224), Image.BICUBIC), np.float32) / 255 - mean) / std).transpose(2, 0, 1)); ws.append(wi)
    if not xs: continue
    with torch.no_grad(): P = torch.softmax(model(torch.from_numpy(np.stack(xs)).to(dev)), 1).cpu().numpy()
    p = (P * np.array(ws)[:, None]).sum(0) / sum(ws)
    a = dict.fromkeys(["FRONT", "REAR", "SIDE", "UNDER"], 0.0); s = {"LH": 0.0, "RH": 0.0}
    for k, z in enumerate(SZ):
        for zz in z: a[zz] += p[k] / len(z)
        if SIDE[k]: s[SIDE[k]] += p[k]
    area = max(a, key=a.get); tot = s["LH"] + s["RH"]
    side = "LH" if tot > 0.15 and s["LH"] / tot >= 0.65 else "RH" if tot > 0.15 and s["RH"] / tot >= 0.65 else "C"
    out[tid] = {"area": area, "side": side, "a": round(a[area] / max(1e-9, sum(a.values())), 2), "s": round(max(s.values()) / tot, 2) if tot else 0}
json.dump(out, open(sys.argv[3], "w")); print(len(out)); import collections; print(collections.Counter((v["area"], v["side"]) for v in out.values()).most_common(12))
