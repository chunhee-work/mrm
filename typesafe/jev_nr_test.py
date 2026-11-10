#!/usr/bin/env python3
"""2026-11-10: Jev on Labour N (replace) vs R (repair) per labour panel. Truth = ~/mrm-bot/s2/final_plan_<P>.json (applied plans).
Jev sees: impact area, the full list of labour labels in the case, and decides N/R for each label. python3 typesafe/jev_nr_test.py"""
import json, os, sys, glob, time
from concurrent.futures import ThreadPoolExecutor
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
from client import ask, answer
B = os.path.expanduser("~/mrm-bot"); reps = {}
for f in glob.glob(os.path.join(B, "report_b*.json")): reps.update(json.load(open(f)))
def one(f):
    P = os.path.basename(f)[11:-5]; d = json.load(open(f)); N, R = d.get("N", []), d.get("R", [])
    labs = N + R
    if len(labs) < 2: return None
    st = {"impact_area_on_our_vehicle": (reps.get(P) or {}).get("impact", "unknown"), "labour_labels_in_this_estimate": labs,
          "rules": ("N = the part is REPLACED with a new one, or an R&R (remove & refit) job. R = the panel is REPAIRED in place "
                    "(neighbouring, inner or structural panels, glass removed/refitted). Outer panels at the point of impact are usually N; "
                    "inner structure behind them, chassis members, pillars, firewall are usually R.")}
    qs = {"q%d" % i: {"type": "choice", "instructions": "Labour label '%s': N or R?" % l, "criteria": {"N": "replaced / R&R job", "R": "repaired in place"}} for i, l in enumerate(labs)}
    t0 = time.time()
    try: r = ask(st, qs)
    except Exception as e: return {"plate": P, "error": str(e)[:100]}
    out = []
    for i, l in enumerate(labs):
        v, c = answer(r, "q%d" % i); out.append({"label": l, "truth": "N" if i < len(N) else "R", "jev": v, "conf": c})
    return {"plate": P, "rows": out, "sec": time.time() - t0}
with ThreadPoolExecutor(6) as ex: res = [x for x in ex.map(one, glob.glob(os.path.join(B, "s2", "final_plan_*.json"))) if x]
rows = [r for x in res if "rows" in x for r in x["rows"]]; n = len(rows)
ok = sum(r["jev"] == r["truth"] for r in rows); conf = [r for r in rows if r["conf"] >= 0.8]
print("cases %d, labels %d, Jev N/R right %d (%.0f%%); conf>=0.8: %d rows, right %d" % (len(res), n, ok, 100 * ok / max(n, 1), len(conf), sum(r["jev"] == r["truth"] for r in conf)))
base = sum(("R" if any(k in r["label"].lower() for k in ("inner", "member", "pillar", "reinforcement", "firewall", "glass", "closing", "support")) else "N") == r["truth"] for r in rows)
print("simple keyword baseline: %d (%.0f%%)" % (base, 100 * base / max(n, 1)))
print("avg sec/case %.1f" % (sum(x.get("sec", 0) for x in res) / max(len(res), 1)))
json.dump(res, open(os.path.join(HERE, "jev_nr_test.json"), "w"), indent=0)
