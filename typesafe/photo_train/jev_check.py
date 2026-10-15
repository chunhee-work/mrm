#!/usr/bin/env python3
"""Experiment: ask TypeSafe Jev (image model, jev-preview) to pick the part at the crosshair among OUR model's top-5,
for test photos where our model is unsure (<60%). Compares accuracy on the same photos and saves jev_check.json.
  python3 jev_check.py pred_big10c.jsonl 40                                   (local 256 px photos, upscaled)
  IMGDIR=<dir with j<i>.jpg> PREDS=<json list of preds> python3 jev_check.py - 200   (full-res photos)"""
import base64, io, json, os, sys, uuid, random
from concurrent.futures import ThreadPoolExecutor
from PIL import Image
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, os.path.dirname(HERE))
import client
paths = open(os.path.join(HERE, "big_paths.txt")).read().split("\n")
P = json.load(open(os.environ["PREDS"])) if sys.argv[1] == "-" else [json.loads(l) for l in open(os.path.join(HERE, sys.argv[1]))]
N = int(sys.argv[2]) if len(sys.argv) > 2 else 40
IMGDIR = os.environ.get("IMGDIR")
random.seed(5)
cand = [d for d in P if float(d["top"][0][1]) < 0.6 and d["label"] in [t[0] for t in d["top"][:5]]]
if not IMGDIR: random.shuffle(cand)
Q = "This is a car insurance damage photo. Which car part is at the CENTRE of `photo` (the part the photographer aimed at)? LH = left-hand side of the car, RH = right-hand side (from the driver's seat)."

def image(d):
    if IMGDIR:
        im = Image.open(os.path.join(IMGDIR, "j%d.jpg" % d["i"])).convert("RGB")
        if im.width * im.height < 78400 or min(im.size) < 256: im = im.resize((im.width * 2, im.height * 2), Image.BICUBIC)
        im.thumbnail((1568, 1568))
    else:
        im = Image.open(os.path.join(HERE, paths[d["i"]])).convert("RGB")
        im = im.resize((im.width * 3, im.height * 3), Image.BICUBIC)       # API minimum is 280x280 worth of pixels
    b = io.BytesIO(); im.save(b, "JPEG", quality=92); return base64.b64encode(b.getvalue()).decode()

def call(d):
    ref = str(uuid.uuid4())
    q = {"part": {"type": "choice", "instructions": Q, "criteria": {t[0]: t[0] for t in d["top"][:5]}},
         "where": {"type": "box", "instructions": "the car part at the centre of `photo`"}}
    try:
        r = client.ask({"photo": ref}, q, model=os.environ.get("JEV", "jev-preview"),
                       assets={ref: {"type": "image", "format": "jpg", "data_base64": image(d)}}, images=True)
    except Exception as e:
        return {"label": d["label"], "error": str(e)[:200]}
    a = r["answers"]["part"]
    return {"i": d["i"], "label": d["label"], "ours_top": d["top"][:5], "jev": a.get("choice"), "jev_conf": a.get("confidence"),
            "probs": a.get("probabilities"), "box": r["answers"]["where"].get("box"), "usage": r.get("usage")}

with ThreadPoolExecutor(4) as ex:
    out = list(ex.map(call, cand[:N]))
err = [o for o in out if "error" in o]; out = [o for o in out if "error" not in o]
json.dump(out, open(os.path.join(HERE, "jev_check.json"), "w"), indent=1)
ours = sum(o["ours_top"][0][0] == o["label"] for o in out); jev = sum(o["jev"] == o["label"] for o in out)
print("photos", len(out), "errors", len(err), (err[0]["error"] if err else ""))
print("ours %.1f%%  jev %.1f%%" % (100 * ours / max(1, len(out)), 100 * jev / max(1, len(out))))
for w in (0.3, 0.5, 0.7):
    ok = 0
    for o in out:
        s = {n: float(v) for n, v in o["ours_top"]}; t = sum(s.values())
        m = {k: (1 - w) * v / t + w * (o["probs"] or {}).get(k, 0) for k, v in s.items()}
        ok += max(m, key=m.get) == o["label"]
    print("blend jev weight %.1f: %.1f%%" % (w, 100 * ok / max(1, len(out))))
print("avg input tokens", sum(o["usage"]["input_tokens"] for o in out) / max(1, len(out)))
