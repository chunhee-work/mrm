#!/usr/bin/env python3
"""2026-11-07 (user idea 3): after every finished batch, the user's FINAL photo names go into the training queue automatically.
  python3 add_to_training.py <ids.txt: PLATE caseid extid> [PLATE ...]
Reads ~/mrm-bot/photoplan.json (final names, final order), copies each photo as a 256 px JPEG into data/queue/<PLATE>/NNN.jpg and
appends "label<TAB>caseid<TAB>seq<TAB>path" rows to train_queue.tsv (a plate already queued is skipped).
The next label build (build_n5 ...) adds train_queue.tsv as training photos; names go through name_map.final."""
import json, os, sys
from PIL import Image
HERE = os.path.dirname(os.path.abspath(__file__))
Q = os.path.join(HERE, "train_queue.tsv")
ids = {l.split()[0]: l.split()[1] for l in open(sys.argv[1]) if l.strip()}
plates = sys.argv[2:] or list(ids)
plan = json.load(open(os.path.expanduser("~/mrm-bot/photoplan.json")))
done = {l.split("\t")[1] for l in open(Q)} if os.path.exists(Q) else set()
n = 0
with open(Q, "a") as q:
    for p in plates:
        if p not in plan or ids[p] in done:
            continue
        out = os.path.join(HERE, "data", "queue", p); os.makedirs(out, exist_ok=True)
        for seq, (src, _cat, lab) in enumerate(plan[p], 1):
            if not os.path.exists(src):
                continue
            dst = os.path.join(out, "%03d.jpg" % seq)
            if not os.path.exists(dst):
                im = Image.open(src).convert("RGB"); im.thumbnail((256, 256)); im.save(dst, quality=90)
            q.write("%s\t%s\t%d\t%s\n" % (lab, ids[p], seq, os.path.relpath(dst, HERE))); n += 1
print("queued", n, "photos ->", Q)
