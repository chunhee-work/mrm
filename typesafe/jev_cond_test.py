#!/usr/bin/env python3
"""2026-11-10 (user: test Jev on part conditions). Truth = the conditions in Merimen after the user's review
(~/mrm-bot/state/rows_<PLATE>_user.json, else rows_<PLATE>_now.json: [[part, qty, price, condition], ...]).
Compares our rules (estfill.mjs cond(), ported 1:1) with Jev (judgments.damage_conditions, part name only).
  python3 typesafe/jev_cond_test.py      -> prints accuracy, writes jev_cond_test.json"""
import json, os, re, sys, glob, time, collections
from concurrent.futures import ThreadPoolExecutor
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
from judgments import damage_conditions, CONDITIONS

RULES = [  # estfill.mjs cond(), same order
 (r"roof ?lining", "Broken"), (r"bumper.*retainer", "Bracket cracked"), (r"bracket", "Bracket cracked"),
 (r"weather sheeting|wheel hub|wheel bearing", "Necessary"), (r"weatherstrip|weather strip", "Cut"),
 (r"bumper.*sensor|sensor.*bumper", "Cut"), (r"mirror", "Broken"), (r"support strut|\bstrut\b", "Broken"),
 (r"windscreen|windshield", "Broken"), (r"centre guide|center guide", "Broken"), (r"spare wheel retainer", "Bent"),
 (r"spare wheel well|wheel well", "Broken"), (r"lock|striker|hinge", "Bent"), (r"lamp panel", "Bent"),
 (r"reinforcement", "Bent"), (r"liner", "Damage"),
 (r"reflector|fog lamp|lamp assembly|head ?lamp|signal lamp|tail ?lamp|\blamp\b", "Cracked"), (r"glass|window", "Cracked"),
 (r"sensor", "Necessary"), (r"clip|retainer|\bguide\b|nozzle|grommet|washer", "Necessary"),
 (r"trim|finisher|garnish|moulding|spoiler|skirt|extractor vent|\bvent\b|badge|emblem|grille|\bmask\b|valance|\bcover\b|cladding|\bflap\b|deflector", "Broken"),
 (r"rim|tyre|wheel", "Bent"), (r"absorber|control arm|tie rod|crossmember|drive ?shaft|stabilizer|\blink\b|knuckle", "Bent"),
 (r"panel|tailgate|boot ?lid|bonnet|fender|quarter|\bdoor\b|floor|wheelhouse|member|pillar|roof|firewall|apron|\bdeck\b|body side|support", "Bent"),
 (r"bumper", "Broken")]
def rule(n):
    n = (n or "").lower()
    for rx, c in RULES:
        if re.search(rx, n): return c
    return "Bent"

S = os.path.expanduser("~/mrm-bot/state"); files = {}
for f in sorted(glob.glob(os.path.join(S, "rows_*.json"))):
    m = re.match(r"rows_([A-Z0-9]+?)(_now|_user)?\.json$", os.path.basename(f))
    if not m: continue
    P, kind = m.group(1), m.group(2) or ""
    if kind == "_user" or P not in files or (kind == "_now" and not files[P][1] == "_user"): files[P] = (f, kind)
cases = {}
for P, (f, _) in files.items():
    try: rows = json.load(open(f))
    except Exception: continue
    rows = [r for r in rows if isinstance(r, list) and len(r) >= 4 and r[3] in CONDITIONS]
    if rows: cases[P] = rows

def one(item):
    P, rows = item; t0 = time.time()
    try: j = damage_conditions([(i, r[0]) for i, r in enumerate(rows)], "car", "")
    except Exception as e: return P, None, str(e)[:120], 0
    return P, j, None, time.time() - t0
out, errs, secs = [], [], []
with ThreadPoolExecutor(6) as ex:
    for P, j, e, dt in ex.map(one, cases.items()):
        if e: errs.append((P, e)); continue
        secs.append(dt)
        for i, r in enumerate(cases[P]):
            g = j[i]; out.append({"plate": P, "part": r[0], "truth": r[3], "rule": rule(r[0]), "jev": g["value"], "conf": g["confidence"], "auto": g["ok"]})
json.dump(out, open(os.path.join(HERE, "jev_cond_test.json"), "w"), indent=0, ensure_ascii=False)
n = len(out); pct = lambda a: "%d/%d (%.0f%%)" % (a, n, 100 * a / max(n, 1))
print("cases %d, part rows %d, errors %d" % (len(cases) - len(errs), n, len(errs)))
print("rules (estfill cond): %s" % pct(sum(x["rule"] == x["truth"] for x in out)))
print("Jev:                  %s   (Jev confident >=0.60: %d rows, right %d)" % (pct(sum(x["jev"] == x["truth"] for x in out)),
      sum(x["auto"] for x in out), sum(x["auto"] and x["jev"] == x["truth"] for x in out)))
hy = sum((x["jev"] if (x["auto"] and x["conf"] >= 0.80) else x["rule"]) == x["truth"] for x in out)
print("rules, Jev overrides only when conf >= 0.80: %s" % pct(hy))
print("Jev right where rule wrong: %d · Jev wrong where rule right: %d" % (
    sum(x["jev"] == x["truth"] and x["rule"] != x["truth"] for x in out), sum(x["rule"] == x["truth"] and x["jev"] != x["truth"] for x in out)))
bad = collections.Counter((x["part"], x["truth"], x["rule"]) for x in out if x["rule"] != x["truth"])
print("rule misses (top 12):"); [print("  ", k, v) for k, v in bad.most_common(12)]
if secs: print("Jev time per case: avg %.1f s" % (sum(secs) / len(secs)))
