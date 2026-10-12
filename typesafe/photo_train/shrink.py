#!/usr/bin/env python3
"""Shrink every photo in data/ to max 256 px (atomic replace, safe while training reads)."""
import os, sys
from multiprocessing import Pool
from PIL import Image
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
def one(p):
    try:
        im = Image.open(p)
        if max(im.size) <= 260: return 0
        im = im.convert("RGB"); im.thumbnail((256, 256), Image.LANCZOS)
        t = p + ".tmp"; im.save(t, "JPEG", quality=85); os.replace(t, p); return 1
    except Exception: return 0
if __name__ == "__main__":
    files = [os.path.join(d, f) for d, _, fs in os.walk(ROOT) for f in fs if f.endswith(".jpg")]
    n = 0
    with Pool(4) as pool:
        for k, r in enumerate(pool.imap_unordered(one, files, chunksize=200), 1):
            n += r
            if k % 50000 == 0: print(k, "/", len(files), flush=True)
    print("DONE shrunk", n, "of", len(files), flush=True)
