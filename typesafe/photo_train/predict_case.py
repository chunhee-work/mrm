#!/usr/bin/env python3
"""Name every photo of a case with the fine-tuned DINOv2 model.
  .venv/bin/python predict_case.py <ckpt> <img1> <img2> ...   (images in shooting order)
Prints JSON lines: {file, top:[[name,prob]x3], conf, sure}  (sure = conf >= 0.60, after neighbour smoothing).
JEV=0 env: no TypeSafe second opinion for unsure photos (default on).
SEQ=<models/seq_*.pt> env (batch 10): look at +-4 photos of the case together (whole photo group -> where on the car); then no extra smoothing.
VEHICLE=<vehicle model> env: PERODUA never gets "Front Panel Assembly" (split pieces instead); other makes never get the split pieces."""
import json, os, re, sys, collections
import numpy as np, torch, torch.nn as nn
from PIL import Image
ck = torch.load(sys.argv[1], map_location="cpu"); labels = ck["labels"]
bb = torch.hub.load(os.path.expanduser("~/.cache/torch/hub/facebookresearch_dinov2_main"), "dinov2_vitb14", source="local", pretrained=False); model = nn.Sequential(bb, nn.Linear(768, len(labels)))
model.load_state_dict(ck["state"]); dev = "mps" if torch.backends.mps.is_available() else "cpu"; model.to(dev).eval()
# group models (batch 10): SEQ = comma list; default = seq_best.pt (whole photos) + seq_best_crop.pt (whole + crosshair zoom), averaged
_M = os.path.join(os.path.dirname(os.path.abspath(__file__)), "models")
SEQ = os.environ.get("SEQ", ",".join(os.path.join(_M, f) for f in ("seq_best.pt", "seq_best_crop.pt")))
SEQ = [p for p in SEQ.split(",") if p and p != "0" and os.path.exists(p)]   # SEQ=0 -> single-photo model only
class Ctx(nn.Module):
    def __init__(s, n, win, dim):
        super().__init__(); s.win = win
        s.base = nn.Linear(768, n); s.inp = nn.Linear(dim, 384); s.pos = nn.Parameter(torch.zeros(2 * win + 1, 384))
        s.enc = nn.TransformerEncoder(nn.TransformerEncoderLayer(384, 6, 1024, 0.1, batch_first=True, norm_first=True), 2)
        s.out = nn.Linear(384, n)
    def forward(s, x, m):
        return s.base(x[:, s.win, :768]) + s.out(s.enc(s.inp(x) + s.pos, src_key_padding_mask=m)[:, s.win])
CTX = []
for p in SEQ:
    sk = torch.load(p, map_location="cpu"); c = Ctx(len(sk["labels"]), sk["win"], sk.get("dim", 768))
    c.load_state_dict(sk["ctx"]); CTX.append((c.to(dev).eval(), sk["labels"], sk.get("crop", 0)))
if CTX:
    labels = sorted({n for _, ls, _ in CTX for n in ls}); _LI = {n: k for k, n in enumerate(labels)}
mean = np.array([0.485, 0.456, 0.406], np.float32); std = np.array([0.229, 0.224, 0.225], np.float32)
def load(p, crop=0):
    im = Image.open(p).convert("RGB")
    if crop:
        w, h = im.size; cw, ch = w * crop, h * crop; im = im.crop((int((w - cw) / 2), int((h - ch) / 2), int((w + cw) / 2), int((h + ch) / 2)))
    a = np.asarray(im.resize((224, 224), Image.BICUBIC), np.float32) / 255
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
    global _PV
    p = _fm2(p); p[MULTI] = 0
    if _PV is None: _PV = _prior_vec() if True else None; _PV = _PV if _PV is not None else False
    if _PV is not False: p = p * _PV
    return p / p.sum()
# user idea 2026-10-16: which car model has which parts -> soft prior from vehicle_priors.json (build_priors.py).
# body type when the vehicle string names it (Sal/Hatch/SUV…), else make+model family. Test: 81.4% -> 81.6%.
_PR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "vehicle_priors.json")
def _prior_vec():
    v = os.environ.get("VEHICLE", "")
    if not v or not os.path.exists(_PR) or os.environ.get("PRIOR") != "1": return None   # user 2026-10-16: do not use (off unless PRIOR=1)
    import build_priors as bp
    pr = json.load(open(_PR)); G = pr["global"]; GT = sum(G.values())
    b = bp.body(v); T, beta = (pr["body"].get(b), .25) if b in pr["body"] else (pr["family"].get(bp.family(v)), .1)
    if not T: return None
    TT = sum(T.values())
    return np.array([(((T.get(n, 0) + 1) / TT) / ((G.get(n, 0) + 1) / GT)) ** beta for n in labels], np.float32)
_PV = None
files = sys.argv[2:]; P = []
with torch.no_grad():
    if CTX:
        feats = lambda crop: torch.cat([bb(torch.from_numpy(np.stack([load(f, crop) for f in files[i:i + 32]])).to(dev)) for i in range(0, len(files), 32)])
        F = feats(0); FC = feats(0.5) if any(cr for _, _, cr in CTX) else None
        n = len(files); acc = np.zeros((n, len(labels)), np.float32)
        for c, ls, cr in CTX:
            x = torch.cat([F, FC], 1) if cr else F
            idx = torch.tensor([[min(max(i + d, 0), n - 1) for d in range(-c.win, c.win + 1)] for i in range(n)]).to(dev)
            msk = torch.tensor([[not (0 <= i + d < n) for d in range(-c.win, c.win + 1)] for i in range(n)]).to(dev)
            pr = torch.softmax(c(x[idx], msk), 1).cpu().numpy(); cols = [_LI[l] for l in ls]
            acc[:, cols] += pr / len(CTX)
        P = [fix_make(p) for p in acc]
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
# second opinion (user 2026-10-15): for unsure photos (< 60%) ask TypeSafe Jev (image model) to pick among our top-5,
# then mix 70% ours + 30% Jev (test: 53.5% -> 59.0% on unsure photos). JEV=0 turns it off; any API error = keep ours.
S = []
for i, f in enumerate(files):
    s = P[i].copy()
    for j in ((i - 1, i + 1) if not CTX else ()):
        if 0 <= j < len(files): s += 0.5 * P[j]
    S.append(s / s.sum())
JEV = {}
def _jev(i):
    import base64, io, uuid
    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__)))); import client
    top = [labels[k] for k in np.argsort(-S[i])[:5]]
    im = Image.open(files[i]).convert("RGB")
    while im.width * im.height < 78400 or min(im.size) < 256: im = im.resize((im.width * 2, im.height * 2), Image.BICUBIC)
    im.thumbnail((1568, 1568)); b = io.BytesIO(); im.save(b, "JPEG", quality=92); ref = str(uuid.uuid4())
    q = {"part": {"type": "choice", "criteria": {n: n for n in top}, "instructions": "This is a car insurance damage photo. Which car part is at the CENTRE of `photo` (the part the photographer aimed at)? LH = left-hand side of the car, RH = right-hand side (from the driver's seat)."}}
    r = client.ask({"photo": ref}, q, model=os.environ.get("JEV_MODEL", "jev-preview"), images=True,
                   assets={ref: {"type": "image", "format": "jpg", "data_base64": base64.b64encode(b.getvalue()).decode()}})
    return r["answers"]["part"].get("probabilities") or {}
unsure = [i for i in range(len(files)) if S[i].max() < 0.60]
if os.environ.get("JEV", "1") != "0" and unsure:
    from concurrent.futures import ThreadPoolExecutor
    def _safe(i):
        try: return i, _jev(i)
        except Exception as e: print("jev skipped:", str(e)[:120], file=sys.stderr); return i, None
    with ThreadPoolExecutor(4) as ex:
        for i, pr in ex.map(_safe, unsure):
            if pr: JEV[i] = pr
for i, f in enumerate(files):
    s = S[i]
    if i in JEV:
        o5 = np.argsort(-s)[:5]; mass = float(s[o5].sum()); s = s.copy()
        for k in o5: s[k] = mass * (0.7 * s[k] / mass + 0.3 * float(JEV[i].get(labels[k], 0)))
    o = np.argsort(-s)[:3]
    raw = float(P[i][o[0]]) if int(np.argmax(P[i])) == int(o[0]) else 0.0
    print(json.dumps({"file": f, "top": [[labels[k], round(float(s[k]), 3)] for k in o], "conf": round(max(float(s[o[0]]), raw), 3), "sure": bool(max(float(s[o[0]]), raw) >= 0.60), "area": _AREAS[i][0], "area_conf": round(float(_AREAS[i][1]), 2), "jev": i in JEV}, ensure_ascii=False))
