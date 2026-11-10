#!/usr/bin/env python3
"""Step 2 PRE-FILL (2026-11-10): match every final photo name to a catalogue item BEFORE the planning agents start, so they
only review the low-confidence names. OFFLINE: reads files, one Jev call per case, never touches Merimen / Chrome.
  BATCH_DIR=<batch_dir> python3 tools/step2/jev_prefill.py <PLATE> [<PLATE> ...]
Inputs (same as the planning agents, tools/step2/brief.md):
  ~/mrm-bot/s2/cat_<P>.json · B/report/final_<P>.json (+ extras_<P>.json) · model text from B/meta.json, B/data/<P>.json
  or ~/mrm-bot/cases_*.json.  --names-from-plan: take the names from ~/mrm-bot/s2/final_plan_<P>.json "coverage" (tests on old cases).
Output ~/mrm-bot/s2/prefill_<P>.json (or --out DIR):
  {"plate","model","sec","counts":{PREFILLED,REVIEW}, "rows":[{name, item_text, display, code, jev_pick, jev_conf, matcher_pick,
   agree, status, note, cand}]}
  status PREFILLED = Jev and the matcher (step2_plan SYN + partmatch + exact + group) agree AND jev_conf >= 0.8
  (code None = both say "no catalogue item" -> manual row with the photo name). Everything else REVIEW.
Design + numbers: typesafe/jev_catalog_test.py / .json (31 cases: agree & conf>=0.8 covers 50% of names, 98% right)."""
import ast, json, os, re, sys, glob, time, difflib, argparse
from concurrent.futures import ThreadPoolExecutor
REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
TS = os.path.join(REPO, "typesafe"); sys.path.insert(0, TS)
import partmatch as pm
from client import ask, answer
S2 = os.path.expanduser("~/mrm-bot/s2")
CONF = 0.8

# ---- matcher pieces from step2_plan.py / sync_check.py, read without running them (their behaviour is unchanged)
_ns = {"re": re}
for node in ast.parse(open(os.path.join(TS, "step2_plan.py")).read()).body:
    if (isinstance(node, ast.Assign) and getattr(node.targets[0], "id", "") in ("SYN", "SKIP", "GRP")) or \
       (isinstance(node, ast.FunctionDef) and node.name == "pref_group"):
        exec(compile(ast.Module([node], []), "s2p", "exec"), _ns)
SYN0, SKIP, pref_group = _ns["SYN"], _ns["SKIP"], _ns["pref_group"]
ALIAS = []
for node in ast.parse(open(os.path.join(REPO, "tools", "naming-desk", "sync_check.py")).read()).body:
    if isinstance(node, ast.Assign) and getattr(node.targets[0], "id", "") == "ALIAS": ALIAS = ast.literal_eval(node.value)

key = lambda l: re.sub(r"\s*\([A-Z0-9-]+\)$", "", re.sub(r"^\S+\s+\[.*?\]\s*", "", l)).strip()
pno = lambda v: v.split("@", 1)[1]
GN = {"10": "Front Panel", "20": "Bonnet & Engine", "30": "Front Fender & Susp LH", "110": "Front Fender & Susp RH", "40": "Front Door LH",
      "100": "Front Door RH", "50": "Rear Door LH", "90": "Rear Door RH", "60": "Rear Quarter & Susp LH", "80": "Rear Quarter & Susp RH",
      "70": "Rear Panel", "75": "Rear Compartment", "130": "Undercarriage"}

def fix_above(cat):
    """'- as above -' rows: label = the first real row with the same leading code + this row's [bracket] and part no."""
    first = {}
    for v, l in cat:
        if "as above" not in l.lower(): first.setdefault(l.split()[0], l)
    out = []
    for v, l in cat:
        if "as above" in l.lower() and l.split()[0] in first:
            br = re.search(r"\[.*?\]", l); base = first[l.split()[0]]
            l = re.sub(r"\[.*?\]", br.group(0) if br else "[All]", base, 1); l = re.sub(r"\([A-Z0-9-]+\)$", "(%s)" % pno(v), l)
        out.append((v, l))
    return out

def matcher(n, cat):
    syn = dict(SYN0)
    if not any(re.search(r"Spoiler Bumper Rear|Bumper Rear Spoiler", l, re.I) for _, l in cat): syn["Rear Bumper Spoiler"] = "Bumper Rear Lower Cover"
    q = syn.get(n, n)
    if q == "": return None
    m = pm.best(q, cat, True)
    ex = [(v, l) for v, l in cat if key(l).lower() == q.lower()]
    if ex: m = (ex[0][0], ex[0][1], 9)
    if not m: return None
    g = pref_group(n)
    if g and m[0].split("@")[0] != g:
        alt = [(v, l) for v, l in cat if v.split("@")[0] == g and key(l) == key(m[1])]
        if alt: m = (alt[0][0], alt[0][1], m[2])
    return m[0]

W = lambda s: re.findall(r"[a-z]+", s.lower().replace("wheelhouse", "wheel house").replace("trimboard", "trim board"))
def side(ws): return "lh" if "lh" in ws else "rh" if "rh" in ws else None
def fscore(name, lab):
    a, b = W(name), W(key(lab)); sa, sb = set(a) - {"lh", "rh"}, set(b) - {"lh", "rh"}
    j = len(sa & sb) / max(len(sa | sb), 1); r = difflib.SequenceMatcher(None, " ".join(sorted(sa)), " ".join(sorted(sb))).ratio()
    s = j + 0.3 * r; xa, xb = side(a), side(b)
    if xa and xb: s += 0.3 if xa == xb else -1
    for p, q in (("front", "rear"), ("rear", "front")):
        if p in a and q in b and p not in b: s -= 0.4
    return s
def topk(name, cat, k, extra=()):
    """fuzzy top-k on the name and its step2_plan SYN form + sync_check ALIAS hits + the matcher's / one-side pick."""
    g = pref_group(name); seen, out = {}, []; q = SYN0.get(name) or name
    al = [v for v, l in cat if any(re.search(p, name, re.I) and re.search(c, key(l), re.I) for p, c in ALIAS)]
    sc = lambda x: max(fscore(name, x[1]), fscore(q, x[1])) + (0.01 if x[0].split("@")[0] == g else 0) + (0.25 if x[0] in al else 0) + (0.5 if x[0] in extra else 0)
    for v, l in sorted(cat, key=lambda x: -sc(x)):
        if "as above" in l.lower() or pno(v) in seen: continue
        seen[pno(v)] = 1; out.append((v, l))
        if len(out) >= k: break
    return out

SW = {"LH": "RH", "RH": "LH"}
def nside(s): x = re.findall(r"\b(LH|RH)\b", s); return x[-1] if x else None
def swap(s): return re.sub(r"\b(LH|RH)\b", lambda m: SW[m.group(1)], s)
def one_side(name, cat):
    """Fixed rule: Merimen lists some parts that are the same on both sides under ONE side only (Tailgate Hinge RH, Boot Lid
    Hinge RH, Bonnet Support Strut RH). Photo side S has no item, the other side has exactly one -> that item (qty: agent)."""
    s = nside(name)
    if not s: return None
    q = SYN0.get(name) or name
    if any(nside(key(l)) == s and fscore(q, l) >= 1.2 for _, l in cat): return None
    m = pm.best(swap(q), cat, False)
    if not m or nside(key(m[1])) != SW[s] or fscore(swap(q), m[1]) < 1.2: return None
    if any(key(l) == swap(key(m[1])) for _, l in cat): return None          # the twin exists -> not a one-side item
    return m[0]

def lab_for(v, name, LV, lab):
    """label of value v for this photo: Merimen may list LH and RH rows under ONE value (same part no) -> take the photo's side."""
    s = nside(name)
    for l in LV.get(v, []):
        if s and nside(key(l)) == s: return l
    return lab[v]
def both_sides(v, LV):
    return {nside(key(l)) for l in LV.get(v, [])} >= {"LH", "RH"}

def model_text(P, B):
    if B:
        try:
            v = json.load(open(os.path.join(B, "meta.json"))).get(P)
            if v: return v if isinstance(v, str) else v.get("modelText", "")
        except (OSError, ValueError): pass
        try: return json.load(open(os.path.join(B, "data", P + ".json")))["case"]["veh"]["modelText"]
        except (OSError, ValueError, KeyError, TypeError): pass
    for f in sorted(glob.glob(os.path.expanduser("~/mrm-bot/cases_*.json")), key=os.path.getmtime, reverse=True):
        try:
            v = json.load(open(f)).get(P)
            if v: return v.get("veh", {}).get("modelText", "")
        except (OSError, ValueError, AttributeError): pass
    return ""

def names_of(P, B, from_plan):
    if from_plan:
        return list((json.load(open(os.path.join(S2, "final_plan_%s.json" % P))).get("coverage") or {}).keys())
    fin = os.path.join(B, "report", "final_%s.json" % P)
    out = [r.get("name", "") for r in json.load(open(fin))]
    xf = os.path.join(B, "report", "extras_%s.json" % P)
    if os.path.exists(xf): out += list(json.load(open(xf)))
    return out

RULES = ["Pick the item that is the SAME physical part as the photo name, even if worded differently "
         "(Rear Bumper = Bumper Rear Cover; Fender LH = Fender Front LH; Bracket = Retainer; Rear Lamp = Lamp Assembly Rear (tts); "
         "Quarter Panel = Quarter Panel Outer; Bonnet Lock = Bonnet Latch).",
         "LH/RH must agree. A side-less item is OK for an LH/RH name only when no sided item for that part exists.",
         "Front/Rear must agree. Never pick a different kind of part (Bumper is NOT Bumper Spoiler/Reinforcement; a trim/moulding is never a lamp; "
         "Fog Lamp is NOT Fog Lamp Finisher).",
         "Merimen often lists a part that is the same on both sides under ONE side only (e.g. only 'Tailgate Hinge RH', only "
         "'Boot Lid Hinge RH', only 'Bonnet Support Strut RH', or a side-less/[LH]/[RH] 'Bumper Rear Sensor'): if the catalogue has no "
         "item for the photo's side, pick that one item (it is used with qty 2).",
         "Known same-part pairs (user-confirmed): Headlamp Panel = Front Panel Radiator Support / Front Panel Support Panel; "
         "Front Crossmember = Front Panel Lower; Firewall Panel = Engine Partition Panel; Rear Panel Inner Trim = Rear Panel Garnish; "
         "Rear Wheelhouse = Wheel House Inner Rear / Wheel Arch Inner Rear; Fender Inner = Fender Front Inner (Upper/Reinforcement); "
         "Bumper Front Moulding = Bumper Front Finisher; Bumper Front Lower Grille = Grille Front Lower; Rear Exhaust Pipe = Exhaust Silencer; "
         "Rear Bumper Spoiler = Bumper Rear Lower Cover when no spoiler item exists; Quarter Panel = Quarter Panel Outer, on some cars Bodyside / Bodyside Rear Section; "
         "Wheel Rim LH/RH = Wheel Rim / Wheel Rim Alloy / Steel (side-less); Driveshaft RH = Driveshaft Front RH.",
         "The catalogue is for the car below: use its make/model/variant/body (e.g. hatchback = tailgate, sedan = boot lid; a variant "
         "without fog lamps / sensors has no such items).",
         "If no candidate is that part, answer __none__ (it becomes a manual row)."]

def run(P, A):
    t0 = time.time(); B = A.batch
    C = json.load(open(os.path.join(S2, "cat_%s.json" % P))); cat = fix_above([(v, l) for v, l, _ in C["cat"]]); lab = dict(cat)
    LV = {}
    for v, l in cat: LV.setdefault(v, []).append(l)
    seen, names = set(), []
    for n in names_of(P, B, A.names_from_plan):
        n = (n or "").strip()
        if not n or n in seen or re.search(SKIP, n) or re.match(r"(?i)(view|manual|misc|labour)\b", n): continue
        seen.add(n); names.append(n)
    car = model_text(P, B)
    rows = []
    for n in names:
        mt = matcher(n, cat); os_ = one_side(n, cat); note = ""
        if os_ and (not mt or nside(key(lab[mt])) != nside(n)):
            mt = os_; note = "one catalogue item for both sides (%s): use it for this side too; qty/comment = agent" % key(lab[os_])
        cand = topk(n, cat, A.k, extra=[x for x in (mt, os_) if x])
        rows.append({"name": n, "matcher_pick": mt, "note": note, "cand": [v for v, _ in cand]})
    resp, err = {}, ""
    if rows:
        st = {"task": "Match each damaged-part photo name to the item in the insurer's parts catalogue (Merimen, Malaysia) for THIS car.",
              "car": car or "unknown", "rules": RULES}
        qs = {}
        for i, r in enumerate(rows):
            crit = {re.sub(r"^\S+\s+", "", lab_for(v, r["name"], LV, lab)) + " {%s}" % v: "group %s %s" % (v.split("@")[0], GN.get(v.split("@")[0], "")) for v in r["cand"]}
            crit["__none__"] = "None of these is the same part -> manual row with the photo name."
            qs["q%d" % i] = {"type": "choice", "instructions": "Photo part name: '%s'. Which catalogue item is this part?" % r["name"], "criteria": crit}
        try: resp = ask(st, qs, timeout=120)
        except Exception as e: err = str(e)[:200]
    for i, r in enumerate(rows):
        v, c = answer(resp, "q%d" % i) if resp else (None, 0.0)
        m = re.search(r"\{(\d+@[^}]+)\}\s*$", str(v or ""))
        jv = m.group(1) if m else ("__none__" if v == "__none__" else None)
        mt = r["matcher_pick"]
        agree = bool(resp) and ((jv == "__none__" and mt is None) or (bool(jv) and jv != "__none__" and bool(mt) and pno(jv) == pno(mt)))
        code = (jv if jv and jv != "__none__" else None) if agree else None
        if code and both_sides(code, LV) and nside(r["name"]):
            r["note"] = (r["note"] + "; " if r["note"] else "") + "LH and RH rows share ONE catalogue value (%s): tick it once; qty/comment = agent" % pno(code)
        r.update({"jev_pick": jv, "jev_conf": round(float(c or 0), 3), "agree": agree,
                  "status": "PREFILLED" if agree and (c or 0) >= CONF else "REVIEW", "code": code,
                  "item_text": re.sub(r"^\S+\s+", "", lab_for(code, r["name"], LV, lab)) if code else ("MANUAL: " + r["name"] if agree else None),
                  "display": key(lab_for(code, r["name"], LV, lab)) if code else None})
        if r["status"] == "PREFILLED": r["cand"] = []          # agents need the candidates only on REVIEW rows
        else: r["cand"] = [re.sub(r"^\S+\s+", "", lab_for(x, r["name"], LV, lab)) + " {%s}" % x for x in r["cand"][:6]]
    order = ["name", "status", "code", "item_text", "display", "jev_pick", "jev_conf", "matcher_pick", "agree", "note", "cand"]
    rows = [{k: r.get(k) for k in order} for r in rows]
    cnt = {s: sum(r["status"] == s for r in rows) for s in ("PREFILLED", "REVIEW")}
    out = {"plate": P, "model": car, "sec": round(time.time() - t0, 1), "counts": cnt, "error": err, "rows": rows}
    os.makedirs(A.out, exist_ok=True)
    json.dump(out, open(os.path.join(A.out, "prefill_%s.json" % P), "w"), indent=1)
    return out

if __name__ == "__main__":
    ap = argparse.ArgumentParser(); ap.add_argument("plates", nargs="+"); ap.add_argument("--k", type=int, default=10)
    ap.add_argument("--out", default=S2); ap.add_argument("--names-from-plan", action="store_true")
    A = ap.parse_args(); A.batch = os.environ.get("BATCH_DIR", "")
    if not A.batch and not A.names_from_plan: sys.exit("set BATCH_DIR=<batch_dir> (final names in B/report/final_<P>.json)")
    def one(P):
        try: return run(P, A)
        except Exception as e: return {"plate": P, "error": "%s: %s" % (type(e).__name__, str(e)[:200])}
    with ThreadPoolExecutor(6) as ex:
        for o in ex.map(one, A.plates):
            if "rows" in o: print("%s: %d PREFILLED, %d REVIEW, %.1fs%s -> prefill_%s.json" % (o["plate"], o["counts"]["PREFILLED"], o["counts"]["REVIEW"], o["sec"], ("  JEV ERROR " + o["error"]) if o["error"] else "", o["plate"]))
            else: print("%s: FAILED %s" % (o["plate"], o["error"]))
