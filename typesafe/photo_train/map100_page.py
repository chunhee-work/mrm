#!/usr/bin/env python3
"""2026-11-09: the 100 n4 training labels that are not in the user's names.json -> 🏷️ 名字对应台 (map100/index.html) for the user to confirm.
  python3 map100_page.py            # build the page from map100.json (+ hand fixes below)
  python3 map100_page.py apply <db_dir>   # ArtifactData list map -> <db_dir>/map/*.json -> label_map100.json (old -> new | KEEP | DROP | MAKE)"""
import base64, io, json, os, sys, glob
from PIL import Image
HERE = os.path.dirname(os.path.abspath(__file__))
if len(sys.argv) > 1 and sys.argv[1] == "apply":
    out = {}
    for f in glob.glob(os.path.join(sys.argv[2], "map", "*.json")):
        d = json.load(open(f)); d = d.get("data", d)
        if d.get("old") and d.get("choice"): out[d["old"]] = d["name"] if d["choice"] == "other" else d["choice"].upper()
    json.dump(out, open(os.path.join(HERE, "label_map100.json"), "w"), indent=0, ensure_ascii=False); print("decisions", len(out)); sys.exit()
M = json.load(open(os.path.join(HERE, "map100.json")))
paths = open(os.path.join(HERE, "big_paths_n4.txt")).read().split("\n")
UN = json.load(open(os.path.join(HERE, "..", "..", "tools", "naming-desk", "names.json"))); UN = sorted(set(UN if isinstance(UN, list) else UN.get("names", UN)))
KEEP = "__KEEP__"; MAKE = "__MAKE__"
FIX = {   # my review of the weak automatic suggestions (KEEP = no right name in the list, keep the old one as a new name)
 "Tailgate Badge (LOGO)": [MAKE], "Grille Badge (LOGO)": [MAKE], "Boot Lid Badge (LOGO)": [MAKE],
 "Bumper Protector Front LH": [KEEP], "Lamp Assembly Rear Inner": ["Rear Lamp Inner LH", "Rear Lamp Inner RH"],
 "Lamp Assembly Rear Centre": [KEEP], "Fuel Filler Cap": [KEEP, "Fuel Filler Flap"], "Badge Bumper Front": [KEEP],
 "Bumper Front Grille": ["Bumper Front Lower Grille", "Bumper Front Upper Grille"], "Bulkhead Rear": [KEEP],
 "Suspension Rear Lateral Link": ["Suspension Rear Lateral Link LH", "Suspension Rear Lateral Link RH"],
 "Fender Badge LH": [KEEP], "Grille Panel/Headlamp Mask": [KEEP], "Headlamp Washer Jet LH": [KEEP], "Headlamp Washer Jet RH": [KEEP],
 "Sticker": [KEEP], "Tie Rod End Lhf,tie Rod Lhf": ["Steering Tie Rod End LH", "Steering Tie Rod LH"], "Radar Frt": [KEEP], "Body Kit": [KEEP],
 "Frt Lower Arm LH": ["Front Suspension Lower Arm LH", "Front LH Lower Arm"], "Cowl Panel Closing LH": [KEEP],
 "Tailgate Moulding Upper": [KEEP], "Badge Tailgate Lower": [KEEP], "Grille Front Moulding RH": ["Grille Front Moulding", "Grille Front RH"],
 "Air Conditioning Condenser": [KEEP], "Lamp Assembly Rear Lower LH": [KEEP, "Rear Lamp LH"], "Lamp Assembly Rear Lower RH": [KEEP, "Rear Lamp RH"],
 "Radiator Air Intake Guide": ["Radiator Air Deflector", KEEP], "Bumper Front Upper Retainer": [KEEP],
 "Bumper Rear Retainer Panel LH": [KEEP], "Bumper Rear Retainer Panel RH": [KEEP, "Bumper Rear Retainer Panel RH [larger Piece]"],
 "Rear Bumper Lower": ["Bumper Rear Lower Cover", "Rear Bumper"], "Subframe Assembly Rear": ["Subframe/Axle Rear"],
 "Fender Inner Side Gusset RH": [KEEP, "Fender Inner Reinforcement RH"],
}
for b in ["Tailgate Badge (SE)", "Tailgate Badge (ADVANCE)", "Tailgate Badge (EZI)", "Tailgate Badge (TOYOTA)", "Tailgate Badge (AVANZA)",
          "Tailgate Badge (EXORA BOLD)", "Boot Lid Badge (CIVIC)", "Boot Lid Badge (HONDA)", "Boot Lid Badge (DUAL VVT-I)", "Grille Badge (NISSAN)"]:
    FIX[b] = [KEEP]
def thumb(p):
    im = Image.open(p).convert("RGB"); im.thumbnail((420, 420)); b = io.BytesIO(); im.save(b, "JPEG", quality=72); return base64.b64encode(b.getvalue()).decode()
items = []
for r in M:
    s = [x for x in FIX.get(r["old"], r["sug"]) if x in (KEEP, MAKE) or x in UN]
    p = os.path.join(HERE, paths[r["i"]])
    items.append({"old": r["old"], "n": r["n"], "sug": s[:3], "img": "data:image/jpeg;base64," + thumb(p) if os.path.exists(p) else ""})
# 2026-11-10 user: new names on top. Any n5 train label not in names.json and not decided yet = a new item (suggest existing names:
# "mostly all got item name already, Merimen people just use different names for the same item").
import collections, difflib
DEC = json.load(open(os.path.join(HERE, "label_map100.json"))) if os.path.exists(os.path.join(HERE, "label_map100.json")) else {}
meta = [l.rstrip("\n").split("\t") for l in open(os.path.join(HERE, "big_meta_n5.tsv")) if l.strip()]
pn5 = open(os.path.join(HERE, "big_paths_n5.txt")).read().split("\n")
cnt = collections.Counter(r[0] for r in meta if len(r) > 3 and r[3] == "train"); first = {}
for i, r in enumerate(meta):
    if len(r) > 3 and r[3] == "train": first.setdefault(r[0], i)
low = {n.lower(): n for n in UN}; have = {x["old"] for x in items}
for lab, n in cnt.most_common():
    if not lab or lab in UN or lab in DEC or lab in have: continue
    sug = [low[lab.lower()]] if lab.lower() in low else []
    sug += [x for x in difflib.get_close_matches(lab, UN, 4, 0.6) if x not in sug]
    p = os.path.join(HERE, pn5[first[lab]])
    items.insert(0, {"old": lab, "n": n, "sug": (sug + [KEEP])[:3], "fresh": True, "img": "data:image/jpeg;base64," + thumb(p) if os.path.exists(p) else ""})
print("new items", sum(1 for x in items if x.get("fresh")))
tpl = open(os.path.join(HERE, "map100_template.html"), encoding="utf-8").read()
os.makedirs(os.path.join(HERE, "map100"), exist_ok=True)
open(os.path.join(HERE, "map100", "index.html"), "w", encoding="utf-8").write(tpl.replace("__DATA__", json.dumps(items, ensure_ascii=False)).replace("__NAMES__", json.dumps(UN, ensure_ascii=False)))
print("items", len(items), "no photo", sum(1 for x in items if not x["img"]))
