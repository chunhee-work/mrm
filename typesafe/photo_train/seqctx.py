#!/usr/bin/env python3
"""Batch 10 stage 2: look at the whole photo group, not one photo alone.
A photo set is shot in order (wide view first, then close-ups), so the photos before/after tell WHERE on the car a close-up is.
  extract: run the stage-1 model (finetune2.py) once over every photo -> feats_<ft>.npy (fp16, 768-d)
  train:   small transformer over a window of +-WIN photos of the same case -> name of the centre photo
           logits = stage-1 head(centre) + context correction (starts at zero = starts at stage-1 accuracy)
Usage: python seqctx.py extract models/dinov2_b_big10a.pt big10a
       python seqctx.py train   models/dinov2_b_big10a.pt big10a big10      (labels from big_meta.tsv = latest rules)"""
import re, collections, json, os, random, sys, time
import numpy as np, torch, torch.nn as nn
from PIL import Image
from save_util import atomic_save  # crash-safe checkpoint writes (2026-11-12)
HERE = os.path.dirname(os.path.abspath(__file__))
dev = "mps" if torch.backends.mps.is_available() else "cpu"
WIN = int(os.environ.get("WIN", "4"))
mode, CK, FT = sys.argv[1], sys.argv[2], sys.argv[3]
paths = open(os.path.join(HERE, os.environ.get("PATHS_FILE", "big_paths_n3.txt"))).read().split("\n")
meta = [l.split("\t") for l in open(os.path.join(HERE, os.environ.get("META_FILE", "big_meta_n3.tsv"))).read().split("\n") if l]
CROP = float(os.environ.get("CROP", "0"))          # extract: >0 = only the centre (crosshair) part, e.g. 0.5 = middle half, zoomed in
FLIP = os.environ.get("FLIP") == "1"   # 2026-11-04 extract: mirror every photo left<->right (LH/RH augmentation + test-time augmentation) -> feats_<ft>[_c]_f.npy
FEATS = os.path.join(HERE, "feats_%s%s%s.npy" % (FT, "_c" if CROP and mode == "extract" else "", "_f" if FLIP and mode == "extract" else ""))
FEATC = os.path.join(HERE, "feats_%s_c.npy" % FT)   # train: used when it exists (whole photo + crosshair zoom)
ck = torch.load(os.path.join(HERE, CK), map_location="cpu"); BBN = ck.get("bb", "vitb14"); DIM = ck.get("dim", 768)   # 2026-11-05 backbone from the checkpoint
mean = np.array([0.485, 0.456, 0.406], np.float32); std = np.array([0.229, 0.224, 0.225], np.float32)

def img(i):
    try:
        im = Image.open(os.path.join(HERE, paths[i])).convert("RGB")
        if FLIP: im = im.transpose(Image.FLIP_LEFT_RIGHT)
        if CROP:
            w, h = im.size; cw, ch = w * CROP, h * CROP; im = im.crop((int((w - cw) / 2), int((h - ch) / 2), int((w + cw) / 2), int((h + ch) / 2)))
        a = np.asarray(im.resize((224, 224), Image.BICUBIC), np.float32) / 255
    except Exception: a = np.zeros((224, 224, 3), np.float32) + mean
    return ((a - mean) / std).transpose(2, 0, 1)

if mode == "extract":
    _HUB = os.path.expanduser("~/.cache/torch/hub/facebookresearch_dinov2_main")
    if BBN.startswith("dinov3"):   # 2026-11-07: DINOv3 student from finetune2.py (HF transformers), same wrapper as there
        from transformers import AutoModel
        class V3(torch.nn.Module):
            def __init__(s, path): super().__init__(); s.m = AutoModel.from_pretrained(path)
            def forward(s, x): return s.m(pixel_values=x).pooler_output
        bb = V3(os.path.join(HERE, "models", BBN))
        ck["state"] = {k: v for k, v in ck["state"].items() if k.startswith("0.m.") or not k.startswith("0.")}   # finetune2's V3 also lists blocks./norm. aliases
    else:
        bb = torch.hub.load(_HUB, "dinov2_" + BBN, source="local")
    bb.load_state_dict({k[2:]: v for k, v in ck["state"].items() if k.startswith("0.")}); bb = bb.to(dev).eval()
    N = len(meta); F = np.lib.format.open_memmap(FEATS + ".part", "w+", np.float16, (N, DIM)); t0 = time.time()
    # 2026-11-03: BASE_FEATS=<old feats .npy> -> copy its rows (same photo order) and only run the new photos after them
    BASE = os.environ.get("BASE_FEATS"); START = 0
    if BASE:
        OF = np.load(os.path.join(HERE, BASE), mmap_mode="r"); START = len(OF)
        for k in range(0, START, 65536): e = min(k + 65536, START); F[k:e] = OF[k:e]
        print("copied", START, "rows from", BASE, flush=True)
    from concurrent.futures import ThreadPoolExecutor
    ex = ThreadPoolExecutor(6)
    with torch.no_grad():
        # 2026-11-03: NEED=1 -> only photos inside a +-WIN window of a train/test photo (the rest are never read; left 0)
        todo = list(range(START, N))
        if os.environ.get("NEED") == "1":
            cs = collections.defaultdict(list)
            for i, m in enumerate(meta): cs[m[1]].append(i)
            need = set()
            for ids in cs.values():
                ids.sort(key=lambda i: int(meta[i][2]))
                for p, i in enumerate(ids):
                    if meta[i][3] == "train" or (meta[i][3] == "test" and meta[i][0]): need.update(ids[max(0, p - WIN):p + WIN + 1])
            todo = sorted(i for i in need if i >= START); print("NEED: extracting", len(todo), "of", N, flush=True)
        for n, k in enumerate(range(0, len(todo), 128)):
            ii = todo[k:k + 128]
            x = torch.from_numpy(np.stack(list(ex.map(img, ii)))).to(dev)
            F[ii] = bb(x).float().cpu().numpy().astype(np.float16)
            if n % 200 == 0: print("extract", k, "/", len(todo), int(time.time() - t0), "s", flush=True)
    F.flush(); del F; os.replace(FEATS + ".part", FEATS); print("extract done", int(time.time() - t0), "s", flush=True); sys.exit()

# ---- train ----
TAG = sys.argv[4]
F = np.load(FEATS, mmap_mode="r")
FC = np.load(FEATC, mmap_mode="r") if os.path.exists(FEATC) and os.environ.get("USE_CROP", "1") == "1" else None
D = DIM * (2 if FC is not None else 1); print("crosshair zoom features:", FC is not None, flush=True)
# 2026-11-05 ideas 2+4: mirrored photos. FLIP_AUG=<p>: during training a whole window is swapped for its mirrored features with
# probability p and the label is mirrored (LH<->RH, Left<->Right); TTA=1: test = mean of normal + mirrored (mirrored class map).
FAUG = float(os.environ.get("FLIP_AUG", "0")); TTA = os.environ.get("TTA") == "1"
FF = np.load(FEATS[:-4] + "_f.npy", mmap_mode="r") if (FAUG or TTA) else None
FCF = np.load(FEATC[:-4] + "_f.npy", mmap_mode="r") if (FAUG or TTA) and FC is not None else None
def mirror(k):
    sw = {"LH": "RH", "RH": "LH", "Left": "Right", "Right": "Left"}
    return re.sub(r"\b(LH|RH|Left|Right)\b", lambda m: sw[m.group(1)], k)
case = collections.defaultdict(list)
for i, m in enumerate(meta): case[m[1]].append(i)
for c in case: case[c].sort(key=lambda i: int(meta[i][2]))
where = {}
for c, ids in case.items():
    for p, i in enumerate(ids): where[i] = (c, p)
tr = [i for i, m in enumerate(meta) if m[3] == "train"]
te = [i for i, m in enumerate(meta) if m[3] == "test" and m[0]]
if os.environ.get("FOLD") in ("0", "1"):   # 2026-11-04 label audit: train on half the CASES, score the other half (pred_<TAG>.jsonl = the scored half)
    import zlib; fo = int(os.environ["FOLD"]); h = lambda i: zlib.crc32(meta[i][1].encode()) % 2
    te = [i for i in tr if h(i) == fo and meta[i][0]]; tr = [i for i in tr if h(i) != fo]
labels = sorted({meta[i][0] for i in tr}); L = {k: j for j, k in enumerate(labels)}
MIR = [L.get(mirror(k), j) for j, k in enumerate(labels)]   # class j of a mirrored photo = class MIR[j]
old = {k: j for j, k in enumerate(ck["labels"])}

def rows_for(old_labels):
    """new label -> rows of an older head. Same name = that row; a name renamed/merged by the current
    name rules (name_map.final + same words any order) = average of the old rows that now mean it (WARM_MAP=0: exact only)."""
    o = {k: j for j, k in enumerate(old_labels)}; out = {k: [o[k]] for k in L if k in o}
    if os.environ.get("WARM_MAP", "1") == "1":
        sys.path.insert(0, HERE); from name_map import final, order_key
        ok = {order_key(k): k for k in L}; m = collections.defaultdict(list)
        for k, j in o.items():
            f = final(k) if k not in L else None
            t = ok.get(order_key(f)) if f else None
            if t and t not in out: m[t].append(j)
        out.update(m)
    return out

def window(i, drop=0.0):
    c, p = where[i]; ids = case[c]; idx = []; msk = []
    for d in range(-WIN, WIN + 1):
        q = p + d; ok = 0 <= q < len(ids) and (d == 0 or random.random() >= drop)
        idx.append(ids[q] if ok else i); msk.append(not ok)
    return idx, msk

class Ctx(nn.Module):
    def __init__(s):
        super().__init__()
        s.base = nn.Linear(DIM, len(labels)); s.inp = nn.Linear(D, 384); s.pos = nn.Parameter(torch.zeros(2 * WIN + 1, 384))
        s.enc = nn.TransformerEncoder(nn.TransformerEncoderLayer(384, 6, 1024, 0.1, batch_first=True, norm_first=True), 2)
        s.out = nn.Linear(384, len(labels)); nn.init.zeros_(s.out.weight); nn.init.zeros_(s.out.bias)
    def forward(s, x, m):
        h = s.enc(s.inp(x) + s.pos, src_key_padding_mask=m)
        return s.base(x[:, WIN, :DIM]) + s.out(h[:, WIN])
net = Ctx()
with torch.no_grad():   # stage-1 head as the starting point
    for k, rs in rows_for(ck["labels"]).items():
        j = L[k]; net.base.weight[j] = ck["state"]["1.weight"][rs].mean(0); net.base.bias[j] = ck["state"]["1.bias"][rs].mean(0)
INIT_SEQ = os.environ.get("INIT_SEQ")   # warm start from an earlier group model (rows copied by label name)
if INIT_SEQ:
    ck2 = torch.load(os.path.join(HERE, INIT_SEQ), map_location="cpu"); st = ck2["ctx"]; o2 = rows_for(ck2["labels"])
    with torch.no_grad():
        for n, p in net.named_parameters():
            if n.startswith(("base.", "out.")):
                for k, rs in o2.items(): p[L[k]] = st[n][rs].mean(0)
            elif n in st and st[n].shape == p.shape: p.copy_(st[n])
    print("warm start from", INIT_SEQ, "labels shared", sum(k in ck2["labels"] for k in L), "+ renamed/merged", len(o2) - sum(k in ck2["labels"] for k in L), "/", len(L), flush=True)
net = net.to(dev)
RARE = int(os.environ.get("RARE", "0"))   # oversample labels with fewer than RARE train photos up to ~RARE
cnt = collections.Counter(meta[i][0] for i in tr)
rare_labels = {k for k, c in cnt.items() if c < RARE}
if RARE:
    tr = tr + [i for i in tr if meta[i][0] in rare_labels for _ in range(max(0, -(-RARE // cnt[meta[i][0]]) - 1))]
    print("rare labels (<%d train photos):" % RARE, len(rare_labels), "train rows now", len(tr), flush=True)
EP = int(os.environ.get("EPOCHS", "6")); B = 256
opt = torch.optim.AdamW([{"params": net.base.parameters(), "lr": 1e-4}, {"params": [p for n, p in net.named_parameters() if not n.startswith("base.")], "lr": 5e-4}], weight_decay=0.05)
sched = torch.optim.lr_scheduler.OneCycleLR(opt, max_lr=[1e-4, 5e-4], total_steps=max(1, EP * (len(tr) // B)))
lossf = nn.CrossEntropyLoss(label_smoothing=0.1)

def batch(ids, drop, flip=None):
    ws = [window(i, drop) for i in ids]; flip = flip or [False] * len(ids)
    x = np.stack([(FF if f else F)[w[0]] for w, f in zip(ws, flip)]).astype(np.float32)
    if FC is not None: x = np.concatenate([x, np.stack([(FCF if f else FC)[w[0]] for w, f in zip(ws, flip)]).astype(np.float32)], 2)
    x = torch.from_numpy(x).to(dev)
    return x, torch.tensor([w[1] for w in ws]).to(dev)

def evaluate(write=False):
    net.eval(); ok = t3 = 0; out = []
    with torch.no_grad():
        for k in range(0, len(te), B):
            ids = te[k:k + B]; pr = torch.softmax(net(*batch(ids, 0)), 1).cpu().numpy()
            if TTA:   # mirrored view says "class MIR[j]" where the normal view says j
                pf = torch.softmax(net(*batch(ids, 0, [True] * len(ids))), 1).cpu().numpy(); pr = (pr + pf[:, MIR]) / 2
            for i, p in zip(ids, pr):
                o = np.argsort(-p)[:5]; lab = meta[i][0]
                ok += labels[o[0]] == lab; t3 += lab in [labels[j] for j in o[:3]]
                out.append({"i": i, "label": lab, "cid": meta[i][1], "seq": meta[i][2], "top": [[labels[j], "%.3f" % p[j]] for j in o]})
    if write:
        with open(os.path.join(HERE, "pred_%s.jsonl" % TAG), "w") as f:
            for o in out: f.write(json.dumps(o) + "\n")
    if RARE:
        rr = [o for o in out if o["label"] in rare_labels]
        if rr: print("  rare items: %d test photos, top1 %.1f%%" % (len(rr), 100 * sum(o["top"][0][0] == o["label"] for o in rr) / len(rr)), flush=True)
    net.train(); return ok / len(te), t3 / len(te)

if os.environ.get("SCORE_TRAIN") == "1":   # 2026-11-04: score every TRAIN photo with the warm-started model (no training) -> pred_train_<TAG>.jsonl, to find wrong labels
    net.eval(); uq = sorted(set(tr))
    with torch.no_grad(), open(os.path.join(HERE, "pred_train_%s.jsonl" % TAG), "w") as fo:
        for k in range(0, len(uq), B):
            ids = uq[k:k + B]; pr = torch.softmax(net(*batch(ids, 0)), 1).cpu().numpy()
            for i, p in zip(ids, pr):
                o = np.argsort(-p)[:3]; lab = meta[i][0]
                fo.write(json.dumps({"i": i, "label": lab, "p_label": round(float(p[L[lab]]), 3), "cid": meta[i][1], "seq": meta[i][2], "top": [[labels[j], round(float(p[j]), 3)] for j in o]}) + "\n")
    print("scored", len(uq), flush=True); sys.exit()
a1, a3 = evaluate(); print("start (stage-1 head only) top1 %.1f%% top3 %.1f%%" % (100 * a1, 100 * a3), flush=True)
best = 0; t0 = time.time()
for ep in range(EP):
    random.shuffle(tr)
    for k in range(0, len(tr) - B + 1, B):
        ids = tr[k:k + B]; fl = [FAUG > 0 and random.random() < FAUG and L.get(mirror(meta[i][0])) is not None for i in ids]
        y = torch.tensor([L[mirror(meta[i][0])] if f else L[meta[i][0]] for i, f in zip(ids, fl)]).to(dev)
        loss = lossf(net(*batch(ids, 0.15, fl)), y); opt.zero_grad(); loss.backward(); opt.step(); sched.step()
        if k % (B * 200) == 0: print("ep", ep, k, "loss %.3f" % loss.item(), int(time.time() - t0), "s", flush=True)
    a1, a3 = evaluate(); print("EPOCH", ep, "test top1 %.1f%% top3 %.1f%%" % (100 * a1, 100 * a3), int(time.time() - t0), "s", flush=True)
    if a1 > best:
        best = a1; atomic_save({"ctx": net.state_dict(), "labels": labels, "win": WIN, "backbone": CK, "crop": 0.5 if FC is not None else 0, "dim": D}, os.path.join(HERE, "models", "seq_%s.pt" % TAG)); evaluate(write=True)
print("best top1 %.1f%%" % (100 * best))
