#!/usr/bin/env python3
"""Name every photo of a case with the fine-tuned DINOv2 model.
  .venv/bin/python predict_case.py <ckpt> <img1> <img2> ...   (images in shooting order)
Prints JSON lines: {file, top:[[name,prob]x3], conf, sure}  (sure = conf >= 0.60, after neighbour smoothing).
VEHICLE=<vehicle model> env: PERODUA never gets "Front Panel Assembly" (split pieces instead); other makes never get the split pieces."""
import json, os, re, sys, collections
import numpy as np, torch, torch.nn as nn
from PIL import Image
ck = torch.load(sys.argv[1], map_location="cpu"); labels = ck["labels"]
bb = torch.hub.load(os.path.expanduser("~/.cache/torch/hub/facebookresearch_dinov2_main"), "dinov2_vitb14", source="local", pretrained=False); model = nn.Sequential(bb, nn.Linear(768, len(labels)))
model.load_state_dict(ck["state"]); dev = "mps" if torch.backends.mps.is_available() else "cpu"; model.to(dev).eval()
mean = np.array([0.485, 0.456, 0.406], np.float32); std = np.array([0.229, 0.224, 0.225], np.float32)
def load(p):
    a = np.asarray(Image.open(p).convert("RGB").resize((224, 224), Image.BICUBIC), np.float32) / 255
    return ((a - mean) / std).transpose(2, 0, 1)
SPLIT = [k for k, n in enumerate(labels) if re.match(r"^(Front Panel Upper|Fender Inner (LH|RH)|Front Crossmember|Front Panel Lower)$", n)]
ASSY = [k for k, n in enumerate(labels) if n == "Front Panel Assembly"]
PERODUA = "PERODUA" in os.environ.get("VEHICLE", "").upper()
def fix_make(p):
    src, dst = (ASSY, SPLIT) if PERODUA else (SPLIT, ASSY)
    if not src or not dst: return p
    m = p[src].sum(); p[src] = 0
    w = p[dst] if p[dst].sum() > 0 else np.ones(len(dst), np.float32)
    p[dst] += m * w / w.sum(); return p
# LORRY (user): Front Chassis Member has no LH/RH
CHS = [k for k, n in enumerate(labels) if re.match(r"^Front Chassis Member (LH|RH)$", n)]
CH1 = [k for k, n in enumerate(labels) if n == "Front Chassis Member"]
LORRY = bool(re.search(r"LORRY|TRUCK", os.environ.get("VEHICLE", "").upper()))
_fm = fix_make
def fix_make(p):
    p = _fm(p)
    if LORRY and CHS and CH1: p[CH1[0]] += p[CHS].sum(); p[CHS] = 0
    return p
MULTI = [k for k, n in enumerate(labels) if "&" in n or re.search(r"\band\b", n, re.I)]   # user: never '&' (1 image = 1 item)
_fm2 = fix_make
def fix_make(p):
    p = _fm2(p); p[MULTI] = 0; return p / p.sum()
files = sys.argv[2:]; P = []
with torch.no_grad():
    for i in range(0, len(files), 32):
        x = torch.from_numpy(np.stack([load(f) for f in files[i:i + 32]])).to(dev)
        P += [fix_make(p) for p in torch.softmax(model(x), 1).cpu().numpy()]
for i, f in enumerate(files):
    s = P[i].copy()
    for j in (i - 1, i + 1):
        if 0 <= j < len(files): s += 0.5 * P[j]
    s /= s.sum(); o = np.argsort(-s)[:3]
    raw = float(P[i][o[0]]) if int(np.argmax(P[i])) == int(o[0]) else 0.0
    print(json.dumps({"file": f, "top": [[labels[k], round(float(s[k]), 3)] for k in o], "conf": round(max(float(s[o[0]]), raw), 3), "sure": bool(max(float(s[o[0]]), raw) >= 0.60)}, ensure_ascii=False))
