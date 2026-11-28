"""The shop's naming rules on the photo model's names: ONE copy, used by tools/naming-desk/naming.py build (owner's Mac) and by the
worker (worker/autopilot_worker/photos.apply_name_rules). Add a new rule here, not in either caller (2026-11-28).

rows: one dict per photo of a case, in shooting order: {"name": str, "conf": float, "alts": [str, ...]} (name and alts already
through case_report's first pick). apply_case changes them in place and returns a list of log lines.
"""
import json
import os
import re

FIX = {"ENGINEVIEW": "Engine Compartment", "FRT GENERAL VIEW": "Front View"}   # old training spellings (case_report.py)

# names a car model does NOT have (user rules, playbook 10): (model regex, name regex)
MODEL_BANS = [(r"\bViva\b", r"^Quarter Liner"),   # user 2026-10-29/30: Perodua Viva has no quarter liner
              (r"^PERODUA\b", r"^Front Panel Assembly$")]   # user 2026-11-04: Perodua never Front Panel Assembly
# (vehicle must NOT match, name regex, replacement): user 2026-11-03 — only Perodua has a Bonnet Latch Stud Plate; any other make -> Front Panel Assembly
MODEL_SWAPS = [(r"^PERODUA\b", r"^Bonnet Latch Stud Plate", "Front Panel Assembly"),
               (r"^PERODUA\b", r"^Fender Inner (LH|RH)$", "Front Panel Assembly")]   # user 2026-11-04: only Perodua has Fender Inner

# the badge brands and the Rear Lamp rule are also applied by the website (web/src/lib/photos/order-rules.ts) from
# playbook/photo-rules.json; read them from that same file (the worker image has its copy in autopilot_worker/playbook/)
_HERE = os.path.dirname(os.path.abspath(__file__))
_RULES_JSON = next((p for p in (os.path.join(_HERE, "..", "..", "playbook", "photo-rules.json"),
                                os.path.join(_HERE, "..", "..", "worker", "autopilot_worker", "playbook", "photo-rules.json"))
                    if os.path.isfile(p)), None)
if _RULES_JSON is None:
    raise ImportError("playbook/photo-rules.json not found")
_PR = json.load(open(_RULES_JSON, encoding="utf-8"))
_TWO_WORD = [b.split() for b in _PR["badge"]["twoWordBrands"]]
_LAMP_PLAIN, _LAMP_PAIR, _LAMP_UNSURE = _PR["rearLamp"]["plain"], _PR["rearLamp"]["pair"], float(_PR["rearLamp"]["unsure"])


def brand_of(vehicle):
    w = (vehicle or "").upper().split()
    return " ".join(w[:2]) if w[:2] in _TWO_WORD else (w[0] if w else "")


def pick(top, final):
    """case_report's first pick: the first of the model's names (best first) the naming rules allow, else the raw top-1; and up to two
    allowed alternatives from the next three."""
    name = next((n for n in (final(FIX.get(t, t)) for t in top) if n), None) or FIX.get(top[0], top[0])
    return name, alts_of(top, name, final)


def alts_of(top, name, final):
    """up to two allowed alternatives from the model's 2nd-4th names, other than name"""
    return [a for a in (final(FIX.get(t, t)) for t in top[1:4]) if a and a != name][:2]


def apply_case(rows, vehicle, norm, save=None):
    """norm = name_map.final (None = a banned name). Same order as naming.py build had it: model bans, model swaps, naming rules,
    logo badge, then the case-wide Rear Lamp Inner/Outer rule. save(): called at the points where naming.py build saved
    rows_<PLATE>.json (after bans when the car has any, after swaps that changed a name, after a Rear Lamp change)."""
    vehicle = vehicle or ""
    log = []
    save = save or (lambda: None)
    bans = [b for v, b in MODEL_BANS if re.search(v, vehicle, re.I)]
    if bans:   # names this car model does not have -> next alternative, marked unsure
        for r in rs_with_name(rows):
            if any(re.search(b, r["name"]) for b in bans):
                alt = next((a for a in r.get("alts", []) if a and not any(re.search(b, a) for b in bans)), None)
                if alt:
                    r["name"], r["conf"] = alt, min(r.get("conf", 0), 0.3)
        save()
    swapped = 0
    for notv, nm, rep in MODEL_SWAPS:
        if not re.search(notv, vehicle, re.I):
            for r in rs_with_name(rows):
                if re.search(nm, r["name"]):
                    r["name"] = rep
                    swapped += 1
                    log.append(f"model swap -> {rep}")
    if swapped:
        save()
    brand = brand_of(vehicle)
    for r in rs_with_name(rows):   # only names the naming rules allow (merged spelling, banned names dropped)
        n0 = norm(r["name"])
        if n0 is None:   # banned name (user "never use") -> first allowed alternative, marked unsure
            n0 = next((x for x in map(norm, r.get("alts", [])) if x), None)
            if n0:
                r["conf"] = min(r.get("conf", 0), 0.59)
                log.append(f"#{r.get('n', '?')}: banned {r['name']} -> {n0}")
        r["name"] = n0 or r["name"]
        if brand and r["name"].endswith("Badge (LOGO)"):   # playbook 11: a bare logo badge = the car's brand, in CAPITALS
            r["name"] = r["name"].replace("(LOGO)", "(" + brand + ")")
        r["alts"] = list(dict.fromkeys(n for n in map(norm, r.get("alts", [])) if n))
    # user 2026-11-03: a car with Rear Lamp Inner also has Rear Lamp Outer (and the other way round) -> plain "Rear Lamp LH/RH" becomes the missing one
    have = {m.group(1) for m in (re.match(_LAMP_PAIR, r["name"]) for r in rs_with_name(rows)) if m}
    if have:
        to = "Outer" if "Inner" in have else "Inner"
        changed = 0
        for r in rs_with_name(rows):
            m = re.match(_LAMP_PLAIN, r["name"])
            if m:
                r["name"], r["conf"] = f"Rear Lamp {to} {m.group(1)}", min(r.get("conf", 0), _LAMP_UNSURE)
                changed += 1
                log.append(f"plain Rear Lamp -> Rear Lamp {to}")
        if changed:
            save()
    return log


def rs_with_name(rows):
    return [r for r in rows if r.get("name")]
