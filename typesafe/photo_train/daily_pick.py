#!/usr/bin/env python3
"""2026-11-07 (user idea 7): every day 30 training photos the model is least sure about, rare parts first, for the user to confirm.
  python3 daily_pick.py apply <db_dir>   # read the page's db `daily` dump (ArtifactData list daily -> <db_dir>/daily/*.json) -> label_fixes_daily.json
  python3 daily_pick.py pick [N=30]      # choose the next N photos -> daily/index.html (publish it to the 🎯 每日确认台 URL)
Picks from pred_train_audit.jsonl (model scores of every train photo): the model gives the label < 0.7 (rare parts) or < 0.5 (others), skipping photos already decided (audits 5/6, daily decisions). Rarest parts first."""
import base64, collections, json, os, sys, glob, datetime
HERE = os.path.dirname(os.path.abspath(__file__)); FX = os.path.join(HERE, "label_fixes_daily.json")
fixes = json.load(open(FX)) if os.path.exists(FX) else {}
if sys.argv[1] == "apply":
    n = 0
    for f in glob.glob(os.path.join(sys.argv[2], "daily", "*.json")):
        d = json.load(open(f)); d = d.get("data", d)
        if d.get("i") is not None and d.get("choice"):
            fixes[str(d["i"])] = {"choice": d["choice"], "name": d.get("name", ""), "old": d.get("old", ""), "at": d.get("at")}; n += 1
    json.dump(fixes, open(FX, "w"), indent=0); print("decisions saved", n, "total", len(fixes)); sys.exit()
N = int(sys.argv[2]) if len(sys.argv) > 2 else 30
paths = open(os.path.join(HERE, "big_paths_n4.txt")).read().split("\n")
rare = {x["name"]: x["photos"] for x in json.load(open(os.path.join(HERE, "rare_lt100.json")))}
seen = {str(x["i"]) for x in json.load(open(os.path.join(HERE, "label_fixes_audit6.json")))} | {str(json.loads(l)["i"]) for l in open(os.path.join(HERE, "audit_suspects.json")).read().splitlines()[:0]}
try: seen |= {str(x["i"]) for x in json.load(open(os.path.join(HERE, "audit_suspects.json")))}
except Exception: pass
# 2026-11-09 (user: "I combined all the item names for you — use those names in every artifact"): every name shown = the
# CURRENT combined name (big_meta_n4 label = name_map.final + the user's merges); model answers are mapped the same way.
sys.path.insert(0, HERE); from name_map import final as _final
MER = json.load(open(os.path.join(HERE, "label_fixes_audit5.json"))).get("merges", {})
def cname(n):
    if not n: return ""
    n = MER.get(n, n); f = _final(n)
    return "" if f is None else MER.get(f, f)
UN = json.load(open(os.path.join(HERE, "..", "..", "tools", "naming-desk", "names.json"))); UN = set(UN if isinstance(UN, list) else UN.get("names", UN))   # the user's own name list
N4 = [l.rstrip("\n").split("\t") for l in open(os.path.join(HERE, "big_meta_n4.tsv")) if l.strip()]
CNT = collections.Counter(l.split("\t")[0] for l in open(os.path.join(HERE, "big_meta_n4.tsv")) if l.split("\t")[3].strip() == "train")
cand = []
for l in open(os.path.join(HERE, "pred_train_audit.jsonl")):
    o = json.loads(l); k = str(o["i"])
    cur = N4[o["i"]][0] if o["i"] < len(N4) else ""
    tops = [cname(t[0]) for t in o["top"]]
    tops = [t for t in tops if t in UN]
    if not cur or cur not in UN or N4[o["i"]][3] != "train" or (tops and tops[0] == cur):
        continue   # gone, or the name merge already agrees with the model -> nothing for the user to decide
    o = {**o, "label": cur, "top": [[t, 0] for t in dict.fromkeys(x for x in tops if x)]}
    lim = 0.7 if o["label"] in rare else 0.5   # rare parts: anything below 0.7; other parts: below 0.5
    if o["p_label"] < lim and k not in seen and k not in fixes and o["i"] < len(paths) and os.path.exists(os.path.join(HERE, paths[o["i"]])):
        cand.append((CNT.get(o["label"], 0), o["p_label"], o))
cand.sort(key=lambda x: (x[0], x[1]))
pick, per = [], collections.Counter()
for _, _, o in cand:
    if per[o["label"]] >= 3: continue      # at most 3 photos of one part per day
    pick.append(o); per[o["label"]] += 1
    if len(pick) >= N: break
names = sorted(UN)   # only the user's own names
items = []
for o in pick:
    b = base64.b64encode(open(os.path.join(HERE, paths[o["i"]]), "rb").read()).decode()
    items.append({"i": o["i"], "img": "data:image/jpeg;base64," + b, "label": o["label"], "top": [t[0] for t in o["top"]][:3], "photos": CNT.get(o["label"], 0)})
day = datetime.date.today().isoformat()
tpl = open(os.path.join(HERE, "daily_template.html"), encoding="utf-8").read()
html = tpl.replace("__DAY__", day).replace("__DATA__", json.dumps(items, ensure_ascii=False)).replace("__NAMES__", json.dumps(names, ensure_ascii=False))
os.makedirs(os.path.join(HERE, "daily"), exist_ok=True)
open(os.path.join(HERE, "daily", "index.html"), "w", encoding="utf-8").write(html)
print("picked", len(pick), "of", len(cand), "candidates; parts:", len(per), "->", os.path.join(HERE, "daily", "index.html"))
