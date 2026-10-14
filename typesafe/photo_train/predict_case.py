#!/usr/bin/env python3
"""Name every photo of a case with the fine-tuned DINOv2 model.
  .venv/bin/python predict_case.py <ckpt> <img1> <img2> ...   (images in shooting order)
Prints JSON lines: {file, top:[[name,prob]x3], conf, sure}  (sure = conf >= 0.60, after neighbour smoothing).
SEQ=<models/seq_*.pt> env (batch 10): look at +-4 photos of the case together (whole photo group -> where on the car); then no extra smoothing.
VEHICLE=<vehicle model> env: PERODUA never gets "Front Panel Assembly" (split pieces instead); other makes never get the split pieces."""
import json, os, re, sys, collections
import numpy as np, torch, torch.nn as nn
from PIL import Image
ck = torch.load(sys.argv[1], map_location="cpu"); labels = ck["labels"]
bb = torch.hub.load(os.path.expanduser("~/.cache/torch/hub/facebookresearch_dinov2_main"), "dinov2_vitb14", source="local", pretrained=False); model = nn.Sequential(bb, nn.Linear(768, len(labels)))
model.load_state_dict(ck["state"]); dev = "mps" if torch.backends.mps.is_available() else "cpu"; model.to(dev).eval()
SEQ = os.environ.get("SEQ", os.path.join(os.path.dirname(os.path.abspath(__file__)), "models", "seq_big10.pt"))
SEQ = SEQ if SEQ and SEQ != "0" and os.path.exists(SEQ) else None   # SEQ=0 -> single-photo model only
if SEQ:
    sk = torch.load(SEQ, map_location="cpu"); labels = sk["labels"]; WIN = sk["win"]
    class Ctx(nn.Module):
        def __init__(s):
            super().__init__()
            s.base = nn.Linear(768, len(labels)); s.inp = nn.Linear(768, 384); s.pos = nn.Parameter(torch.zeros(2 * WIN + 1, 384))
            s.enc = nn.TransformerEncoder(nn.TransformerEncoderLayer(384, 6, 1024, 0.1, batch_first=True, norm_first=True), 2)
            s.out = nn.Linear(384, len(labels))
        def forward(s, x, m):
            return s.base(x[:, WIN]) + s.out(s.enc(s.inp(x) + s.pos, src_key_padding_mask=m)[:, WIN])
    ctx = Ctx(); ctx.load_state_dict(sk["ctx"]); ctx.to(dev).eval()
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
    if SEQ:
        F = torch.cat([bb(torch.from_numpy(np.stack([load(f) for f in files[i:i + 32]])).to(dev)) for i in range(0, len(files), 32)])
        n = len(files); idx = [[min(max(i + d, 0), n - 1) for d in range(-WIN, WIN + 1)] for i in range(n)]
        msk = torch.tensor([[not (0 <= i + d < n) for d in range(-WIN, WIN + 1)] for i in range(n)]).to(dev)
        P = [fix_make(p) for p in torch.softmax(ctx(F[torch.tensor(idx).to(dev)], msk), 1).cpu().numpy()]
    else:
        for i in range(0, len(files), 32):
            x = torch.from_numpy(np.stack([load(f) for f in files[i:i + 32]])).to(dev)
            P += [fix_make(p) for p in torch.softmax(model(x), 1).cpu().numpy()]
# user 2026-10-12: decide the shooting area (FRONT/REAR/SIDE/UNDER) per photo from ITS OWN group of photos
# (itself + 2 before + 2 after) — not the whole case, because one case can be damaged on several sides.
# If the area is clear (>= 50%), part names from other areas are removed; views/documents always stay.
from zones import zones as _zones
def _scene(n):
    if re.search(r"front view|frt .*view|engine comp", n, re.I): return {"FRONT"}
    if re.search(r"rear view|rr .*view", n, re.I): return {"REAR"}
    if re.search(r"side view", n, re.I): return {"SIDE"}
    z = _zones(n); return set() if "ID" in z else z
_SZ = [_scene(n) for n in labels]; _LZ = [_zones(n) for n in labels]
def _area(i):
    sc = dict.fromkeys(["FRONT", "REAR", "SIDE", "UNDER"], 0.0)
    for j, w in ((i - 2, .5), (i - 1, .75), (i, 1.0), (i + 1, .75), (i + 2, .5)):
        if 0 <= j < len(P):
            for k, z in enumerate(_SZ):
                for a in z: sc[a] += w * P[j][k] / len(z)
    a = max(sc, key=sc.get); return a, sc[a] / max(1e-9, sum(sc.values()))
_AREAS = [_area(i) for i in range(len(P))]
for i, (a, c) in enumerate(_AREAS):
    if c >= 0.50:
        keep = np.array([("ID" in z) or (not z) or (a in z) for z in _LZ], np.float32)
        q = P[i] * keep; P[i] = q / q.sum() if q.sum() > 0 else P[i]
for i, f in enumerate(files):
    s = P[i].copy()
    for j in ((i - 1, i + 1) if not SEQ else ()):
        if 0 <= j < len(files): s += 0.5 * P[j]
    s /= s.sum(); o = np.argsort(-s)[:3]
    raw = float(P[i][o[0]]) if int(np.argmax(P[i])) == int(o[0]) else 0.0
    print(json.dumps({"file": f, "top": [[labels[k], round(float(s[k]), 3)] for k in o], "conf": round(max(float(s[o[0]]), raw), 3), "sure": bool(max(float(s[o[0]]), raw) >= 0.60), "area": _AREAS[i][0], "area_conf": round(float(_AREAS[i][1]), 2)}, ensure_ascii=False))
