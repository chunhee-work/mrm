#!/usr/bin/env python3
"""User idea 2026-10-16: which car model has which parts. From every training photo with a known vehicle,
count part names per body type (Sal/Hatch/SUV/MPV/…) and per make+model family -> vehicle_priors.json.
predict_case.py uses it as a soft prior (names a body/model never shows get pushed down, not banned)."""
import collections, json, os, re
HERE = os.path.dirname(os.path.abspath(__file__))
def family(v): return " ".join(re.sub(r"[/]", " ", v).upper().split()[:2])
def body(v):
    m = re.search(r"\b(Hatch|Sal|Sedan|SUV|MPV|Wagon|Pick ?Up|Van|Coupe|Lorry|Truck)", v, re.I)
    return {"sedan": "sal"}.get(m.group(1).lower().replace(" ", ""), m.group(1).lower().replace(" ", "")) if m else None
if __name__ == "__main__":
    V = {k: v for k, v in json.load(open(os.path.join(HERE, "lamp_models.json"))).items() if v and v != "-"}
    F, B, G = collections.defaultdict(collections.Counter), collections.defaultdict(collections.Counter), collections.Counter()
    for l in open(os.path.join(HERE, "big_meta.tsv")):
        lab, cid, seq, role = l.rstrip("\n").split("\t")
        if not lab or role == "test": continue
        G[lab] += 1
        if cid in V:
            F[family(V[cid])][lab] += 1
            if body(V[cid]): B[body(V[cid])][lab] += 1
    json.dump({"global": G, "family": {k: v for k, v in F.items() if sum(v.values()) >= 300},
               "body": {k: v for k, v in B.items() if sum(v.values()) >= 300}}, open(os.path.join(HERE, "vehicle_priors.json"), "w"))
    print("families", sum(1 for v in F.values() if sum(v.values()) >= 300), "bodies", sorted(B))
