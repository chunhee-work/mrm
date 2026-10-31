#!/usr/bin/env python3
"""Propose raw Merimen caption -> official name. Writes name_map.tsv for the user to review.
Official list (official_names.txt) is never edited here."""
import collections, difflib, json, os, re, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from build_dataset import label

OFF = [l.strip() for l in open(os.path.join(HERE, "official_names.txt")) if l.strip()]
VOCAB = sorted({w for n in OFF for w in re.findall(r"[a-z/]+", n.lower())} | {"rear", "front", "lh", "rh", "cover"})
PHRASE = [(r"\bdoo\b", "door"), (r"\bfoglamp\b", "fog lamp"), (r"^runningboard (lh|rh)$", r"runningboard panel \1"), (r"\b(\w+ \w+) \1\b", r"\1"), (r"\bwheel rim alloy (front|rear)\b", r"\1 wheel rim"), (r"\bdriveshaft front\b", "driveshaft"),
          (r"\bquarter panel liner rear\b", "quarter liner"), (r"\bshock absorber (front|rear)\b", r"\1 shock absorber"), (r"^absorber (front|rear)\b", r"\1 shock absorber"), (r"\b(rear )?end panel\b", "rear panel"), (r"\bquarter panel outer\b", "quarter panel"), (r"^(outer|inner) lamp (rear )?(lh|rh)\b", r"rear lamp \1 \3"), (r"\bfender front\b", "fender"), (r"\bair conditioning condenser\b", "a/c condenser"), (r"\bair cond\b", "a/c"),
          (r"\bwheel house\b", "wheelhouse"), (r"\btrim board\b", "trimboard"), (r"\brunning board\b", "runningboard"),
          (r"\bstabilizer\b", "stabiliser"), (r"\bcenter\b", "centre"), (r"\bassembly\b", "assy")]
SYN_FULL = {"inspection disc": "Road Tax", "odometer": "Odometer Reading", "roadtax": "Road Tax", "road tax": "Road Tax", "engine comp": "Engine Compartment", "fender front lh": "Fender LH", "fender front rh": "Fender RH", "manifold cover": "Exhaust Manifold Cover", "road tax disc": "Road Tax", "engine view": "Engine Compartment", "front bumper cover": "Front Bumper", "bumper front cover": "Front Bumper", "bumper rear cover": "Rear Bumper",
            "rear bumper cover": "Rear Bumper", "headlamp assy lh": "Headlamp LH", "headlamp assy rh": "Headlamp RH",
            "fog lamp lh": "Front Bumper Fog Lamp LH", "fog lamp rh": "Front Bumper Fog Lamp RH"}


# user-confirmed same part: collapse to one training name
MERGE = [(r"^Front Pillar Outer (LH|RH)$", r"Front Pillar \1"), (r"^Washer Tank Screen$", "Windscreen Washer Tank"), (r"^Front Panel$", "Front Panel Assembly"), (r"^Rear End Panel$", "Rear Panel"), (r"^Quarter Panel Outer (LH|RH)$", r"Quarter Panel \1"), (r"^Door Lower Moulding (LH|RH)$", r"Door Rear Lower Moulding \1"), (r"^Front Wheel (LH|RH)$", r"Front Wheel Rim \1")]
# user-confirmed same part, matched on the raw caption (catches typos not in the official list)
RAW_MERGE = [(r"^rear end panel$", "Rear Panel"),  # user: never use "Rear End Panel"
             (r"^(front |frt )?engine (compartment|room|bay)( view| photo)?$", "Engine Compartment"),
             (r"^spare (wheel|tyre|tire) (cover )?board$", "Spare Wheel Cover Board"),
             (r"^boot ?floor$", "Boot Floor"), (r"^(rr|rear) panel$", "Rear Panel"),   # user: BOOTFLOOR = Boot Floor, RR PANEL = Rear Panel; "BOOTFLOOR, RR PANEL" stays excluded (2 items)   # user: never "SPARE WHEEL BOARD"
             (r"^engine ?view$", "Engine Compartment"), (r"^(frt|front) general view$", "Front View"), (r"^(rear|rr) general view$", "Rear View"),   # same photo types under old spellings
             (r"^tail ?lamp (?P<s>lh|ns)$", "Rear Lamp LH"), (r"^tail ?lamp (?P<s>rh|os)$", "Rear Lamp RH"),   # user: never "TAIL LAMP LH"; NS = nearside = LH, OS = offside = RH
             (r"^tail ?lamp panel (lh|ns)$", "Rear Lamp Panel LH"), (r"^tail ?lamp panel (rh|os)$", "Rear Lamp Panel RH"),
             (r"^((1st|2nd|3rd) supple-|reinspection before spray-|trailer )?(chassis|chasis) ?(no\.?|number)$", "Chassis Number"),  # user: CHASSIS NO = Chassis Number  # user: Engine Compartment View = Engine Compartment
             (r"^(?=.*washer)(?=.*tank)(?!.*(pump|pipe|cap|motor|hose|bracket))[a-z ]*(\[with pump\])?$", "Windscreen Washer Tank"),
             (r"^(?=.*\bmirror\b)(?=.*\bdoor\b|.*side mirror)(?!.*(glass|cover|lamp|signal|motor|cap|interior|switch|at door))(?=.*\b(?P<s>lh|rh)\b).*$", r"Door Mirror \g<s>")]


def regulator(raw):
    """user: Door Rear Window Regulator RH = Door Window Regulator Rear RH -> always Door Window Regulator Front/Rear LH/RH"""
    t = re.sub(r"[^a-z ]", " ", raw.lower())
    if not re.search(r"\bregulator\b", t) or re.search(r"motor|switch|handle|clip|bracket|cable|&|\band\b", t): return None
    if not re.search(r"\b(window|glass|door)\b", t): return None
    m = re.search(r"\b([lr])h([fr])\b", t)
    side = (m.group(1) if m else (re.search(r"\b([lr])h\b", t) or [None, None])[1])
    pos = (m.group(2) if m else ("f" if re.search(r"\b(front|frt|fr)\b", t) else "r" if re.search(r"\b(rear|rr)\b", t) else None))
    if not side or not pos: return None
    return "Door Window Regulator %s %sH" % ("Front" if pos == "f" else "Rear", side.upper())


def quarter_panel(raw):
    """user 2026-10-16: every quarter-panel name starts with "Quarter Panel" (Rear RH Quater Panel Inner Shield -> Quarter Panel Inner Shield RH)."""
    t = re.sub(r"\s+", " ", raw.strip())
    m = re.match(r"^(?:rear |rr )?(lh|rh) (?:quater|quarter) (?:panel|pnl)(?: (.*))?$", t, re.I) or \
        re.match(r"^(?:quater|quarter) pnl (.*?)(?: (lh|rh))?$", t, re.I)
    if not m: return None
    if m.re.pattern.startswith("^(?:rear"):
        side, rest = m.group(1).upper(), (m.group(2) or "").strip()
    else:
        rest, side = m.group(1).strip(), (m.group(2) or "").upper()
    rest = " ".join(w if w.isupper() and len(w) <= 3 else w.capitalize() for w in rest.split())
    return re.sub(r"\s+", " ", "Quarter Panel %s %s" % (rest, side)).strip()


def fix_tokens(s):
    out = []
    for w in re.findall(r"[a-z0-9/()]+|[^\sa-z0-9]", s):
        if w.isalpha() and len(w) > 3 and w not in VOCAB:
            m = difflib.get_close_matches(w, VOCAB, n=1, cutoff=0.7)
            w = m[0] if m else w
        out.append(w)
    return " ".join(out)


def norm(s):
    s = re.sub(r"\s+", " ", s.lower()).strip()
    for a, b in PHRASE:
        s = re.sub(a, b, s)
    return fix_tokens(s)


OFFN = {}
for n in OFF:
    OFFN.setdefault(norm(n), n)
BAG = collections.defaultdict(list)
for k, n in OFFN.items():
    BAG[tuple(sorted(k.replace("assy", "").split()))].append(n)


GENERIC = {"photographs of damaged parts", "4 angles of vehicle photos", "tyres", "photos", "others"}


def side(s):
    m = re.search(r"\b(lh|rh)\b", s.lower())
    return m.group(1) if m else None


VIEW = {("front", "os"): "Front View Right", ("front", "ns"): "Front View Left", ("rear", "os"): "Rear View Right",
        ("rear", "ns"): "Rear View Left", ("front", "rh"): "Front View Right", ("front", "lh"): "Front View Left",
        ("rear", "rh"): "Rear View Right", ("rear", "lh"): "Rear View Left"}


def propose(raw):
    low = re.sub(r"\s+", " ", raw.lower()).strip()
    _parts = [x.strip() for x in re.sub(r"\[.*?\]|\(.*?\)", "", low).split(",")]
    _POS = r"^(lh|rh|ns|os|front|frt|rear|rr|lower|upper|inner|outer|centre|center|left|right|lhf|lhr|rhf|rhr)( (lh|rh))?$"
    if re.search(r"&|\band\b|\s\bn\b\s", low) or sum(bool(re.search(r"[a-z]{4}", x)) and not re.match(_POS, x) for x in _parts) >= 2:   # e.g. "BOOTFLOOR, RR PANEL"
        return "", "multi-item caption (excluded)"   # user: never '&' — 1 image = 1 item name
    if re.fullmatch(r"[\d\s.#-]+", low):
        return "", "generic caption (excluded)"   # bare numbers like "24", "47"
    if low in GENERIC or re.search(r"pho\w*\s+of\s+da|damaged parts|damgaed|damgfed|after repair|accident scene", low):
        return "", "generic caption (excluded)"
    low2 = re.sub(r"[^a-z0-9/ ]", " ", low)
    low2 = re.sub(r"\b(rr)\b", "rear", re.sub(r"\b(frt|fr)\b", "front", low2))
    # user: LHF/LHR/RHF/RHR are typos -> only LH/RH (the F/R becomes front/rear)
    low2 = re.sub(r"\b([lr])h([fr])\b", lambda m: ("front " if m.group(2) == "f" else "rear ") + m.group(1) + "h", low2)
    m = re.match(r"^\s*(?:view (front|rear) (lh|rh|os|ns)|(front|rear) (os|ns|lh|rh) view|(front|rear) view (lh|rh|os|ns))\s*$", low2)
    if m:
        g = [x for x in m.groups() if x]; a, b = g[0], g[1]
        return VIEW[(a, b)], "view wording"
    if low2.replace(" ", "") in ("roadtax", "roadtaxdisc"):
        return "Road Tax", "user synonym"
    low2 = re.sub(r"\bfoglamp\b", "fog lamp", low2)
    low2 = re.sub(r"^fog lamp front (lh|rh)$", r"fog lamp \1", low2.strip())
    n = norm(low2)
    if n in SYN_FULL:
        return SYN_FULL[n], "user synonym"
    if n in OFFN:
        return OFFN[n], "exact" if OFFN[n] == label(raw) else "spelling/case"
    bag = tuple(sorted(n.replace("assy", "").split()))
    if bag in BAG:
        return BAG[bag][0], "same words, other order"
    sw = {"lh": "rh", "rh": "lh"}.get(side(n))
    if sw:
        other = re.sub(r"\b%s\b" % side(n), sw, n)
        ob = tuple(sorted(other.replace("assy", "").split()))
        if other not in OFFN and ob in BAG:
            other = norm(BAG[ob][0])
        if other in OFFN:
            return re.sub(r"\b(LH|RH)\b", sw.upper() if False else side(n).upper(), OFFN[other]), "other side of a listed name"
    if n in GENERIC:
        return "", "generic caption (excluded)"
    return "", "not in list"


if __name__ == "__main__":
    cnt = collections.Counter()
    for l in open(os.path.join(HERE, "index.jsonl")):
        try: cnt[re.sub(r"\s*[\t\r\n]+\s*", " ", json.loads(l)["name"]).strip()] += 1   # tabs inside captions broke name_map.tsv (Rear Panel -> "60")
        except ValueError: pass
    rows = []
    for raw, c in cnt.most_common():
        off, how = propose(raw)
        for a, b in RAW_MERGE:
            mm = re.match(a, re.sub(r"\s+", " ", raw.lower()).strip())
            if mm: off, how = mm.expand(b).replace(" lh", " LH").replace(" rh", " RH"), "user synonym"
        qp = quarter_panel(raw)
        if qp: off, how = qp, "user rule: Quarter Panel first"
        rg = regulator(raw)
        if rg: off, how = rg, "user synonym"
        for a, b in MERGE: off = re.sub(a, b, off)
        if re.match(r"^(Tailgate|Boot Lid) Hinge$", off or ""): off, how = "", "needs LH/RH (excluded)"   # user: never "Tailgate Hinge" without a side
        rows.append((raw, c, off, how))
    with open(os.path.join(HERE, "name_map.tsv"), "w") as f:
        f.write("raw\tphotos\tofficial\tmethod\n")
        for r in rows:
            f.write("%s\t%d\t%s\t%s\n" % r)
    by = collections.Counter()
    for raw, c, off, how in rows:
        by[how] += c
    print("distinct captions", len(rows)); print({k: v for k, v in by.items()})


# ---- user decisions 2026-10-17 (duplicate-name review). Applied to FINAL labels in build_big.py ----
_ABBR = {"frt": "front", "fr": "front", "rr": "rear", "assy": "assembly"}
def order_key(l):
    """Same words in any order / case / abbreviation / bracket position = one name (A-group, user OK'd)."""
    return " ".join(sorted(_ABBR.get(w, w) for w in re.findall(r"[a-z0-9]+", l.lower())))

FINAL = [  # (regex on the final label, replacement; None = never use / drop)
    (r"^Rear Panel Outer$", "Rear Panel"),                                            # 1 same
    (r"(?i)^\[inner[^\]]*\] Lamp Assembly Rear (LH|RH)( \(tts\))?$", r"Rear Lamp Inner \1"),   # user 2026-10-29: never "[inner] Lamp Assembly Rear LH (tts)"
    (r"(?i)^Lamp Assembly Rear (LH|RH)( \(tts\))? \[inner[^\]]*\]$", r"Rear Lamp Inner \1"),
    (r"(?i)^(\[outer[^\]]*\] Lamp Assembly Rear (LH|RH)( \(tts\))?|Lamp Assembly Rear (LH|RH)( \(tts\))? \[outer[^\]]*\])$", lambda m: "Rear Lamp Outer " + (m.group(2) or m.group(4))),
    (r"(?i)^Lamp Assembly Rear (LH|RH)( \(tts\))?$", r"Rear Lamp \1"),
    (r"^\[outer\] (Lamp Assembly Rear (LH|RH) \(tts\))$", r"\1"),                     # 3 same
    (r"^(Lamp Assembly Rear (LH|RH) \(tts\)) \[outer\]$", r"\1"),
    (r"^Bumper Front Reinforcement Panel$", "Front Bumper Reinforcement"),            # 5 same
    (r"^Bumper Rear Reinforcement Panel$", "Rear Bumper Reinforcement"),
    (r"^Size Of The Tyre$", "Tyre Size"),                                             # 6
    (r"^Runningboard Panel Outer (LH|RH)$", r"Runningboard Panel \1"),                # 8 same
    (r"^Centre Pillar (LH|RH)$", r"Centre Pillar Outer \1"),                          # 9 same
    (r"^(DASHBOARD VIEW|Dashboard Panel|DASHBOARD)$", "Dashboard"),                             # 10 same
    (r"^FRT PANEL VIEW$", "Front View"),                                              # 11
    (r"^Suspension Front (LH|RH)$", r"Front Suspension View \1"),                     # 12
    (r"^Suspension Rear (LH|RH)$", r"Rear Suspension View \1"),
    (r"^(Tyre View|View Tyre) Rear (LH|RH)$", r"Rear Tyre \2"),                       # 13
    (r"^(Tyre View|View Tyre) Front (LH|RH)$", r"Front Tyre \2"),
    (r"^Spoiler Runningboard Panel (LH|RH)$", r"Runningboard Spoiler \1"),            # 14
    (r"^(LH|RH) Runningboard Panel Spoiler$", r"Runningboard Spoiler \1"),
    (r"^Rear End (View|Assembly)$", None),                                            # 15 never use
    (r"^Bumper Bracket Rear (LH|RH) \[side - Outer\]$", r"Rear Bumper Bracket Side \1"),  # 16 same
    (r"^Quarter Inner Trim (LH|RH)$", r"Quarter Panel Inner Trim \1"),                # 17 same
    (r"^Runningboard Panel Extension (LH|RH)$", r"Runningboard Extension \1"),        # 18 same
    (r"^Door (Front|Rear) Weatherstrip (LH|RH)$", r"Door \1 Outer Weatherstrip \2"),  # 19 same; user labelled them "Outer" in 部位标注台 2026-10-20
    (r"^(BUMPER REAR LOWER|BUMPER RR LOWER COVER)$", "Bumper Rear Lower Cover"),      # 20
    (r"^Lamp Assembly Rear Outer$", "Lamp Assembly Rear"),                            # 21 same
    (r"^Bodyside (Rear )?Assembly (LH|RH)$", r"Bodyside \1\2"),                       # A-group
    (r"^Air Filter Assembly$", "Air Filter Assy"),
    # round 2 (user 2026-10-17)
    (r"^Rear (Tailgate( Lock| Weatherstrip)?)$", r"\1"), (r"^Rear (LH|RH) Tailgate Hinge$", r"Tailgate Hinge \1"),
    (r"^Front (Bonnet( Lock)?)$", r"\1"), (r"^Front (LH|RH) Bonnet Hinge$", r"Bonnet Hinge \1"),
    (r"^Front (LH|RH) Fender$", r"Fender \1"), (r"^Front (LH|RH) Headlamp$", r"Headlamp \1"), (r"^Front (LH|RH) Driveshaft$", r"Driveshaft \1"),
    (r"^Steering Tie Rod( End)? Front (LH|RH)$", r"Steering Tie Rod\1 \2"),
    (r"^Grille Front Badge$", "Grille Badge"), (r"^Rear Trailing Arm (LH|RH)$", r"Trailing Arm \1"),
    (r"^Front Windscreen Glass$", "Front Windscreen"), (r"^Spare Wheel Cover$", "Spare Wheel Cover Board"),
    (r"^Rear Panel Inner \[assembly\]$", "Rear Panel Inner"), (r"^PHOTO DAMAGES PART$", "DAMAGES PART"),
    (r"^DOOR (LH|RH)$", None),                                                        # a: no front/rear -> drop
    (r"^Chassis Member Rear Section Rear (LH|RH)$", r"Rear Chassis Member \1"),      # b
    (r"^Chassis Member Front (LH|RH) Front Section$", r"Front Chassis Member \1"),   # c
    (r"^Chassis Member (LH|RH)$", None),                                              # d: drop
    (r"^Boot Floor Rear$", "Boot Floor"),                                             # e
    (r"^Exhaust Silencer Rear$", "Exhaust Silencer"),                                 # f
    (r"^Rear Floor Panel$", "Floor Panel"),                                           # g (user chose Floor Panel)
    (r"^SUSPENSION LOWER ARM (LH|RH)$", None),                                        # h: drop
    (r"^GRILLE MOULDING$", "Grille Front Moulding"),                                  # i
    (r"^NUMBER PLATE HOLDER$", "Number Plate Holder Rear"),                           # j
    (r"^Exhaust Pipe$", "Rear Exhaust Pipe"), (r"^Exhaust Mounting$", "Exhaust Rear Mounting"),   # k
    (r"^(Bodyside Rear|BODYSIDE SECTION) (LH|RH)$", r"Bodyside \2"),                 # l
    (r"^CHASSIS FRAME ASSY$", "Chassis Assembly"),                                    # m
    (r"^Bumper Rear Section (LH|RH)$", r"Rear Bumper \1"),                           # n
    (r"^Badge Front$", "Badge"),                                                      # o
    (r"^Rear Panel (LH|RH)$", None),                                                  # p: wrong name -> drop (Rear Lamp Panel LH/RH is right)
    # round 3 (user 2026-10-17)
    (r"^Rear (LH|RH) Taillamp$", r"Rear Lamp \1"), (r"(?i)^badge (boot ?lid|tail ?gate) \[(.+)\]$", lambda m: ("Boot Lid" if "boot" in m.group(1).lower() else "Tailgate") + " Badge (" + m.group(2) + ")"),  # user 2026-10-23 format
    (r"(?i)^boot ?floor$", "Boot Floor"),
    (r"(?i)^number plate (frt|front) holder$|^(frt|front) number plate holder$|^number plate holder front$", "Number Plate Front Holder"),  # user 2026-10-23
    (r"(?i)^tail ?gate moulding$", "Tailgate Finisher"),  # user 2026-10-23: same item
    (r"(?i)^spare wheel foam$", "Spare Wheel Foam"),  # user 2026-10-23: this exact format
    (r"(?i)^tail ?gate strut( LH| RH)?$", lambda m: "Tailgate Support Strut" + (m.group(1) or "").upper()),  # user 2026-10-23: full name
    (r"(?i)^door glass (front|rear) window (LH|RH)$", lambda m: "Door " + m.group(1).capitalize() + " Window " + m.group(2).upper()),  # user 2026-10-23
    (r"(?i)^rear radar distance sensor( LH| RH)?$", lambda m: "Blind Sport ECU" + (m.group(1) or "").upper()),  # user 2026-10-23: = Blind Sport ECU, LH and RH
    (r"(?i)^(rr|rear) panel trim$", "Rear Panel Inner Trim"),  # user 2026-10-23: never "RR PANEL TRIM"
    (r"(?i)^rr bumper after dismantle$", None),
    (r"(?i)^rear panel,? ?boot ?floor$", None),  # user 2026-10-23: never use; name the one part at the crosshair  # user 2026-10-23: never use; name the part at the crosshair
    (r"(?i)^spoiler runningboard (?:extension|panel) (LH|RH)$", r"Runningboard Spoiler \1"),  # user 2026-10-21
    (r"(?i)^front (LH|RH) bumper lamp$", r"Front Bumper Fog Lamp \1"),  # user 2026-10-21: same item
    (r"^(?:REAR RADAR|Rear Radar|Rear radar)( LH| RH)?$", r"Rear Bumper Sensor\1"),  # user 2026-10-21: never "Rear Radar"
    (r"^(?:Boot Extractor Vent(?: LH| RH)?|Extractor Lower Vent|Boot Extractor Vent \[.*\])$", "Boot Extractor Vent"),  # user 2026-10-21: one name, never LH/RH
    (r"^(?:Quarter Panel Liner(?: Rear)?(?: Part)?|QUARTER PANEL LINER(?: REAR)?|QUARTER LINER(?: REAR)?|Quarter [Ll]iner Rear|Quarter liner)( LH| RH)?$", r"Quarter Liner\1"),  # user 2026-10-20: Quarter Liner, never Quarter Panel Liner
    (r"^Rear Bootlid$", "Boot Lid"), (r"^Rear Bootlid (Lock|Weatherstrip|Emblem)$", r"Boot Lid \1"), (r"^Rear (LH|RH) Bootlid Hinge$", r"Boot Lid Hinge \1"),
    (r"^BOOTLID EMBLEM$", "Boot Lid Emblem"), (r"^(TAILGATE EMBLEM|Rear Tailgate Emblem)$", "Tailgate Emblem"),
    (r"^BOOTLID SPOILER$", "Spoiler Rear [bootlid]"), (r"^Front Panel Upper Panel Cover$", "Front Panel Upper Cover"),
    (r"^Fender (Liner|Signal Lamp) Front (LH|RH)$", r"Fender \1 \2"),
    (r"^Axle Assy Rear$", "Rear Axle"), (r"^Seat Back Assy Rear$", "Rear Seat Back"), (r"^EXHAUST SILENCER ASSY$", "Exhaust Silencer"),
    (r"^(Bumper Rear Retainer Reinforcement (LH|RH)) \[side( Support)?\]$", r"\1"),
    # 1: rear bumper brackets = only "Rear Bumper Bracket Side LH/RH" and "Rear Bumper Bracket Upper LH/RH"; Retainer/Guide = Upper
    (r"^(Bumper Rear Retainer/Guide|BUMPER REAR RETAINER GUIDE) (LH|RH)$", r"Rear Bumper Bracket Upper \2"),
    (r"^Bumper Rear Retainer (LH|RH) \[side( Support)?\]$", r"Rear Bumper Bracket Side \1"),
    (r"^(Bumper Rear Bracket|Bumper Rear Retainer|BUMPER REAR RETAINER GUIDE)$", None),        # 2: no side -> drop
    # user 2026-10-17 (after sample photos): plain Rear Bumper Bracket = Side (cars without an upper show just this name)
    (r"^Rear Bumper Bracket (LH|RH)$", r"Rear Bumper Bracket Side \1"),
    (r"^Bumper Rear Retainer (LH|RH)$", r"Rear Bumper Bracket Upper \1"),
    (r"^Bumper Rear Mounting Bracket (LH|RH)$", r"Rear Bumper Bracket Side \1"),
    (r"^Bumper Bracket Rear (LH|RH) \[support\]$", r"Rear Bumper Bracket Side \1"),
    # 3/4: front bumper brackets
    (r"^(Bumper Front Bracket Support|Bumper Front Side Retainer|Bumper Front Retainer/Guide) (LH|RH)( \[side\])?$", r"Front Bumper Bracket \2"),
    (r"^Bumper Bracket Front (LH|RH) \[side\]$", r"Front Bumper Bracket \1"),
    (r"^Bumper Bracket Front (LH|RH) \[upper\]$", r"Bumper Front Bracket Support Upper \1"),
    (r"^Bumper Front Retainer$", "Bumper Front Bracket"),
    (r"^Tailgate Weatherstrip$", "Tailgate Aperture Weatherstrip"),                   # 5
    (r"^Boot Lid Weatherstrip$", "Boot Lid Aperture Weatherstrip"),                   # 6
    (r"^Front Full View$", "Front View"),                                             # 8
    (r"^(Headlamp|Rear Lamp) Body (LH|RH)$", r"\1 \2"),                              # 9
    (r"^Bumper Rear Cover (LH|RH)$", "Rear Bumper"), (r"^Bumper Rear (LH|RH) \[cover\]$", "Rear Bumper"),   # 10 (Rear Bumper LH/RH stay: separate pieces on some cars)
    (r"^Spare Wheel Bracket$", "Spare Wheel Retainer"),                               # 11
    (r"^(Sensor|SENSOR REAR) (LH|RH)$", None),                                        # 12
    (r"^Kangaroo Bar$", None),                                                        # 13
    (r"^Number Plate Lamp( LH| RH)?$", r"Rear Number Plate Lamp\1"),                 # 14
    (r"^Reflector (Rear )?(LH|RH)$", None),                                           # 15: only Rear Bumper Reflector Rear LH/RH
    (r"^Engine Splash Shield Front$", "Engine Splash Shield"), (r"^Engine Lower Splash Shield \[front\]$", "Engine Lower Splash Shield"),   # 16
    (r"^Quarter Pillar Rear (LH|RH)$", r"Quarter Pillar \1"),                        # 17
    (r"^Parcel Shelf$", "Parcel Shelf Rear"),                                         # 18
    (r"^(DAMAGES PART|DAMAGES PHOTO|DAMAGE PART PHOTO|PHOTO PART DAMAGES|PHOTO DAMAGES PART|DAMAGE PART)$", None),   # 19 not item names
    (r"^Rear Damage View$", None),                                                    # 20
    # user 2026-10-20 (sinar batch 2 review)
    (r"^(GENERAL VIEW|General View)$", None),                                         # never General View: use Front/Rear/Side View
    (r"^(SIDE VIEW|Side view)$", "Side View"),
    (r"(?i)^rear panel view$", "Rear View"),
    (r"(?i)^fender (frt|front) inner reinforcement (lh|rh)$", lambda m: "Fender Inner Reinforcement " + m.group(2).upper()),   # user 2026-10-30: never "Fender Frt Inner Reinforcement RH"
    (r"(?i)^(front|rear) (lh|rh) (lower|upper) arm$", lambda m: f"{m.group(1).title()} Suspension {m.group(3).title()} Arm {m.group(2).upper()}"),   # user 2026-10-30: never "Front RH Lower Arm"
    (r"(?i)^(front|rear) (lower|upper) arm (lh|rh)$", lambda m: f"{m.group(1).title()} Suspension {m.group(2).title()} Arm {m.group(3).upper()}"),
    (r"(?i)^(front |rear )?(lh|rh) (steering )?tie rod( end)?$", lambda m: "Steering Tie Rod" + (" End" if m.group(4) else "") + " " + m.group(2).upper()),   # user 2026-10-30: never "Front RH Tie Rod"
    (r"(?i)^(front |rear )?(steering )?tie rod( end)? (front |rear )?(lh|rh)$", lambda m: "Steering Tie Rod" + (" End" if m.group(3) else "") + " " + m.group(5).upper()),
    (r"(?i)^bumper rear absorber(\s*(&|and|n)\s*bumper rear absorber)?$", "Rear Bumper Shock Absorber"),   # user 2026-10-29 (typo fixed: use Rear Bumper Shock Absorber)
    (r"(?i)^(boot storage ?tray|boot storagetray)( LH| RH)?$", None),   # batch 4: it was the Spare Wheel Well; let the model/user decide
    (r"(?i)^rear number plate garnish$", "Bootlid Finisher"),   # user 2026-10-29 (Saga TAU5446)                                          # user 2026-10-29: never Rear Panel View
    (r"^Spoiler Runningboard Extension( Front)? (LH|RH)$", r"Runningboard Spoiler \2"),
    (r"^(Front|Rear) (LH|RH) Door Hinge$", r"Door \1 Hinge Upper \2"),
    (r"^Front Panel Radiator Support (LH|RH)$", r"Headlamp Panel \1"),
    (r"^Rear (LH|RH) (Quarter|Quater) Panel$", r"Quarter Panel \1"), (r"^Quater Panel (LH|RH)$", r"Quarter Panel \1"),
    (r"^TAIL ?LAMP (LH|RH)$", None),   # user 2026-10-20: never TAIL LAMP; per car = Rear Lamp (one-piece) or Rear Lamp Outer (split inner/outer lamps)
    (r"^Rear (LH|RH) Chassis Frame$", r"Rear Chassis Member \1"),
]
# kept DIFFERENT by the user: Rear Lamp RH vs Rear Lamp Outer RH (2); Rear Bumper Sensor RH vs ...Outer RH (4);
# Front Panel Upper vs Front Panel Upper Cover (7: the cover is the plastic on top of the upper panel)

KEEP_UP = {"LH", "RH", "ECU", "A/C", "ABS", "SRS", "LED", "CVT", "MPV", "SUV", "4WD", "2WD", "DRL"}


def title_caps(l):
    """user 2026-10-23: never ALL CAPITALS; every word starts with one capital (QUARTER PILLAR LH -> Quarter Pillar LH)"""
    if not l or re.search(r"[a-z]", l): return l
    return " ".join(w if w in KEEP_UP else "-".join(p[:1] + p[1:].lower() for p in w.split("-")) for w in l.split(" "))


def badge(l):
    """user 2026-10-31 (playbook 11): only Grille Badge (X) / Boot Lid Badge (X) / Tailgate Badge (X), X ALWAYS in CAPITALS.
    A lone letter / 'logo' in the bracket -> 'LOGO' (naming.py swaps in the case's brand)."""
    m = re.match(r"(?i)^(?:(grille(?: front)?|front grille|bonnet)\s+(?:badge|emblem)|(?:badge|emblem)\s+(grille|front)|"
                 r"(boot ?lid|bootlid)\s+(?:badge|emblem)|(?:badge|emblem)\s+(boot ?lid|bootlid)|"
                 r"(tail ?gate|door back)\s+(?:badge|emblem)|(?:badge|emblem)\s+(tail ?gate)|"
                 r"(?:badge|emblem)\s+boot/tailgate|emblem boot/tailgate|badge)\s*(?:[\[(]\s*(.*?)\s*[\])])?\s*$", l.strip())
    if not m:
        return None
    g = [x for x in m.groups()[:-1] if x]
    part = ("Grille" if g and re.match(r"(?i)grille|front|bonnet", g[0]) else "Boot Lid" if g and re.match(r"(?i)boot", g[0]) else "Tailgate" if g else None)
    if part is None:   # "Badge [..]" / "Emblem Boot/Tailgate [..]" with no clear place: boot/tailgate words decide, else Tailgate (hatch is the common case)
        part = "Boot Lid" if re.search(r"(?i)boot ?lid", l) else "Tailgate" if re.search(r"(?i)boot/tailgate|tailgate|emblem", l) else "Grille"
    x = (m.group(7) or "").strip()
    x = re.sub(r"(?i)'?\blogo\b'?|\bfrt\b|\bfront\b|\bgrille\b", " ", x)
    x = re.sub(r"\s+", " ", x).strip()
    if not x or re.fullmatch(r"(?i)[A-Z]|logo", x):
        x = "LOGO"
    x = x.strip("' ").upper()
    return part + " Badge (" + x + ")"


def final(l):
    if l and re.search(r"(?i)\b(badge|emblem)\b", l):
        b = badge(l)
        if b: return b
    r = _final_rules(l)
    if r is None: return None
    r = title_caps(r)
    return r if r == l or _final_rules(r) == r else (_final_rules(r) or None)


def _final_rules(l):
    for _ in range(5):          # chains: Rear Bootlid Weatherstrip -> Boot Lid Weatherstrip -> Boot Lid Aperture Weatherstrip
        if not l: return l
        for a, b in FINAL:
            if re.match(a, l):
                n = None if b is None else re.sub(a, b, l); break
        else:
            return l
        if n == l: return l
        l = n
    return l
