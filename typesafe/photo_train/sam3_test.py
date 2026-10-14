#!/usr/bin/env python3
"""SAM 3 text-prompt test on Mac: for each image, find car parts by name. -> sam3_out.json {img: [{prompt, score, pts}]}
  .venv_sam3/bin/python sam3_test.py out.json img1.jpg ..."""
import json, os, sys, time
import cv2, numpy as np, torch
from PIL import Image
from transformers import Sam3Processor, Sam3Model
HERE = os.path.dirname(os.path.abspath(__file__)); M = os.path.join(HERE, "models/sam3")
dev = os.environ.get("SAM3_DEV", "cpu")
model = Sam3Model.from_pretrained(M).to(dev).eval(); proc = Sam3Processor.from_pretrained(M)
PROMPTS = os.environ.get("PROMPTS", "car bumper,headlamp,tail light,fender,car door,wheel,car bonnet,grille,side mirror,radiator,exhaust pipe,fog lamp,license plate,windscreen").split(",")
out = json.load(open(sys.argv[1])) if os.path.exists(sys.argv[1]) else {}
for f in sys.argv[2:]:
    k = os.path.basename(f)
    if k in out: continue
    im = Image.open(f).convert("RGB"); t = time.time(); res = []
    img_in = proc(images=im, return_tensors="pt").to(dev)
    with torch.no_grad(): vis = model.get_vision_features(pixel_values=img_in["pixel_values"])   # look at the photo once
    for pr in PROMPTS:
        tx = proc(text=pr, return_tensors="pt").to(dev)
        with torch.no_grad(): o = model(vision_embeds=vis, input_ids=tx["input_ids"], attention_mask=tx["attention_mask"])
        r = proc.post_process_instance_segmentation(o, threshold=0.4, mask_threshold=0.5, target_sizes=img_in.get("original_sizes").tolist())[0]
        for m, s in zip(r["masks"], r["scores"]):
            m = m.cpu().numpy().astype(np.uint8)
            cs, _ = cv2.findContours(m, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            if not cs: continue
            c = max(cs, key=cv2.contourArea); ap = cv2.approxPolyDP(c, 0.006 * cv2.arcLength(c, True), True)
            if len(ap) < 3: continue
            res.append({"prompt": pr, "score": round(float(s), 3), "pts": [round(float(v), 3) for p in ap[:, 0, :] for v in (p[0] / im.width, p[1] / im.height)]})
    out[k] = res; json.dump(out, open(sys.argv[1], "w"))
    print(k, len(res), "parts", round(time.time() - t, 1), "s", sorted({(x["prompt"], x["score"]) for x in res}, key=lambda x: -x[1])[:6], flush=True)
