#!/usr/bin/env python3
"""Name every photo of a case with the fine-tuned DINOv2 model.
  .venv/bin/python predict_case.py <ckpt> <img1> <img2> ...   (images in shooting order)
  .venv/bin/python predict_case.py auto <img1> ...   (or PROD=1): models from models/production.json (swap_model.py; PROD_FILE=<json> overrides)
Prints JSON lines: {file, top:[[name,prob]x3], conf, sure}  (sure = conf >= 0.60, after neighbour smoothing).
SEQ=<models/seq_*.pt> env (batch 10): look at +-4 photos of the case together (whole photo group -> where on the car); then no extra smoothing.
VEHICLE=<vehicle model> env: PERODUA never gets "Front Panel Assembly" (split pieces instead); other makes never get the split pieces."""
import json, os, re, sys, collections
import numpy as np, torch, torch.nn as nn
from PIL import Image
# 2026-11-11 production.json (swap_model.py): ckpt "auto" or PROD=1 -> groups of {stage1 ckpt (its "bb"/"dim" = backbone),
# seq group models}; several groups = probabilities averaged (equal weight per seq model), labels unioned by name.
# PROD_FILE=<json> overrides models/production.json. Any other ckpt = the old single-backbone behaviour (SEQ env).
HERE = os.path.dirname(os.path.abspath(__file__)); _M = os.path.join(HERE, "models")
_HUB = os.environ.get("DINOV2_HUB") or os.path.expanduser("~/.cache/torch/hub/facebookresearch_dinov2_main")   # DINOV2_HUB: the worker image keeps it in /opt
dev = "mps" if torch.backends.mps.is_available() else "cpu"
BS = int(os.environ.get("PRED_BS", "32"))
AUTO = sys.argv[1] == "auto" or os.environ.get("PROD") == "1"
class Ctx(nn.Module):
    def __init__(s, n, win, dim, bdim=768):
        super().__init__(); s.win = win; s.bdim = bdim
        s.base = nn.Linear(bdim, n); s.inp = nn.Linear(dim, 384); s.pos = nn.Parameter(torch.zeros(2 * win + 1, 384))
        s.enc = nn.TransformerEncoder(nn.TransformerEncoderLayer(384, 6, 1024, 0.1, batch_first=True, norm_first=True), 2)
        s.out = nn.Linear(384, n)
    def forward(s, x, m):
        return s.base(x[:, s.win, :s.bdim]) + s.out(s.enc(s.inp(x) + s.pos, src_key_padding_mask=m)[:, s.win])
def _rel(p): return p if os.path.isabs(p) else os.path.join(HERE, p)
def load_backbone(ck):
    """stage-1 checkpoint -> (backbone module, head Linear, labels, dim). Backbone name/dim from the checkpoint (default vitb14/768)."""
    bbn = ck.get("bb", "vitb14"); dim = ck.get("dim", 768); st = ck["state"]
    if bbn.startswith("dinov3"):   # finetune2.py's V3 wrapper (HF transformers); its state also lists blocks./norm. aliases
        from transformers import AutoModel
        class V3(nn.Module):
            def __init__(s, path): super().__init__(); s.m = AutoModel.from_pretrained(path)
            def forward(s, x): return s.m(pixel_values=x).pooler_output
        b = V3(os.path.join(_M, bbn)); st = {k: v for k, v in st.items() if k.startswith("0.m.") or not k.startswith("0.")}
    else:
        b = torch.hub.load(_HUB, "dinov2_" + bbn, source="local", pretrained=False)
    b.load_state_dict({k[2:]: v for k, v in st.items() if k.startswith("0.")})
    h = nn.Linear(dim, len(ck["labels"])); h.weight.data = st["1.weight"]; h.bias.data = st["1.bias"]
    return b.to(dev).eval(), h.to(dev).eval(), ck["labels"], dim
GROUPS = []   # each: dict(bb, head, hl (head labels), dim, ctx=[(Ctx, labels, crop)])
if AUTO:
    PROD = json.load(open(_rel(os.environ.get("PROD_FILE", "models/production.json"))))
    for g in PROD["groups"]:
        b, h, hl, dim = load_backbone(torch.load(_rel(g["stage1"]), map_location="cpu")); cx = []
        for p in g.get("seq", []):
            sk = torch.load(_rel(p), map_location="cpu"); c = Ctx(len(sk["labels"]), sk["win"], sk.get("dim", dim), dim)
            c.load_state_dict(sk["ctx"]); cx.append((c.to(dev).eval(), sk["labels"], sk.get("crop", 0)))
        GROUPS.append(dict(bb=b, head=h, hl=hl, dim=dim, ctx=cx))
    CTX = [t for g in GROUPS for t in g["ctx"]]
    labels = sorted({n for g in GROUPS for n in ([l for _, ls, _ in g["ctx"] for l in ls] if g["ctx"] else g["hl"])}); _LI = {n: k for k, n in enumerate(labels)}
else:
    ck = torch.load(sys.argv[1], map_location="cpu"); labels = ck["labels"]
    bb = torch.hub.load(_HUB, "dinov2_vitb14", source="local", pretrained=False); model = nn.Sequential(bb, nn.Linear(768, len(labels)))
    model.load_state_dict(ck["state"]); model.to(dev).eval()
    # group models (batch 10): SEQ = comma list; default = seq_best.pt (whole photos) + seq_best_crop.pt (whole + crosshair zoom), averaged
    SEQ = os.environ.get("SEQ", ",".join(os.path.join(_M, f) for f in ("seq_best.pt", "seq_best_crop.pt")))
    SEQ = [p for p in SEQ.split(",") if p and p != "0" and os.path.exists(p)]   # SEQ=0 -> single-photo model only
    CTX = []
    for p in SEQ:
        sk = torch.load(p, map_location="cpu"); c = Ctx(len(sk["labels"]), sk["win"], sk.get("dim", 768))
        c.load_state_dict(sk["ctx"]); CTX.append((c.to(dev).eval(), sk["labels"], sk.get("crop", 0)))
    if CTX:
        labels = sorted({n for _, ls, _ in CTX for n in ls}); _LI = {n: k for k, n in enumerate(labels)}
    GROUPS = [dict(bb=bb, ctx=CTX)] if CTX else []
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
# user 2026-10-16: Boot Lid and Tailgate never appear on the same car: 4-door saloon = Boot Lid…, 5-door / hatch / MPV / SUV
# = Tailgate…  Move each name's probability to its counterpart (Tailgate Hinge LH <-> Boot Lid Hinge LH). Striker follows
# the doors too (user 2026-10-16); while the model only knows "Tailgate Striker", rename it for 4-door cars.
_V = os.environ.get("VEHICLE", "")
_DOORS = "boot" if re.search(r"\b4 ?D(r|oor)?\b|\bsal(oon)?\b|\bsedan\b", _V, re.I) else \
         "tail" if re.search(r"\b[35] ?D(r|oor)?\b|\bhatch|\bMPV\b|\bSUV\b|\bwagon\b", _V, re.I) else None
_LI0 = {n: k for k, n in enumerate(labels)}
_SWAP = []
if _DOORS == "boot" and "Boot Lid Striker" not in _LI0 and "Tailgate Striker" in _LI0:
    labels = list(labels); labels[_LI0["Tailgate Striker"]] = "Boot Lid Striker"; _LI0 = {n: k for k, n in enumerate(labels)}
for k, n in enumerate(labels):
    if _DOORS == "boot" and n.startswith("Tailgate"): c = "Boot Lid" + n[len("Tailgate"):]
    elif _DOORS == "tail" and re.match(r"^Boot ?Lid", n): c = re.sub(r"^Boot ?Lid", "Tailgate", n)
    else: continue
    _SWAP.append((k, _LI0.get(c)))
_fm1 = fix_make
def fix_make(p):
    p = _fm1(p)
    for k, c in _SWAP:
        if c is not None: p[c] += p[k]
        p[k] = 0
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
    if GROUPS:
        n = len(files); acc = np.zeros((n, len(labels)), np.float32); nm = sum(len(g["ctx"]) or 1 for g in GROUPS)
        idx = msk = None
        for g in GROUPS:
            feats = lambda crop: torch.cat([g["bb"](torch.from_numpy(np.stack([load(f, crop) for f in files[i:i + BS]])).to(dev)) for i in range(0, len(files), BS)])
            F = feats(0); FC = feats(0.5) if any(cr for _, _, cr in g["ctx"]) else None
            if not g["ctx"]:   # group without seq models: its stage-1 head alone
                acc[:, [_LI[l] for l in g["hl"]]] += torch.softmax(g["head"](F), 1).cpu().numpy() / nm; continue
            for c, ls, cr in g["ctx"]:
                x = torch.cat([F, FC], 1) if cr else F
                idx = torch.tensor([[min(max(i + d, 0), n - 1) for d in range(-c.win, c.win + 1)] for i in range(n)]).to(dev)
                msk = torch.tensor([[not (0 <= i + d < n) for d in range(-c.win, c.win + 1)] for i in range(n)]).to(dev)
                pr = torch.softmax(c(x[idx], msk), 1).cpu().numpy(); cols = [_LI[l] for l in ls]
                acc[:, cols] += pr / nm
            del F, FC
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
# 2026-11-19 user (TM2555: #40-#56 named Rear LH / LH in a run of Front RH photos): "when the image is shoot LH side the next
# image will never suddenly jump to RH, same for rear and front". Checked on the user's labels (3,306 test photos):
#  - a jump to the DIAGONAL corner (Front RH -> Rear LH) never happens (0 of 870 corner pairs; the model did it 7 times)
#    -> such a name hands its probability to the same part at the previous corner (Rear Shock Absorber LH -> Front Shock
#    Absorber RH); test set +2, nothing made wrong;
#  - a lone Front/Rear jump (2 photos before and 2 after agree on the other axle) -> same, test +3.
#  A general "keep the side of the neighbours" smoothing was tried and LOST 111 photos (real runs do change side), so only
#  these two. SIDE=0 turns both off.
_IDX = {n: k for k, n in enumerate(labels)}
_XV = r"view|chassis number|odometer|road tax|interior|engine comp"
def _ax(n): return None if re.search(_XV, n, re.I) else "Front" if re.search(r"\bFront\b", n) else "Rear" if re.search(r"\bRear\b", n) else None
def _sd(n): return None if re.search(_XV, n, re.I) else "LH" if re.search(r"\bLH\b", n) else "RH" if re.search(r"\bRH\b", n) else None
_AX = [_ax(n) for n in labels]; _SD = [_sd(n) for n in labels]
def _move(q, bad, to):   # every name k with bad(k) -> same part renamed by to(name); none -> dropped
    r = q.copy()
    for k in np.nonzero(q)[0]:
        if bad(k):
            t = _IDX.get(to(labels[k]))
            if t is not None: r[t] += q[k]
            r[k] = 0
    return r / r.sum() if r.sum() > 0 else q
if os.environ.get("SIDE", "1") != "0":
    top = [int(np.argmax(p)) for p in P]
    for i in range(len(P)):
        a = _AX[top[i]]
        if not a: continue
        pv = [_AX[top[j]] for j in range(i - 1, -1, -1) if _AX[top[j]]][:2]
        nx = [_AX[top[j]] for j in range(i + 1, len(P)) if _AX[top[j]]][:2]
        if len(pv) == 2 and len(nx) == 2 and len(set(pv + nx)) == 1 and pv[0] != a:
            b = pv[0]
            P[i] = _move(P[i], lambda k: _AX[k] and _AX[k] != b, lambda n: re.sub(r"\b(Front|Rear)\b", b, n))
    prev = None
    for i in range(len(P)):
        t = int(np.argmax(P[i]))
        # only when this photo is LESS sure than the photo that set the corner (a wrong corner must not drag the next ones)
        if prev and _AX[t] and _SD[t] and _AX[t] != prev[0] and _SD[t] != prev[1] and P[i][t] < prev[2]:
            P[i] = _move(P[i], lambda k: _AX[k] and _SD[k] and _AX[k] != prev[0] and _SD[k] != prev[1],
                         lambda n: re.sub(r"\b(LH|RH)\b", prev[1], re.sub(r"\b(Front|Rear)\b", prev[0], n)))
            t = int(np.argmax(P[i]))
        if _AX[t] and _SD[t]:   # corner strength = the surest photo of the current run at that corner
            c = float(P[i][t]); prev = (_AX[t], _SD[t], max(c, prev[2]) if prev and prev[:2] == (_AX[t], _SD[t]) else c)
# 2026-11-15 user: no Jev second opinion for photos any more (was: unsure photos < 60% mixed 70% ours + 30% Jev).
S = []
for i, f in enumerate(files):
    s = P[i].copy()
    for j in ((i - 1, i + 1) if not CTX else ()):
        if 0 <= j < len(files): s += 0.5 * P[j]
    S.append(s / s.sum())
for i, f in enumerate(files):
    s = S[i]
    o = np.argsort(-s)[:3]
    raw = float(P[i][o[0]]) if int(np.argmax(P[i])) == int(o[0]) else 0.0
    print(json.dumps({"file": f, "top": [[labels[k], round(float(s[k]), 3)] for k in o], "conf": round(max(float(s[o[0]]), raw), 3), "sure": bool(max(float(s[o[0]]), raw) >= 0.60), "area": _AREAS[i][0], "area_conf": round(float(_AREAS[i][1]), 2)}, ensure_ascii=False))
