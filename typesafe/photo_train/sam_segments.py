#!/usr/bin/env python3
"""Auto-cut photos into part shapes with SAM 2.1 large -> polygons (normalised 0..1) for the labeling tool.
  .venv_sam2/bin/python sam_segments.py out.json img1.jpg img2.jpg ...   (writes {basename: [[x,y,x,y,...], ...]})"""
import json, os, sys, time
import cv2, numpy as np, torch
from sam2.build_sam import build_sam2
from sam2.automatic_mask_generator import SAM2AutomaticMaskGenerator
HERE = os.path.dirname(os.path.abspath(__file__))
dev = os.environ.get("SAM_DEV", "cpu")
sam = build_sam2("configs/sam2.1/sam2.1_hiera_l.yaml", os.path.join(HERE, "models/sam2/sam2.1_hiera_large.pt"), device=dev)
gen = SAM2AutomaticMaskGenerator(sam, points_per_side=32, pred_iou_thresh=0.7, stability_score_thresh=0.85, min_mask_region_area=200)
out = json.load(open(sys.argv[1])) if os.path.exists(sys.argv[1]) else {}
for f in sys.argv[2:]:
    k = os.path.basename(f)
    if k in out: continue
    t = time.time(); im = cv2.cvtColor(cv2.imread(f), cv2.COLOR_BGR2RGB); H, W = im.shape[:2]
    big = im if max(H, W) >= 700 else cv2.resize(im, (W * 3, H * 3), interpolation=cv2.INTER_CUBIC)   # small photos: upscale
    ms = sorted(gen.generate(big), key=lambda m: m["area"]); polys = []; taken = np.zeros(big.shape[:2], bool)
    for m in ms:
        a = m["area"] / (big.shape[0] * big.shape[1])
        if a < 0.006 or a > 0.45: continue
        seg = m["segmentation"]
        if (seg & taken).sum() > 0.5 * seg.sum(): continue          # mostly covered by parts already kept
        cs, _ = cv2.findContours(seg.astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        if not cs: continue
        c = max(cs, key=cv2.contourArea); eps = 0.006 * cv2.arcLength(c, True)
        ap = cv2.approxPolyDP(c, eps, True)
        while len(ap) > 40: eps *= 1.4; ap = cv2.approxPolyDP(c, eps, True)
        if len(ap) < 3: continue
        polys.append([round(float(v), 3) for p in ap[:, 0, :] for v in (p[0] / big.shape[1], p[1] / big.shape[0])])
        taken |= seg
        if len(polys) >= 20: break
    out[k] = polys; json.dump(out, open(sys.argv[1], "w"))
    print(k, len(polys), "shapes", round(time.time() - t, 1), "s", flush=True)
