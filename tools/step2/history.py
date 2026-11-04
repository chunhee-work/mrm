#!/usr/bin/env python3
"""Step 2 from history: what the planning agents ticked in past cases, keyed by the case's final photo names.

  python3 history.py eval                 # leave-one-out on every past case: draft (step2_plan) vs history vs both
  python3 history.py predict <PLATE>      # prints the history ticks for a case (needs s2/cat_<P>.json + its photo names)

Past cases = ~/mrm-bot/s2/final_plan_<P>.json (agent result) + s2/cat_<P>.json (catalogue) + names from ~/mrm-bot/photoplan.json.
Item key: catalogue description without the code / [group] / (part number); labour as "N:<label>" / "R:<label>".
"""
import glob, json, os, re, sys
from collections import defaultdict
H = os.path.expanduser("~/mrm-bot"); S2 = os.path.join(H, "s2")
PP = json.load(open(os.path.join(H, "photoplan.json")))
norm = lambda l: re.sub(r"\s*\([^)]*\)\s*$", "", re.sub(r"^\S+ \[[^\]]*\] ", "", l)).strip()


def case(p):
    C = json.load(open(os.path.join(S2, f"cat_{p}.json")))
    v2d = {v: norm(l) for v, l, _ in C["cat"]}
    avail = set(v2d.values()) | {"N:" + l for l, _ in C["labs"]} | {"R:" + l for l, _ in C["labs"]}
    names = {x[2] for x in PP.get(p, [])}
    def items(P):
        return {v2d[v] for v in P.get("CP", []) if v in v2d} | {"N:" + l for l in P.get("N", [])} | {"R:" + l for l in P.get("R", [])}
    fin = items(json.load(open(os.path.join(S2, f"final_plan_{p}.json")))) if os.path.exists(os.path.join(S2, f"final_plan_{p}.json")) else None
    dr = items(json.load(open(os.path.join(S2, f"tick_{p}.json")))) if os.path.exists(os.path.join(S2, f"tick_{p}.json")) else set()
    return {"avail": avail, "names": names, "final": fin, "draft": dr, "v2d": v2d}


def model(train):
    av = defaultdict(int); ch = defaultdict(int)
    for c in train:
        for n in c["names"]:
            for d in c["avail"]:
                av[(n, d)] += 1
            for d in c["final"]:
                ch[(n, d)] += 1
    return av, ch


def score(c, av, ch, minsup=2, lift=0.35):
    # a name counts only if it makes the item much more likely than its base rate (views/odometer photos are in every case)
    out = {}
    for d in c["avail"]:
        base = BASE.get(d, 0.0); best = 0.0
        for n in c["names"]:
            a = av.get((n, d), 0)
            if a >= minsup:
                r = ch.get((n, d), 0) / a
                if r - base >= lift:
                    best = max(best, r)
        out[d] = best
    return out


BASE = {}
def base_rates(train):
    a = defaultdict(int); k = defaultdict(int)
    for c in train:
        for d in c["avail"]:
            a[d] += 1
        for d in c["final"]:
            k[d] += 1
    BASE.clear(); BASE.update({d: k[d] / a[d] for d in a})


def prf(pred, gold):
    tp = len(pred & gold); return tp, len(pred - gold), len(gold - pred)


def main():
    plates = [os.path.basename(f)[11:-5] for f in glob.glob(os.path.join(S2, "final_plan_*.json"))]
    plates = [p for p in plates if os.path.exists(os.path.join(S2, f"cat_{p}.json")) and p in PP]
    C = {p: case(p) for p in plates}
    if sys.argv[1] == "eval":
        for th in (0.5, 0.6, 0.7, 0.8):
            agg = {"draft": [0, 0, 0], "hist": [0, 0, 0], "both": [0, 0, 0]}
            for p in plates:
                tr = [C[q] for q in plates if q != p]; base_rates(tr); av, ch = model(tr); sc = score(C[p], av, ch)
                hist = {d for d, s in sc.items() if s >= th}
                both = hist | {d for d in C[p]["draft"] if sc.get(d, 0) >= 0.2 or not any((n, d) in av for n in C[p]["names"])}
                for k, pr in (("draft", C[p]["draft"]), ("hist", hist), ("both", both)):
                    r = prf(pr, C[p]["final"]); agg[k] = [x + y for x, y in zip(agg[k], r)]
            print(f"threshold {th}: " + " | ".join(f"{k}: right {a} extra {b} missed {c}" for k, (a, b, c) in agg.items()))
        print(len(plates), "cases")
    else:
        p = sys.argv[2]; c = case(p); tr = [C[q] for q in plates if q != p]; base_rates(tr); av, ch = model(tr); sc = score(c, av, ch)
        for d, s in sorted(sc.items(), key=lambda x: -x[1]):
            if s >= 0.5:
                print(f"{s:.2f} {d}")


if __name__ == "__main__":
    main()
