#!/usr/bin/env python3
"""2026-11-10 (user: "jev is really good at decision fast and cheap, find the way to add it in, and test jev").
Tests Jev (TypeSafe) on two decisions we make in every case, against the real values of batches 3-9
(~/mrm-bot/cases_bN.json + report_bN.json = what went into Merimen and was checked by the user):
  1. model variant: Jev picks among pick_model.py's top 8 options (same candidates for both) vs pick_model's own pick
  2. loss description + collision type: Jev picks from the options seen in our reports, given impact area + at-fault kind
Prints accuracy + time per call; writes jev_test.json.   python3 typesafe/jev_test.py"""
import json, os, sys, time, glob
from concurrent.futures import ThreadPoolExecutor
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE); sys.path.insert(0, os.path.join(HERE, "..", "tools", "batch"))
from judgments import pick_model_variant, loss_description
import pick_model as PM
B = os.path.expanduser("~/mrm-bot")
OPTS = {}
for f in ("model_opts_sinar.json", "model_opts_sinar1.json"):
    for k, v in json.load(open(os.path.join(B, f))).items():
        if not k.startswith("__"): OPTS.setdefault(k, v)
cases, reps = {}, {}
for f in sorted(glob.glob(os.path.join(B, "cases_b*.json"))):
    cases.update(json.load(open(f)))
    reps.update(json.load(open(f.replace("cases_", "report_"))) if os.path.exists(f.replace("cases_", "report_")) else {})

def norm(t): return " ".join(t.upper().split())

# ---- 1. model variant
def one_model(item):
    P, c = item; v = c["veh"]; opts = [o for o in OPTS.get(v["make"], []) if o.get("v")]
    if not opts or not v.get("modelText"): return None
    cc = {"make": v["make"], "rcModel": v.get("rcModel", ""), "cc": v.get("cc", ""), "transmission": v.get("transmission", ""),
          "body": v.get("body", ""), "jpjReg": (reps.get(P, {}).get("veh") or {}).get("jpjReg", "") or v.get("regDate", ""), "year": v.get("year") or (reps.get(P, {}).get("veh") or {}).get("manYear", "")}
    sc = sorted(((PM.score(o, cc)[0], o["t"]) for o in opts), reverse=True)
    top8 = [t for s, t in sc[:8]]; mt = v["modelText"]; mt = mt[len(v["make"]):].strip() if mt.upper().startswith(v["make"].upper()) else mt; truth = norm(mt)
    pm = PM.pick({v["make"].upper(): opts}, cc); pm_t = pm.get("text") or (pm["top"][0][0] if pm.get("top") else "")
    t0 = time.time()
    try: r = pick_model_variant(top8, v.get("rcModel", ""), "", cc["jpjReg"], v.get("chassis", ""), v.get("cc", ""),
                                "year made %s, %s, %s, %s" % (v.get("year", ""), v.get("fuel", ""), v.get("transmission", ""), v.get("body", "")))
    except Exception as e: return {"plate": P, "task": "model", "error": str(e)[:150]}
    dt = time.time() - t0
    return {"plate": P, "task": "model", "truth": v["modelText"], "in_top8": truth in map(norm, top8), "pick_model": pm_t,
            "pick_model_ok": norm(pm_t) == truth, "jev": r["value"], "jev_ok": norm(str(r["value"])) == truth,
            "jev_conf": r["confidence"], "jev_auto": r["ok"], "sec": round(dt, 2)}

# ---- 2. loss description + collision type
LD = sorted({r["lossDescCat"] for r in reps.values() if r.get("lossDescCat")}); CT = sorted({r["collType"] for r in reps.values() if r.get("collType")})
def one_loss(item):
    P, r = item
    if not r.get("lossDescCat"): return None
    t0 = time.time()
    try: o = loss_description(LD, CT, "(not given: decide from the impact area and the at-fault vehicle kind)",
                              "impact on our vehicle: %s" % r.get("impact", ""), r.get("tpKind", "") or "car")
    except Exception as e: return {"plate": P, "task": "loss", "error": str(e)[:150]}
    dt = time.time() - t0
    return {"plate": P, "task": "loss", "impact": r.get("impact"), "truth": r["lossDescCat"], "jev": o["loss_desc"]["value"],
            "jev_ok": o["loss_desc"]["value"] == r["lossDescCat"], "ct_truth": r["collType"], "ct_jev": o["collision_type"]["value"],
            "ct_ok": o["collision_type"]["value"] == r["collType"], "sec": round(dt, 2)}

with ThreadPoolExecutor(6) as ex:
    M = [x for x in ex.map(one_model, cases.items()) if x]
    L = [x for x in ex.map(one_loss, reps.items()) if x]
json.dump({"model": M, "loss": L}, open(os.path.join(HERE, "jev_test.json"), "w"), indent=1, ensure_ascii=False)
def pct(a, n): return "%d/%d (%.0f%%)" % (a, n, 100 * a / max(n, 1))
m = [x for x in M if "error" not in x]; l = [x for x in L if "error" not in x]
print("MODEL VARIANT  cases %d (errors %d)  truth in top8: %s" % (len(m), len(M) - len(m), pct(sum(x["in_top8"] for x in m), len(m))))
print("  pick_model.py: %s   Jev: %s   Jev auto (conf>=0.70): %d, of which right %d" % (
    pct(sum(x["pick_model_ok"] for x in m), len(m)), pct(sum(x["jev_ok"] for x in m), len(m)),
    sum(x["jev_auto"] for x in m), sum(x["jev_auto"] and x["jev_ok"] for x in m)))
print("  Jev right where pick_model wrong: %d   Jev wrong where pick_model right: %d" % (
    sum(x["jev_ok"] and not x["pick_model_ok"] for x in m), sum(x["pick_model_ok"] and not x["jev_ok"] for x in m)))
print("LOSS DESC  cases %d (errors %d)  Jev loss desc: %s   collision type: %s" % (
    len(l), len(L) - len(l), pct(sum(x["jev_ok"] for x in l), len(l)), pct(sum(x["ct_ok"] for x in l), len(l))))
s = [x["sec"] for x in m + l]
if s: print("Jev time per call: avg %.1f s, max %.1f s" % (sum(s) / len(s), max(s)))
