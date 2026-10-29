#!/usr/bin/env python3
"""Step 2 plan from photo names (+ rules in memory/estimate-select-parts-rules-2026-10-17.md).
  python3 step2_plan.py <cat.json from selcat2.mjs> <rows.json> <impact> <out tick.json> <out add.json>
Prints matched / companion / missing so the result can be reviewed."""
import json, re, sys, collections
sys.path.insert(0, __import__('os').path.dirname(__file__))
import partmatch as pm
CAT = json.load(open(sys.argv[1])); rows = json.load(open(sys.argv[2])); impact = sys.argv[3]
cat = [(v, l) for v, l, _ in CAT['cat']]; labs = [l for l, _ in CAT['labs']]
RULES = json.load(open(__import__('os').path.join(__import__('os').path.dirname(__file__), '..', 'tools', 'labour_rules.json')))
SKIP = r"^(Front|Rear) View( Right| Left)?$|^(Interior|General|Side) View|^Side View|Odometer|Chassis Number$|Engine Compartment|Road Tax|Tyre Size|Suspension View|DASHBOARD|Dashboard"
SYN = {"Front Pillar LH": "Front Pillar Outer LH", "Front Pillar RH": "Front Pillar Outer RH","Front Number Plate": "Number Plate Front", "Rear Number Plate": "Number Plate Rear", "Number Plate Holder Front": "Number Plate Front Holder",
       "Front Panel Radiator Support RH": "Front Panel", "Fender Inner RH": "Fender Front Inner RH", "Fender Inner LH": "Fender Front Inner LH",
       "Front Stabiliser Bar": "Stabiliser Bar Front", "Front Indicator Lamp RH": "Fender Signal Lamp Front RH", "Windscreen Washer Tank": "Windscreen Washer Tank",
       "Rear LH Chassis Frame": "Chassis Member Rear LH", "TAIL LAMP LH": "Rear Lamp LH", "Boot Lid Weathestrip": "Boot Lid Aperture Weatherstrip",
       "Badge Boot Lid [VIOS]": "Emblem Boot", "Boot Lid Badge": "Emblem Boot", "Spare Wheel Well": "Spare Wheel Well", "Boot Side Trim LH": "Boot Side Trim LH", "Rear Bumper Sensor": "Bumper Rear Sensor",
       "Rear Bumper Sensor LH": "Bumper Rear Sensor", "Rear Bumper Sensor RH": "Bumper Rear Sensor", "Front Bumper Sensor RH": "Bumper Front Sensor",
       "Quarter Liner LH": "Quarter Panel Liner Rear LH", "Quarter Liner RH": "Quarter Panel Liner Rear RH", "Rear Suspension Crossmember": "Suspension Crossmember Rear",
       "Rear Bumper Centre Guide": "Bumper Rear Retainer Centre", "Rear Bumper Bracket LH": "Bumper Rear Retainer LH", "Rear Bumper Bracket RH": "Bumper Rear Retainer RH",
       "Front Bumper Bracket LH": "Bumper Front Side Retainer LH", "Front Bumper Bracket RH": "Bumper Front Side Retainer RH",
       "Spare Wheel Carrier": "Spare Wheel Carrier", "Rear LH Door Hinge": "", "Rear RH Door Hinge": "", "Door Front Trimboard LH": "Door Trim Board Front LH",
       "Door Front Trimboard RH": "Door Trim Board Front RH", "Door Rear Trimboard LH": "Door Trim Board Rear LH", "Door Rear Trimboard RH": "Door Trim Board Rear RH",
       "Rear Wheel Arc Finisher RH": "Wheel Arch Moulding Rear RH", "Front Pillar LH": "Front Pillar Outer LH", "Centre Pillar LH": "Centre Pillar Outer LH",
       "Front Suspension Lower Arm LH": "Suspension Arm Front LH", "Front Suspension Lower Arm RH": "Suspension Arm Front RH",
       "Front Shock Absorber LH": "Shock Absorber Front LH", "Front Shock Absorber RH": "Shock Absorber Front RH",
       "Front Wheel Rim LH": "Wheel Rim", "Front Wheel Rim RH": "Wheel Rim", "Rear Wheel Rim LH": "Wheel Rim", "Rear Wheel Rim RH": "Wheel Rim",
       "Door Front Outer Weatherstrip RH": "Door Glass Weatherstrip Outer Front RH", "Door Front Outer Weatherstrip LH": "Door Glass Weatherstrip Outer Front LH",
       "Door Front Lower Moulding LH": "Door Front Moulding LH", "Door Rear Lower Moulding LH": "Door Rear Moulding LH", "Door Rear Lower Moulding RH": "Door Rear Moulding RH",
       "Runningboard Spoiler LH": "Runningboard Spoiler LH", "Rear Bumper Reinforcement": "Bumper Reinforcement Rear", "Front Bumper Reinforcement": "Bumper Reinforcement Front"}
names = []
for r in rows:
    n = r['name']
    if re.search(SKIP, n): continue
    if n not in names: names.append(n)
# user 2026-10-23: when the catalogue has no rear bumper spoiler item (e.g. Vios 2023 NGC102), "Rear Bumper Spoiler" = Bumper Rear Lower Cover
if not any(re.search(r"Spoiler Bumper Rear|Bumper Rear Spoiler", l, re.I) for _, l in cat):
    SYN["Rear Bumper Spoiler"] = "Bumper Rear Lower Cover"
key = lambda l: re.sub(r"\s*\([A-Z0-9-]+\)$", "", re.sub(r"^\S+\s+\[.*?\]\s*", "", l)).strip()
pick, missing, why = collections.OrderedDict(), [], {}
def add(val, lab, reason):
    if val not in pick: pick[val] = lab; why[val] = reason
GRP = {("Front","LH"):"30",("Front","RH"):"110",("Rear","LH"):"60",("Rear","RH"):"80"}
def pref_group(name):
    """Merimen part groups: 10 Front Panel, 20 Bonnet&Engine, 30/110 Front Fender&Susp LH/RH, 40/100 Front Door LH/RH,
    50/90 Rear Door LH/RH, 60/80 Rear Quarter&Susp LH/RH, 70 Rear Panel, 75 Rear Compartment, 130 Undercarriage."""
    n = name
    if re.search(r"Rear Lamp|Lamp Assembly Rear|Rear Bumper|Bumper Rear|Tailgate|Boot Lid|Rear Panel", n): return "70"
    if re.search(r"Front Bumper|Bumper Front|Grille|Headlamp(?! Panel)|Fog Lamp|Number Plate Front", n): return "10"
    pos = "Front" if re.search(r"\bFront\b", n) else "Rear" if re.search(r"\bRear\b", n) else None
    side = (re.findall(r"\b(LH|RH)\b", n) or [None])[-1]
    return GRP.get((pos, side))
def find(q, reason, allow_sideless=True, photo=None):
    m = pm.best(q, cat, allow_sideless)
    ex = [(v, l) for v, l in cat if key(l).lower() == q.lower()]      # exact name wins (Door Mirror RH, not Door Mirror Cover RH)
    if ex: m = (ex[0][0], ex[0][1], 9)
    if not m: return None
    g = pref_group(photo or q)
    if g and m[0].split('@')[0] != g:      # same part text exists in the photo's own group -> use that one
        alt = [(v, l) for v, l in cat if v.split('@')[0] == g and key(l) == key(m[1])]
        if alt: m = (alt[0][0], alt[0][1], m[2])
    add(m[0], m[1], reason); return m
key = lambda l: re.sub(r"\s*\([A-Z0-9-]+\)$", "", re.sub(r"^\S+\s+\[.*?\]\s*", "", l)).strip()
sensors = collections.Counter()
for n in names:
    q = SYN.get(n, n)
    if q == "": continue
    if 'Sensor' in n:
        s = re.findall(r"\b(LH|RH)\b", n); sensors[q] += 0
        for x in s: sensors[(q, x)] = 1
        continue
    if not find(q, "photo: " + n, photo=n): missing.append(n)
labels = {key(l) for l in pick.values()}
txt = " | ".join(labels)
# companions
def comp(cond, q, reason, manual=None):
    if cond and not any(re.search(q.replace(' ', '.*'), key(l), re.I) for l in pick.values()):
        if not find(q, "companion: " + reason): missing.append((manual or q) + "  (companion: " + reason + ")")
for pos, g in (("Front", "10"), ("Rear", "70")):
    if re.search(rf"Bumper {pos} Cover|Spoiler Bumper {pos}|Bumper {pos} Spoiler", txt) or any(re.match(rf"({pos} Bumper|Bumper {pos})", n) for n in names):
        c = [(v, l) for v, l in cat if v.split('@')[0] == g and re.search(r"Bumper Clips|^\S+ \[.*\] Clips", l)]
        if c: add(c[0][0], c[0][1], f"{pos.lower()} bumper -> clips x15 (QTY=15)")
        else: missing.append(f"Bumper Clips  ({pos.lower()} bumper, manual 15 x 10.00)")
comp(re.search(r"Spoiler Bumper Rear|Bumper Rear Spoiler", txt), "Bumper Rear Cover", "bumper spoiler -> bumper")
for pos in ("Front", "Rear"):     # user 2026-10-20: bumper -> ALWAYS sensors + brackets LH & RH
    if re.search(rf"Bumper {pos} Cover", " | ".join(key(l) for l in pick.values())):
        for x in ("Sensor", "Retainer LH", "Retainer RH"):
            q = f"Bumper {pos} {x}"
            if not any(re.search(q.replace(' ', '.*'), key(l)) for l in pick.values()):
                if not find(q, f"{pos.lower()} bumper -> {x.lower()}", photo=f"{pos} Bumper"): missing.append(q + f"  (companion: {pos.lower()} bumper)")
comp(re.search(r"Spoiler Bumper Front|Bumper Front Spoiler", txt), "Bumper Front Cover", "bumper spoiler -> bumper")
comp(re.search(r"^Grille|\| Grille", txt), "Grille Clips", "grille -> clips")
if re.search(r"(^|\| )Bonnet( |$|\|)", txt + " "):
    comp(True, "Bonnet Hinge LH", "bonnet -> hinge"); comp(True, "Bonnet Hinge RH", "bonnet -> hinge")
for s in ("LH", "RH"):
    comp(re.search(r"Fender Front " + s, txt), "Fender Front Liner " + s, "fender -> liner")
    if not re.search(r"Viva", __import__("os").environ.get("VEHICLE", ""), re.I):  # user 2026-10-29: Perodua Viva has no quarter liner
        comp(re.search(r"Quarter Panel( Outer)? " + s, txt), "Quarter Panel Liner Rear " + s, "quarter -> liner", manual="Quarter Liner " + s)
    comp(re.search(r"Shock Absorber Front " + s, txt), "Suspension Crossmember Front", "front shock -> crossmember")
    comp(re.search(r"Shock Absorber Rear " + s, txt), "Suspension Crossmember Rear", "rear shock -> crossmember")
for s_ in ("LH", "RH"):
    for ax, g in (("Front", "110" if s_ == "RH" else "30"), ("Rear", "80" if s_ == "RH" else "60")):
        if re.search(rf"Suspension Crossmember {ax}|Shock Absorber {ax} {s_}", txt) and re.search(rf"\b{s_}\b", txt):
            if re.search(rf"Shock Absorber {ax} {s_}", txt):
                for q in ("Wheel Centre", f"Wheel Hub {ax} {s_}"):
                    c = [(v, l) for v, l in cat if v.split('@')[0] == g and re.search(q.replace(' ', '.*'), l)]
                    if c: add(c[0][0], c[0][1], f"crossmember -> {q}")
# user 2026-10-29: Chassis Member photo + catalogue has both an Extension and a Section item (same axle + side) -> select BOTH
for n in names:
    m = re.match(r"(Front|Rear) Chassis Member (LH|RH)$", n)
    if not m: continue
    ax, sd = m.groups()
    ext = [(v, l) for v, l in cat if re.search(rf"Chassis Member {ax} Extension {sd}\b", l)]
    sec = [(v, l) for v, l in cat if re.search(rf"Chassis Member {ax} .*Section.*{sd}\b|Chassis Member {ax} {sd} .*Section", l)]
    for v, l in ext[:1] + sec[:1]:   # catalogue items only; never a manual row (user 2026-10-29)
        if v not in pick: add(v, l, f"chassis member {ax} {sd} -> extension/section too")
# user 2026-10-23 SUSPENSION SET: any one of these photographed on a corner -> select ALL of that corner's set
SUSP = {"Front": [("Shock Absorber", r"Shock Absorber Front|Front Shock Absorber"), ("Suspension Spring", r"Suspension Spring Front|Coil Spring Front|Spring Front"), ("Steering Tie Rod", r"Tie Rod"),
                  ("Suspension Lower Arm", r"Lower Arm|Wishbone Lower|Suspension Arm Front"), ("Suspension Crossmember", r"Suspension Crossmember( Front)?"),
                  ("Knuckle Arm", r"Knuckle"), ("Driveshaft", r"Drive ?shaft"), ("Stabiliser Bar Front Link", r"Stabili[sz]er.*(Link|Rod)")],
        "Rear": [("Shock Absorber", r"Shock Absorber Rear|Rear Shock Absorber"), ("Suspension Spring", r"Suspension Spring Rear|Coil Spring Rear|Spring Rear"), ("Suspension Lower Arm", r"Lower Arm Rear|Rear.*Lower Arm|Suspension Arm Rear"),
                 ("Suspension Crossmember", r"Suspension Crossmember Rear|Rear Suspension Crossmember|Crossmember Rear")]}
TRIG = r"Shock Absorber|Suspension Spring|Tie Rod|Lower Arm|Wishbone|Suspension Arm|Suspension Crossmember|Knuckle|Drive ?shaft|Stabili[sz]er.*(Link|Rod)"
corners, sideless = set(), set()
for n in names:
    if re.search(TRIG, n, re.I):
        ax = "Rear" if re.search(r"\bRear\b", n) and not re.search(r"Tie Rod|Knuckle|Drive ?shaft|Link", n) else "Front"
        sds = re.findall(r"\b(LH|RH)\b", n)
        if sds: corners.add((ax, sds[0]))
        else: sideless.add(ax)
for ax in sideless:  # a side-less name only adds both sides when no sided name exists for that axle
    if not any(a == ax for a, _ in corners): corners |= {(ax, "LH"), (ax, "RH")}
for ax, sd in sorted(corners):
    grp = {("Front", "LH"): "30", ("Front", "RH"): "110", ("Rear", "LH"): "60", ("Rear", "RH"): "80"}[(ax, sd)]
    other = "RH" if sd == "LH" else "LH"
    for item, rx in SUSP[ax]:
        c = [(v, l) for v, l in cat if v.split('@')[0] in (grp, "130", "20") and re.search(rx, l, re.I) and not re.search(rf"\b{other}\b", l)]
        if any(re.search(rx, key(l), re.I) and not re.search(rf"\b{other}\b", l) for l in pick.values()): continue
        if c: add(c[0][0], c[0][1], f"suspension set {ax} {sd} -> {item}")
        else: missing.append(f"{item} {ax} {sd}  (suspension set, manual)")
if CAT.get('make', '').upper().startswith('PERODUA') or re.search(r"Perodua", sys.argv[1], re.I):
    comp(re.search(r"Headlamp Panel", txt), "Front Panel Upper", "perodua headlamp panel -> front panel upper")
for lid in ("Boot Lid", "Tailgate"):
    if re.search(r"(^|\| )" + lid + r"( \||$)", txt):
        for x in ("Lock", "Striker", "Hinge LH", "Hinge RH", "Aperture Weatherstrip"): comp(True, lid + " " + x, lid + " -> " + x)
        for v, l in list(pick.items()):
            if re.fullmatch(lid + " Hinge", key(l)): why[v] += "  QTY=2 COMMENT=Rear LH & Rear RH"
        if lid == "Tailgate": comp(True, "Tailgate Support Strut LH", "tailgate -> strut"); comp(True, "Tailgate Support Strut RH", "tailgate -> strut")
# doors: full set (user 2026-10-17)
DOORKW = ["Check Strap", "Glass Weatherstrip Outer", "Lock", "Aperture Weatherstrip", "Hinge Lower", "Hinge Upper", "Striker", "Trim Board Finisher", "Trim Board", "Window Regulator", "Regulator Motor", "Handle Outer Release", "Weather Sheeting"]   # user 2026-10-20: old list incl. Regulator Motor + Handle Outer Release still required
for pos in ("Front", "Rear"):
    for s in ("LH", "RH"):
        if re.search(rf"Door {pos} {s}", txt):
            grp = [v for v, l in pick.items() if re.search(rf"Door {pos} {s}", key(l))][0].split('@')[0]
            for kw in DOORKW:
                rx = re.compile(kw.replace(' ', r'.*'), re.I)
                cand = [(v, l) for v, l in cat if v.split('@')[0] == grp and rx.search(l) and (s in l or not re.search(r"\b(LH|RH)\b", l))]
                if not cand: cand = [(v, l) for v, l in cat if rx.search(l) and re.search(r"\bDoor\b", l) and pos in l and (s in l or not re.search(r"\b(LH|RH)\b", l))]
                if cand: add(cand[0][0], cand[0][1], f"door {pos} {s} set: {kw}")
            if pos == "Front": comp(True, "Door Mirror " + s, "front door -> mirror")
# sensors: qty = number of sides seen; comment
sens = {}
for k, v in sensors.items():
    if isinstance(k, tuple):
        sens.setdefault(k[0], []).append(k[1])
for q in [k for k in sensors if not isinstance(k, tuple)]:
    sides = sorted(set(sens.get(q, [])))
    m = find(q, "photo: sensor " + ",".join(sides) if sides else "photo: sensor")
    if not m: missing.append(q)
    else: why[m[0]] += "  QTY=%d COMMENT=%s" % (max(1, len(sides)), " & ".join("Rear " + x if 'Rear' in q else "Front " + x for x in sides) or "-")
# labour
labels = {key(l) for l in pick.values()}
sides = {x for n in names for x in re.findall(r"\b(LH|RH)\b", n)}
front = bool(re.search("front", impact)); rear = bool(re.search("rear", impact))
AREA_BAD = (r"Boot|Rear Panel|Fuel Tank|Suspension Rear|Lamp Assembly Rear|Bumper Rear|Tailgate|Door Back" if not rear else r"Bonnet|Bumper Front|Front Panel|Headlamp|Engine and Suspension|Fender Front|Radiator")
N, R = set(), set()
for n in labels:
    r = RULES.get(n) or RULES.get(n.replace(" (tts)", ""))
    if not r: continue
    for a, p in r["N"]:
        if p >= .5: N.add(a)
    for a, p in r["R"]:
        if p >= .5: R.add(a)
for n in labels:      # replaced panel itself
    if n in labs: N.add(n)
if any(re.match(r"(Boot Lid|Tailgate)$", n) for n in labels) and "Door Back" in labs: N.add("Door Back")
# user batch 3 review (2026-10-24): user only ADDED labour, mostly R on inner reinforcements -> tick them when in the catalogue
side_hit = any(re.match(r"Door (Front|Rear)", n) for n in labels)
EXTRA_R = ([r"^Fender Front Inner (Reinforcement|Section|Side Reinforcement|Support Panel|Upper Support Panel)", r"^Front Panel Support Panel", r"^Bumper Front Reinforcement Panel", r"^Front Panel$", r"^Grille Front$"] if front else []) \
    + ([r"^Front Pillar (Inner|Reinforcement)", r"^Centre Pillar (Inner|Reinforcement)", r"^Runningboard Panel (Reinforcement|Section Centre)", r"^Quarter Pillar Front Reinforcement", r"^Quarter Panel Inner Striker Reinforcement"] if side_hit else []) \
    + ([r"^Quarter Panel Inner( Reinforcement (Lower|Upper))? (LH|RH)$", r"^Quarter Pillar Rear Reinforcement", r"^Quarter Panel Inner Fuel Filler Panel", r"^Chassis Member Rear (Closing|Deformation Panel)", r"^Rear Lamp Panel and Drain Channel"] if rear else [])
for a in labs:
    if any(re.search(x, a) for x in EXTRA_R): R.add(a)
if any(re.match(r"Tailgate$", n) for n in labels) and "Tailgate R&R" in labs: N.add("Tailgate R&R")
ok = lambda a: (not re.findall(r"\b(LH|RH)\b", a) or re.findall(r"\b(LH|RH)\b", a)[-1] in sides) and not (AREA_BAD and re.search(AREA_BAD, a) and not any(a.startswith(x) for x in labels))
def fam(a):
    s = re.findall(r"\b(LH|RH)\b", a)
    if not s: return True
    w = a.split()[0]
    return any(s[-1] in l and w in l for l in labels) or a in labels
N = {a for a in N if fam(a)}; R = {a for a in R if fam(a) or any(re.search(x, a) for x in EXTRA_R)}  # extras: side checked by ok()
N = sorted(a for a in N if a in labs and ok(a) and not re.match(r"^(Bonnet|Door Mirror)", a) or (a in labs and a in labels))
R = sorted(a for a in R if a in labs and ok(a) and a not in N)
json.dump({"CP": list(pick), "N": N, "R": R}, open(sys.argv[4], "w"))
json.dump({"missing": missing, "why": why}, open(sys.argv[5], "w"))
for v, l in pick.items(): print("  +", l, " <-", why[v])
print("  MISSING:", missing); print("  N:", N); print("  R:", R)
