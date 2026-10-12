#!/usr/bin/env python3
"""DINOv2 image features for every photo, same row order as feats.bin.paths -> <out>.bin (+ .paths)."""
import os, sys, time
import numpy as np, torch
from PIL import Image
HERE = os.path.dirname(os.path.abspath(__file__))
name = sys.argv[1] if len(sys.argv) > 1 else "dinov2_vitb14"
out = os.path.join(HERE, "feats_%s.bin" % name)
BS = int(sys.argv[2]) if len(sys.argv) > 2 else 64
dev = "mps" if torch.backends.mps.is_available() else "cpu"
model = torch.hub.load("facebookresearch/dinov2", name).to(dev).eval()
paths = open(os.path.join(HERE, "feats.bin.paths")).read().split("\n")
mean = np.array([0.485, 0.456, 0.406], np.float32); std = np.array([0.229, 0.224, 0.225], np.float32)
def load(p):
    im = Image.open(os.path.join(HERE, p)).convert("RGB").resize((224, 224), Image.BICUBIC)
    return ((np.asarray(im, np.float32) / 255 - mean) / std).transpose(2, 0, 1)
t0 = time.time()
with open(out, "wb") as f, torch.no_grad():
    for i in range(0, len(paths), BS):
        x = torch.from_numpy(np.stack([load(p) for p in paths[i:i + BS]])).to(dev)
        y = model(x)
        f.write(y.float().cpu().numpy().astype(np.float32).tobytes())
        if i % (BS * 50) == 0:
            print(i, int(time.time() - t0), "s", flush=True)
open(out + ".paths", "w").write("\n".join(paths))
print("done", len(paths), "dim", y.shape[1])
