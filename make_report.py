#!/usr/bin/env python3
# Usage: make_report.py <case_folder> [plate] 
# Generates report.html inside the case folder: 2-per-row grid, item-name caption centred under each image.
import sys, os, json, html
folder = sys.argv[1]
plate = sys.argv[2] if len(sys.argv) > 2 else os.path.basename(folder.rstrip('/'))
# optional captions file: captions.json  {"1001.JPG": "Front View Right", ...}
caps = {}
cap_path = os.path.join(folder, 'captions.json')
if os.path.exists(cap_path):
    caps = json.load(open(cap_path))
imgs = sorted([f for f in os.listdir(folder) if f.lower().endswith(('.jpg','.jpeg','.png'))])
cells = []
for i, f in enumerate(imgs, 1):
    name = caps.get(f, f)            # use identified item name if available, else filename
    cells.append(f'''<figure>
  <img src="{html.escape(f)}" loading="lazy">
  <figcaption><span class="n">{i}/{len(imgs)}</span> {html.escape(name)}</figcaption>
</figure>''')
doc = f'''<!doctype html><meta charset="utf-8">
<title>{html.escape(plate)} — Damage Report</title>
<style>
 body{{background:#111;color:#eee;font-family:-apple-system,system-ui,sans-serif;margin:0;padding:24px}}
 h1{{font-size:20px;border-bottom:1px solid #444;padding-bottom:10px}}
 .grid{{display:grid;grid-template-columns:1fr 1fr;gap:18px 24px;max-width:1100px}}
 figure{{margin:0;background:#1b1b1b;border:1px solid #333;border-radius:8px;padding:8px}}
 img{{width:100%;height:auto;border-radius:4px;display:block}}
 figcaption{{text-align:center;font-weight:600;margin-top:6px;font-size:14px}}
 .n{{color:#888;font-weight:400;margin-right:6px}}
</style>
<h1>🚗 {html.escape(plate)} — Damage Report &nbsp;·&nbsp; {len(imgs)} photos &nbsp;·&nbsp; Autoris Adjusters Sdn Bhd (HQ)</h1>
<div class="grid">
{''.join(cells)}
</div>'''
out = os.path.join(folder, 'report.html')
open(out, 'w').write(doc)
print(out)
