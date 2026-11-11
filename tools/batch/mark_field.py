#!/usr/bin/env python3
"""2026-11-10 (user: "next time send me like this, image"): render a PDF page and draw a red box around the missing/blank field,
then send it to the user with the pending line.
  typesafe/photo_train/.venv/bin/python tools/batch/mark_field.py <pdf> <page 1-based> <x0,y0,x1,y1 as 0-1 fractions> <out.png> [crop y0,y1]
Example (VBK3162 Nama Syarikat): ... "VBK3162 adj sinar.pdf" 8 0.04,0.69,0.47,0.72 mark.png 0.2,0.8"""
import sys, fitz
from PIL import Image, ImageDraw
pdf, pg, box, out = sys.argv[1], int(sys.argv[2]), [float(v) for v in sys.argv[3].split(",")], sys.argv[4]
d = fitz.open(pdf); p = d[pg - 1]; pm = p.get_pixmap(dpi=150)
im = Image.frombytes("RGB", (pm.width, pm.height), pm.samples); W, H = im.size
ImageDraw.Draw(im).rounded_rectangle([box[0] * W, box[1] * H, box[2] * W, box[3] * H], radius=12, outline=(230, 40, 40), width=6)
if len(sys.argv) > 5:
    a, b = [float(v) for v in sys.argv[5].split(",")]; im = im.crop((0, int(a * H), W, int(b * H)))
im.save(out); print(out)
