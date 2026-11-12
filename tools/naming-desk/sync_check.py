#!/usr/bin/env python3
"""Two-way check after the user edits the 照片命名台 (user 2026-10-23, MUST run every re-sync).

usage: python3 sync_check.py <names_dir> <PLATE> [<PLATE> ...]
  names_dir = ArtifactData `names` dump (out_dir/names/*.json)
  reads ~/mrm-bot/photoplan.json (current photo labels) and
        ~/mrm-bot/state/rows_<PLATE>_now.json (rows.mjs on dsp_details, run it first)

Prints, per case:
  ADD?    a renamed photo's NEW name with no matching estimate row  -> select / add it
  REMOVE? an OLD name no photo carries any more, still in the rows -> untick / delrow it
          (unless a companion / suspension-set rule still needs it: say why in the report)
Exit code 1 when anything is listed.
"Same part?" = old matches() OR gate_rule() True OR Jev >= 0.6 (typesafe/client.py, one call per plate): Jev only clears false
alarms, never adds one (its scores move between runs). JEV=0 or Jev error -> matches() only ("jev off").
"""
import glob, json, os, re, sys

VIEWS = re.compile(r"\b(view|compartment|odometer|road tax|interior|chassis no|engine no|chassis number|engine number|tyre (?:brand|size))\b", re.I)
SKIP = {"lh", "rh", "front", "rear", "assy", "assembly", "the", "of", "and"}


def words(s):
    return [w for w in re.findall(r"[a-z0-9]+", s.lower()) if w not in SKIP]


def side(s):
    m = re.findall(r"\b(LH|RH)\b", s)
    if len(set(m)) > 1:   # 2026-11-10: "Shock Absorber Front [Both LH/RH]" covers both sides, was read as RH-only
        return None
    return m[-1] if m else None


# photo name -> catalogue wording (playbook 07 / 10). ONLY pairs the USER confirmed (user 2026-11-04: never add a pair on my own
# judgement — the PART NUMBER decides). An unconfirmed pair = check the part number first, never alias by name.
ALIAS = [
    (r"^Rear Panel$", "Rear Panel Lower|Rear Panel Assembly|Rear Panel$"),   # 2026-11-12 TCH1133/VGL7278 Yaris: the only rear panel part is Rear Panel Lower (58307)
    (r"Boot Floor", "Spare Wheel Well|Boot Floor"),   # 2026-11-12 QS8472K/TCH1133: Honda 04655 / Toyota 58311 = rear floor pan, catalogue calls it Spare Wheel Well
    (r"Floor Panel", "Floor Pan Front|Floor Panel"),   # user 2026-11-11 TBH3142: cabin floor = Floor Pan Front (58111), not Boot Floor
    (r"Fender Inner (LH|RH)", "Fender Front Inner|Fender Inner"),   # 2026-11-11: playbook 07 pair rule (Fender Front Inner / Inner Upper / Inner Reinforcement)
    (r"Quarter Panel (LH|RH)", "Bodyside"),   # 2026-11-11 TBH3142 Viva: playbook 10 (quarter outer = Bodyside LH/RH, 61112)
    (r"Rear Bumper Reflector", "Reflector Rear|Rear Bumper Reflector"),   # 2026-11-11 TBH3142 Viva (single side-less value, comment = side)
    (r"Rear Door Tread Plate", "Runningboard Panel Tread Plate Rear|Rear Door Tread Plate"),   # 2026-11-11 TBH3142 (67918 = rear door scuff plate)
    (r"Door Rear Aperture Weatherstrip", "Dr Aperture Trim Finisher Rear|Door Rear Aperture Weatherstrip"),   # 2026-11-11 TBH3142 (62333 = rear door opening trim)
    (r"Bonnet Lock", "Bonnet Latch|Bonnet Lock"),
    (r"Bumper Front Moulding", "Bumper Front Finisher|Bumper Front Moulding"),   # user 2026-10-30 (PRY826)
    (r"Fender Inner Wheelhouse (LH|RH)", "Fender Front Inner Support Panel|Fender Inner Wheelhouse"),   # user 2026-10-30 (PRY826)   # user 2026-10-30: Bonnet Latch RH IS the bonnet lock
    (r"(Boot Lid|Tailgate|Grille(?: Front)?) Badge \(.*\)", "Badge|Emblem"),
    (r"Rear Panel Inner Trim", "Rear Panel Garnish|Rear Panel Inner Trim"),
    (r"(Front|Rear) Wheelhouse", "Wheel House"),
    (r"Rear Bumper Spoiler", "Bumper Rear Lower Cover|Spoiler Bumper Rear|Rear Bumper Spoiler"),
    (r"(Front|Rear) Bumper Sensor", "Bumper Sensor|Bumper (Front|Rear) Sensor"),
    (r"Suspension Lower Arm", "Lower Arm|Wishbone Lower|Suspension Arm"),
    (r"Wheel Arc Finisher", "Wheel Arch"),
    (r"Rear Lamp (Outer )?(LH|RH)", "Lamp Assembly Rear"),
    (r"Door (Front|Rear) Window", "Door Glass"),
    (r"Rear Bumper Bracket (Side|Upper)", "Bumper Bracket Rear|Bumper Rear Retainer|Bumper Retainer Rear|Bumper Rear Bracket"),
    (r"Rear Wheelhouse (LH|RH)", "Wheel Arch Inner Rear|Wheel House"),   # user 2026-11-04: same part by part number (Mazda 70-15X / 71-15X)
    (r"Rear Exhaust Pipe", "Exhaust Silencer|Rear Exhaust Pipe|Exhaust Tailpipe"),   # user round 3 (3345273): Exhaust Silencer -> Rear Exhaust Pipe
    (r"Bumper Front Lower Grille", "Grille Front Lower|Bumper Front Lower Grille"),   # user 2026-11-04 (JSF901): same part
    (r"Firewall Panel", "Engine Partition Panel|Firewall Panel"),   # user 2026-11-04 (VAW8266): same part
    (r"Front Bumper Bracket", "Bumper Bracket Front|Bumper Front Bracket|Bumper Front Retainer|Bumper Front Side Retainer"),
    # word order / spelling only, same part (2026-11-04 audit, each checked against the case rows)
    (r"^(Front|Rear) Bumper$", "Bumper (Front|Rear) Cover|Bumper (Front|Rear)$"),
    (r"^(Front|Rear) Bumper (LH|RH)$", "Bumper (Front|Rear) Cover"),
    (r"Front Bumper Fog Lamp (LH|RH)$", "Fog Lamp Front|Bumper Front Fog Lamp (LH|RH)"),
    (r"Quarter Liner", "Quarter Panel Liner|Quarter Liner"),
    (r"(Front|Rear) Bumper Reinforcement", "Bumper (Front|Rear) Reinforcement"),
    (r"Windscreen Washer Tank", "Washer Tank"),
    (r"Door (Front|Rear) Trimboard", "Door Trim Board"),
    (r"Door (Front|Rear) Hinge (Upper|Lower)", "Door (Front|Rear) Hinge"),
    (r"(Front|Rear) Chassis Member", "Chassis Member (Front|Rear)"),
    (r"Runningboard Spoiler (LH|RH)", "Spoiler Runningboard|Runningboard Spoiler"),   # user round 5 merge (Side Skirt -> Runningboard Spoiler)
    (r"Rear Bumper Bracket Side", "Bumper Rear Mounting Bracket|Bumper Rear Side Bracket|Bumper Bracket Rear"),
    (r"Headlamp Panel (LH|RH)", "Front Panel Radiator Support|Headlamp Panel|Headlamp Support"),   # batch 7 CEW7805
]
# kept by a rule even without its own photo (playbook 07 companions / suspension set)
KEEP = re.compile(r"Shock Absorber|Suspension Spring|Steering Tie Rod|Lower Arm|Wishbone|Crossmember|Subframe|Knuckle|Driveshaft|Stabiliser|"
                  r"Bumper Clips|Bumper Bracket|Number Plate|Bumper .*Sensor|Hinge|Lock|Striker|Weatherstrip|Liner|Wheel Hub|Wheel Centre|Badge \[FRT", re.I)


PARTWORDS = {"liner", "bracket", "moulding", "finisher", "trim", "lamp", "sensor", "support", "reinforcement", "inner", "upper",
             "lower", "extension", "clip", "clips", "seal", "weatherstrip", "hinge", "strut", "garnish", "spoiler", "suspension",
             "mounting", "retainer", "spring", "absorber", "guide"}


def matches(name, row):
    for pat, cat in ALIAS:
        if re.search(pat, name, re.I) and re.search(cat, row, re.I):
            s = side(name)
            if not s or not side(row) or side(row) == s:
                return True
    w = words(name)
    r = row.lower()
    if not w or not all(x in r for x in w[:3]):
        return False
    # 2026-11-04 audit: a row with an EXTRA part word is a different part (Quarter Panel != Quarter Panel Liner,
    # Fender != Fender Liner, Front Crossmember != Suspension Crossmember Rear) -> these false matches hid real misses
    extra = set(words(re.sub(r"\[[^\]]*\]?", "", row))) - set(words(name))   # [..] notes are not part words
    if extra & PARTWORDS:
        return False
    s = side(name)
    return not s or not side(row) or side(row) == s


# ---- Jev "same part?" (2026-11-10, tested in typesafe/jev_sync_test.py: gated@0.6 = 97.9% pair accuracy vs 80.6% for matches()).
# Certain cases decided by gate_rule(); only the rest go to Jev, ONE call per plate. Jev off / error -> matches() as before.
JEV_TH = 0.7   # 2026-11-10: 0.6 sometimes hid real misses (Cowl Panel 0.66, Quarter Panel RH 0.64)
TOK = lambda s: set(re.findall(r"[a-z]+", re.sub(r"\[[^\]]*\]?|\([^)]*\)", " ", s.lower()))) - {"assy", "assembly", "cover", "tts", "the", "of"}
AXES = [("front", "rear"), ("inner", "outer"), ("upper", "lower")]
POS = {"front", "rear", "inner", "outer", "upper", "lower", "lh", "rh"}
CHUNK = 150   # pairs per Jev request (one request per plate; >150 split, in parallel: HTTP 400 max_tokens_exceeded at ~750)
RULES = ("Decide if an estimate row and a photo item are the SAME physical part (same part number), not a neighbouring, "
         "attached or companion part. Different parts: Front vs Rear; LH vs RH; a panel vs its liner, trim, inner, "
         "reinforcement, bracket, moulding, lamp, lock, hinge, striker, badge or handle; a bumper vs its sensor, "
         "bracket, clips or holder; a number plate vs a number plate holder or lamp. Same part: catalogue wording or "
         "word order differs but it is the same piece (e.g. Bonnet Lock = Bonnet Latch; Bumper Front Moulding = Bumper "
         "Front Finisher; Fender Inner Wheelhouse = Fender Front Inner Support Panel; Rear Wheelhouse = Wheel Arch Inner "
         "Rear; Headlamp Panel = Front Panel Radiator Support; Rear Bumper = Bumper Rear Cover; Firewall Panel = Engine "
         "Partition Panel; Rear Bumper Bracket Side = Bumper Rear Retainer). A row whose side is LH but qty is 2, or "
         "whose text says [LH & RH] / [Both LH/RH] / [RH/LH], covers BOTH sides.")


def both_sides(row, qty):
    return str(qty).strip() == "2" or bool(re.search(r"\bLH\b.*\bRH|\bRH\b.*\bLH|LHF|RHF|LHR|RHR|both", row, re.I))


def gate_rule(name, row, qty):
    """True / False when certain, None = ask Jev (copy of typesafe/jev_sync_test.py gate_rule)."""
    n, r = TOK(name), TOK(row)
    sn, sr = side(name), side(row)
    if sn and sr and sn != sr and not both_sides(row, qty): return False
    if any((a in n and b in r and a not in r) or (b in n and a in r and b not in r) for a, b in AXES): return False
    if not (n - {"lh", "rh"}) & (r - {"lh", "rh"}): return False
    if ("liner" in n) != ("liner" in r): return False
    if n - {"lh", "rh"} == r - {"lh", "rh"}:
        bn, br = re.findall(r"\[([^\]]*)", name), re.findall(r"\[([^\]]*)", row)
        return not (bn and br and bn != br)
    return None


def jev_ask(pairs):
    """{(name,row,qty): prob} for the undecided pairs, one Jev call. Raises on any error."""
    if not pairs:
        return {}
    sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "typesafe"))
    from client import ask
    from concurrent.futures import ThreadPoolExecutor

    def one(ch):
        st = {"rules": RULES, "pairs": {f"q{i}": {"photo_item": n, "estimate_row": r, "row_qty": q} for i, (n, r, q) in enumerate(ch)}}
        qs = {f"q{i}": {"type": "noul", "instructions": f"pairs.q{i}: is estimate row '{r}' (qty {q}) the SAME part as photo item '{n}'?"}
              for i, (n, r, q) in enumerate(ch)}
        A = ask(st, qs, timeout=120).get("answers") or {}
        out = {}
        for i, k in enumerate(ch):
            v = (A.get(f"q{i}") or {}).get("noul")   # client.answer() does not read "noul"
            if v is None:
                raise RuntimeError(f"no noul for q{i}")
            out[k] = float(v)
        return out

    chunks = [pairs[i:i + CHUNK] for i in range(0, len(pairs), CHUNK)]
    res = {}
    with ThreadPoolExecutor(len(chunks)) as ex:
        for d in ex.map(one, chunks):
            res.update(d)
    return res


def main():
    ndir, plates = sys.argv[1], sys.argv[2:]
    plan = json.load(open(os.path.expanduser("~/mrm-bot/photoplan.json")))
    use_jev = os.environ.get("JEV", "1") != "0"
    bad = 0
    for p in plates:
        names = {x[2] for x in plan[p]}
        xf = os.path.join(os.environ.get("BATCH_DIR", ""), "report", f"extras_{p}.json")   # Space-added parts (no photo) must be on the estimate too
        if os.path.exists(xf):
            names |= set(json.load(open(xf)))
        eds = [json.load(open(f)) for f in glob.glob(f"{ndir}/{p}-*.json")]
        eds = [d for d in eds if d.get("model") != d.get("name")]
        R = json.load(open(os.path.expanduser(f"~/mrm-bot/state/rows_{p}_now.json")))
        RQ = [(r[0], str(r[1]).strip()) for r in R]   # (row, qty): qty-2 / [LH & RH] handled by both_sides()
        try:  # misc ticks count too (Rear Number Plate -> "Number plate, rear")
            RQ += [("Rear Number Plate" if "rear" in m.lower() else "Front Number Plate", "1") for m in json.load(open(os.path.expanduser(f"~/mrm-bot/state/sel_{p}_now.json"))).get("CM", []) if "number plate" in m.lower()]
        except Exception:
            pass
        rows = [r for r, _ in RQ]
        # old path only (JEV=0 / Jev off): qty-2 convention (playbook 08) as flipped copies
        old_rows = rows + [re.sub(r"\b(LH|RH)\b", lambda m: "RH" if m.group(1) == "LH" else "LH", r[0]) for r in R if str(r[1]).strip() == "2" and side(r[0])]
        # FULL=1 (user 2026-11-04 "check all the cases: any item with a photo but not selected"): every photo name, not only edits
        add_names = sorted(n for n in (names if os.environ.get("FULL") == "1" else {d["name"] for d in eds}) if not VIEWS.search(n))
        old_names = sorted(o for o in {d["model"] for d in eds if d["model"] not in names} if not VIEWS.search(o))
        dec = None
        if use_jev:
            try:
                ask_names = set(add_names) | set(old_names) | (names if old_names else set())
                g = {(n, r, q): gate_rule(n, r, q) for n in ask_names for r, q in RQ}
                done = {n for (n, r, q), v in g.items() if v} | {n for n in ask_names if any(matches(n, r) for r in old_rows)}   # already covered
                orows = {(r, q) for (n, r, q), v in g.items() if n in old_names and v is not False}
                for k, v in g.items():   # only words like Front/LH in common (and no user ALIAS pair) -> different part
                    if v is None and not ((TOK(k[0]) - POS) & (TOK(k[1]) - POS) or any(re.search(a, k[0], re.I) and re.search(c, k[1], re.I) for a, c in ALIAS)):
                        g[k] = False
                need = [k for k, v in g.items() if v is None and (k[0] not in done or k[0] in old_names or k[1:] in orows)]
                pr = jev_ask(need)
                dec = {k: (v if v is not None else pr.get(k, 0.0) >= JEV_TH) for k, v in g.items()}
            except Exception:
                print("jev off")
                dec, use_jev = None, False   # once per run, rest of the plates on matches()
        # 2026-11-10 (coordinator): Jev can only CLEAR a false alarm, never raise a new one -> old matches() OR gate True OR Jev >= 0.6
        yes = {(n, r) for (n, r, q), v in (dec or {}).items() if v}
        same = lambda n, r: matches(n, r) or (n, r) in yes
        cov = lambda n: any(same(n, r) for r in old_rows)
        rem = lambda o: [r for r in old_rows if same(o, r) and not any(same(n, r) for n in names) and not KEEP.search(r)]
        out = []
        for new in add_names:
            if not cov(new):
                out.append(f"  ADD?    {new!r} has a photo but no estimate row")
        for old in old_names:
            hit = rem(old)
            if hit:
                out.append(f"  REMOVE? {old!r} no photo any more, still selected: {hit}")
        print(f"{p}: {'OK' if not out else str(len(out)) + ' to check'}")
        print("\n".join(out)) if out else None
        bad += len(out)
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
