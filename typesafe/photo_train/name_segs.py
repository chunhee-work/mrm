#!/usr/bin/env python3
"""Pre-name SAM shapes with OUR trained model: crop each shape (box + 15% margin), classify with the DINOv2 checkpoint,
apply the same vehicle / no-'&' rules as predict_case.py.  -> segs file entries become {"pts": [...], "name": n, "p": prob, "top": [[n,p]x3]}
  .venv/bin/python name_segs.py <ckpt> segs.json tasks.json full_dir"""
import json, os, re, sys
import numpy as np, torch, torch.nn as nn
from zones import zones
from PIL import Image
ck = torch.load(sys.argv[1], map_location="cpu"); labels = ck["labels"]
bb = torch.hub.load(os.path.expanduser("~/.cache/torch/hub/facebookresearch_dinov2_main"), "dinov2_vitb14", source="local", pretrained=False)
model = nn.Sequential(bb, nn.Linear(768, len(labels))); model.load_state_dict(ck["state"])
dev = "mps" if torch.backends.mps.is_available() else "cpu"; model.to(dev).eval()
mean = np.array([0.485, 0.456, 0.406], np.float32); std = np.array([0.229, 0.224, 0.225], np.float32)
SPLIT = [k for k, n in enumerate(labels) if re.match(r"^(Front Panel Upper|Fender Inner (LH|RH)|Front Crossmember|Front Panel Lower)$", n)]
ASSY = [k for k, n in enumerate(labels) if n == "Front Panel Assembly"]
CHS = [k for k, n in enumerate(labels) if re.match(r"^Front Chassis Member (LH|RH)$", n)]
CH1 = [k for k, n in enumerate(labels) if n == "Front Chassis Member"]
MULTI = [k for k, n in enumerate(labels) if "&" in n or re.search(r"\band\b", n, re.I)]
VIEW = [k for k, n in enumerate(labels) if re.search(r"view|photo|odometer|road tax|chassis number|engine number|interior", n, re.I)]
# user 2026-10-12: first decide WHERE the photo is shot (front / rear / side / under) from the whole photo
# (+ the 2 photos before it), then only allow part names from that area for every shape.
ZS = ["FRONT", "REAR", "SIDE", "UNDER"]
def scene_z(n):
    if re.search(r"front view|frt .*view|engine comp", n, re.I): return {"FRONT"}
    if re.search(r"rear view|rr .*view", n, re.I): return {"REAR"}
    if re.search(r"side view", n, re.I): return {"SIDE"}
    z = zones(n); return set() if "ID" in z else z
LZ = [zones(n) for n in labels]; SZ = [scene_z(n) for n in labels]
def area_of(p):
    sc = dict.fromkeys(ZS, 0.0)
    for k, z in enumerate(SZ):
        for a in z: sc[a] += p[k] / len(z)
    return max(sc, key=sc.get), sc
def whole(paths):
    xs = [((np.asarray(Image.open(f).convert("RGB").resize((224, 224), Image.BICUBIC), np.float32) / 255 - mean) / std).transpose(2, 0, 1) for f in paths]
    with torch.no_grad(): P = torch.softmax(model(torch.from_numpy(np.stack(xs)).to(dev)), 1).cpu().numpy()
    w = np.array([1.0] + [0.5] * (len(paths) - 1))[:, None]; return (P * w).sum(0) / w.sum()
def rules(p, veh):
    v = (veh or "").upper()
    if v:
        src, dst = (ASSY, SPLIT) if "PERODUA" in v else (SPLIT, ASSY)
        if src and dst: m = p[src].sum(); p[src] = 0; w = p[dst] if p[dst].sum() > 0 else np.ones(len(dst), np.float32); p[dst] += m * w / w.sum()
    if re.search(r"LORRY|TRUCK", v) and CHS and CH1: p[CH1[0]] += p[CHS].sum(); p[CHS] = 0
    p[MULTI] = 0; p[VIEW] = 0          # a shape is one part, never a whole-car view or a document
    return p / p.sum()
AREA = {}
segs = json.load(open(sys.argv[2])); T = {t["id"]: t for t in json.load(open(sys.argv[3]))}; FULL = sys.argv[4]
for k, polys in segs.items():
    tid = k[:-4]; t = T.get(tid)
    if not t or not polys: continue
    polys = [q["pts"] if isinstance(q, dict) else q for q in polys]
    nbs = [os.path.join(FULL, "%s_%d.jpg" % (tid, k2)) for k2 in (1, 2)]
    area, sc = area_of(whole([os.path.join(FULL, k)] + [f for f in nbs if os.path.exists(f)]))
    allow = np.array([((area in z) or not z) and not re.fullmatch(r"[\d\s.#-]+", n) for z, n in zip(LZ, labels)], np.float32)
    im = Image.open(os.path.join(FULL, k)).convert("RGB"); W, H = im.size; xs = []
    for pts in polys:
        x = np.array(pts[0::2]) * W; y = np.array(pts[1::2]) * H
        x0, x1, y0, y1 = x.min(), x.max(), y.min(), y.max(); mx, my = (x1 - x0) * .15, (y1 - y0) * .15
        c = im.crop((max(0, x0 - mx), max(0, y0 - my), min(W, x1 + mx), min(H, y1 + my))).resize((224, 224), Image.BICUBIC)
        xs.append(((np.asarray(c, np.float32) / 255 - mean) / std).transpose(2, 0, 1))
    with torch.no_grad():
        P = torch.softmax(model(torch.from_numpy(np.stack(xs)).to(dev)), 1).cpu().numpy()
    out = []
    for pts, p in zip(polys, P):
        p = rules(p.copy(), t.get("vehicle")) * allow; p = p / p.sum(); o = np.argsort(-p)[:3]
        out.append({"pts": pts, "name": labels[o[0]], "p": round(float(p[o[0]]), 3), "top": [[labels[j], round(float(p[j]), 3)] for j in o]})
    segs[k] = out; AREA[tid] = area; print(tid, area, {a: round(v, 2) for a, v in sc.items()}, [(s["name"], s["p"]) for s in out][:4], flush=True)
json.dump(segs, open(sys.argv[2], "w"), ensure_ascii=False)
json.dump(AREA, open(sys.argv[2].replace(".json", "_area.json"), "w"))
