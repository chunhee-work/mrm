"""The two-way check between the photo names and Select Parts (playbook 07 "Rule 1", tools/naming-desk/sync_check.py, MUST after every re-sync).

  ADD?    a photo name (or a part added with Space) with no estimate row           -> tick it / add a manual row
  REMOVE? a name the adjuster changed that is still ticked and no photo carries any more -> untick it (unless a companion rule keeps it)

Pure and offline. The Mac script can also ask Jev when a pair is undecided; here an undecided pair counts as NOT the same part, so a
real miss is never hidden (it can only add a line to check, never clear one). Only pairs the owner confirmed are aliased (ALIAS)."""

from __future__ import annotations

import re

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
KEEP = re.compile(r"Bumper Reinforcement|Shock Absorber|Suspension Spring|Steering Tie Rod|Lower Arm|Wishbone|Crossmember|Subframe|Knuckle|Driveshaft|Stabiliser|"
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



TOK = lambda s: set(re.findall(r"[a-z]+", re.sub(r"\[[^\]]*\]?|\([^)]*\)", " ", s.lower()))) - {"assy", "assembly", "cover", "tts", "the", "of"}
AXES = [("front", "rear"), ("inner", "outer"), ("upper", "lower")]
POS = {"front", "rear", "inner", "outer", "upper", "lower", "lh", "rh"}

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




def undecided_pairs(names, rows) -> list[tuple[str, str, str]]:
    """(photo name, row, qty) pairs the code rules cannot decide: the only ones Jev is asked about."""
    out = []
    for n in sorted(set(names)):
        if VIEWS.search(n):
            continue
        for r, q in rows:
            q = str(q).strip()
            if not matches(n, r) and gate_rule(n, r, q) is None:
                out.append((n, r, q))
    return out


def two_way(names: list[str], rows: list[tuple[str, str]], changed_from: list[str] = (), jev=None, case_id: str | None = None) -> dict:
    """names: every final photo name plus the Space parts. rows: (estimate row label, qty) as Select Parts holds them now.
    changed_from: the model's names that the adjuster changed (corrections): they must not be left ticked.
    Returns {"add": [...], "remove": [...], "ok": bool}."""
    names_set = set(names)
    rq = [(r, str(q).strip()) for r, q in rows]
    # Jev (owner 2026-11-10): may only CLEAR a false ADD?/REMOVE?, never add one. Off or any error: the code rules alone ("jev off").
    cleared: set = set()
    shown: list = []
    note = "jev off"
    if jev is not None:
        try:
            from .jev import THRESHOLD
            pairs = undecided_pairs(set(names_set) | set(changed_from), rq)
            probs = jev.same_parts(pairs, case_id=case_id)
            hits = {k: p for k, p in probs.items() if p >= THRESHOLD}
            per_name: dict[str, int] = {}
            for (n, _r, _q) in hits:
                per_name[n] = per_name.get(n, 0) + 1
            # a name is cleared only when exactly ONE row scored high: with several, a false clear is likelier than the owner's test measured
            cleared = {k for k in hits if per_name[k[0]] == 1}
            shown = [f"{n} = {r} ({hits[(n, r, q)]:.2f})" for (n, r, q) in sorted(cleared)][:30]
            note = f"jev checked {len(pairs)} pairs, cleared {len(cleared)}"
        except Exception as e:  # noqa: BLE001
            note = f"jev off ({type(e).__name__})"
    flipped = [re.sub(r"\b(LH|RH)\b", lambda m: "RH" if m.group(1) == "LH" else "LH", r) for r, q in rq if q == "2" and side(r)]
    old_rows = [r for r, _ in rq] + flipped  # qty 2 (playbook 08): the other side is covered too

    def same(n: str, r: str, use_jev: bool = True) -> bool:
        if matches(n, r):
            return True
        q = next((q for rr, q in rq if rr == r), "1")
        return gate_rule(n, r, q) is True or (use_jev and (n, r, q) in cleared)

    add = [f"{n!r} has a photo but no estimate row" for n in sorted(names_set) if not VIEWS.search(n) and not any(same(n, r) for r in old_rows)]
    remove = []
    for old in sorted(set(changed_from) - names_set):
        if VIEWS.search(old):
            continue
        # Jev may only clear: the old name counts as ticked by the code rules alone, so Jev can never create a REMOVE?
        hit = [r for r in old_rows if same(old, r, False) and not any(same(n, r) for n in names_set) and not KEEP.search(r)]
        if hit:
            remove.append(f"{old!r} no photo any more, still selected: {hit}")
    return {"add": add, "remove": remove, "ok": not add and not remove, "jev": note, "jev_cleared": shown}
