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
"""
import glob, json, os, re, sys

VIEWS = re.compile(r"\b(view|compartment|odometer|road tax|interior|chassis no|engine no)\b", re.I)
SKIP = {"lh", "rh", "front", "rear", "assy", "assembly", "the", "of", "and"}


def words(s):
    return [w for w in re.findall(r"[a-z0-9]+", s.lower()) if w not in SKIP]


def side(s):
    m = re.findall(r"\b(LH|RH)\b", s)
    return m[-1] if m else None


# photo name -> catalogue wording (playbook 07 / 10). ONLY pairs the USER confirmed (user 2026-11-04: never add a pair on my own
# judgement — the PART NUMBER decides). An unconfirmed pair = check the part number first, never alias by name.
ALIAS = [
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
    (r"Headlamp Panel (LH|RH)", "Front Panel Radiator Support|Headlamp Panel|Headlamp Support"),   # batch 7 CEW7805
]
# kept by a rule even without its own photo (playbook 07 companions / suspension set)
KEEP = re.compile(r"Shock Absorber|Suspension Spring|Steering Tie Rod|Lower Arm|Wishbone|Crossmember|Subframe|Knuckle|Driveshaft|Stabiliser|"
                  r"Bumper Clips|Bumper Bracket|Number Plate|Bumper .*Sensor|Hinge|Lock|Striker|Weatherstrip|Liner|Wheel Hub|Wheel Centre|Badge \[FRT", re.I)


PARTWORDS = {"liner", "bracket", "moulding", "finisher", "trim", "lamp", "sensor", "support", "reinforcement", "inner", "upper",
             "lower", "extension", "cover", "clip", "clips", "seal", "weatherstrip", "hinge", "strut", "garnish", "spoiler", "suspension",
             "mounting", "retainer", "spring", "absorber", "guide", "rear", "front", "end", "plate", "section", "panel", "member", "wheelhouse", "house"}


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
    extra = set(words(row)) - set(words(name))
    if extra & PARTWORDS:
        return False
    s = side(name)
    return not s or not side(row) or side(row) == s


def main():
    ndir, plates = sys.argv[1], sys.argv[2:]
    plan = json.load(open(os.path.expanduser("~/mrm-bot/photoplan.json")))
    bad = 0
    for p in plates:
        names = {x[2] for x in plan[p]}
        eds = [json.load(open(f)) for f in glob.glob(f"{ndir}/{p}-*.json")]
        eds = [d for d in eds if d.get("model") != d.get("name")]
        R = json.load(open(os.path.expanduser(f"~/mrm-bot/state/rows_{p}_now.json")))
        rows = [r[0] for r in R]
        # qty-2 convention (playbook 08): ONE side's row with qty 2 + "LH & RH" comment covers both sides
        rows += [re.sub(r"\b(LH|RH)\b", lambda m: "RH" if m.group(1) == "LH" else "LH", r[0]) for r in R if str(r[1]).strip() == "2" and side(r[0])]
        try:  # misc ticks count too (Rear Number Plate -> "Number plate, rear")
            rows += ["Rear Number Plate" if "rear" in m.lower() else "Front Number Plate" for m in json.load(open(os.path.expanduser(f"~/mrm-bot/state/sel_{p}_now.json"))).get("CM", []) if "number plate" in m.lower()]
        except Exception:
            pass
        out = []
        # FULL=1 (user 2026-11-04 "check all the cases: any item with a photo but not selected"): every photo name, not only edits
        for new in sorted(names if os.environ.get("FULL") == "1" else {d["name"] for d in eds}):
            if VIEWS.search(new):
                continue
            if not any(matches(new, r) for r in rows):
                out.append(f"  ADD?    {new!r} has a photo but no estimate row")
        for old in sorted({d["model"] for d in eds if d["model"] not in names}):
            if VIEWS.search(old):
                continue
            hit = [r for r in rows if matches(old, r) and not any(matches(n, r) for n in names) and not KEEP.search(r)]
            if hit:
                out.append(f"  REMOVE? {old!r} no photo any more, still selected: {hit}")
        print(f"{p}: {'OK' if not out else str(len(out)) + ' to check'}")
        print("\n".join(out)) if out else None
        bad += len(out)
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
