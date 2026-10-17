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
    (r"^\[outer\] (Lamp Assembly Rear (LH|RH) \(tts\))$", r"\1"),                     # 3 same
    (r"^(Lamp Assembly Rear (LH|RH) \(tts\)) \[outer\]$", r"\1"),
    (r"^Bumper Front Reinforcement Panel$", "Front Bumper Reinforcement"),            # 5 same
    (r"^Bumper Rear Reinforcement Panel$", "Rear Bumper Reinforcement"),
    (r"^Size Of The Tyre$", "Tyre Size"),                                             # 6
    (r"^Runningboard Panel Outer (LH|RH)$", r"Runningboard Panel \1"),                # 8 same
    (r"^Centre Pillar (LH|RH)$", r"Centre Pillar Outer \1"),                          # 9 same
    (r"^(DASHBOARD VIEW|Dashboard Panel)$", "DASHBOARD"),                             # 10 same
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
    (r"^Door (Front|Rear) Outer Weatherstrip (LH|RH)$", r"Door \1 Weatherstrip \2"),  # 19 same
    (r"^(BUMPER REAR LOWER|BUMPER RR LOWER COVER)$", "Bumper Rear Lower Cover"),      # 20
    (r"^Lamp Assembly Rear Outer$", "Lamp Assembly Rear"),                            # 21 same
    (r"^Bodyside (Rear )?Assembly (LH|RH)$", r"Bodyside \1\2"),                       # A-group
    (r"^Air Filter Assembly$", "Air Filter Assy"),
]
# kept DIFFERENT by the user: Rear Lamp RH vs Rear Lamp Outer RH (2); Rear Bumper Sensor RH vs ...Outer RH (4);
# Front Panel Upper vs Front Panel Upper Cover (7: the cover is the plastic on top of the upper panel)

def final(l):
    if not l: return l
    for a, b in FINAL:
        if re.match(a, l):
            return None if b is None else re.sub(a, b, l)
    return l
