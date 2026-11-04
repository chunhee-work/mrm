#!/usr/bin/env python3
"""Local price/knowledge lookup for the Merimen part-price DB. Pure local, no network.
Usage:
  price_lookup.py model <keyword>   # show price block(s) for matching model+year
  price_lookup.py part <keyword>    # show a part's price across all models (compare)
  price_lookup.py part <keyword> --model <kw>   # same, only models matching <kw> (e.g. "PERODUA Myvi 2017")
  price_lookup.py ref <part> --model "<Merimen model text>"   # ONE recommended price: same model -> same brand -> all (user 2026-10-31)
  price_lookup.py brands [brand]    # brand -> model family -> number of cases (what the data covers)
  price_lookup.py models [keyword]  # list model names (optionally filtered)
  price_lookup.py                   # interactive
"""
import sys, os, re

# locate the data file
CANDIDATES = [
    os.path.expanduser("~/.claude/projects/-Users-chunhee-Projects-gacha-smm-playbook-mrm/memory/merimen-part-prices-data.md"),
    os.path.join(os.path.dirname(__file__), "merimen-part-prices-data.md"),
]
DATA = next((p for p in CANDIDATES if os.path.exists(p)), None)

def load():
    if not DATA:
        sys.exit("data file not found; edit CANDIDATES in this script")
    txt = open(DATA, encoding="utf-8").read()
    blocks = []
    for m in re.finditer(r"^## (.+?)\s*\(case ([^)]+)\)\s*\n(.*?)(?=^## |\Z)", txt, re.S | re.M):
        model, case, body = m.group(1).strip(), m.group(2).strip(), m.group(3)
        parts, totals = [], ""
        for line in body.splitlines():
            line = line.strip()
            if line.startswith("- **Totals:**"):
                totals = line.replace("- **Totals:**", "").strip()
            elif line.startswith("- "):
                cells = [c.strip() for c in line[2:].split("|")]
                parts.append(cells)  # [item, partno, price] or [item, price]
        blocks.append({"model": model, "case": case, "parts": parts, "totals": totals})
    return blocks

def show_model(blocks, kw):
    kw = kw.lower()
    hits = [b for b in blocks if kw in b["model"].lower()]
    if not hits:
        print(f"(no model matches '{kw}')"); return
    print(f"== {len(hits)} model(s) match '{kw}' ==\n")
    for b in hits[:12]:
        print(f"## {b['model']}   (case {b['case']})")
        for c in b["parts"]:
            print("   " + " | ".join(c))
        if b["totals"]: print("   Totals: " + b["totals"])
        print()
    if len(hits) > 12: print(f"... {len(hits)-12} more; refine the keyword.")

# price tiers (user approved 2026-10-31): brands in one tier may share item prices when the model and brand have no row
TIERS = {
    "T1 national / budget": "PERODUA PROTON INOKOM NAZA HICOM",
    "T2 Japanese / Korean mainstream": "TOYOTA HONDA NISSAN MAZDA MITSUBISHI HYUNDAI KIA SUZUKI DAIHATSU SUBARU ISUZU",
    "T3 European / American mainstream": "VOLKSWAGEN FORD PEUGEOT CHEVROLET CITROEN RENAULT SSANGYONG",
    "T4 Chinese premium / EV": "BYD DENZA ZEEKR XPENG SMART",            # user 2026-10-31: Chinese brands split in two
    "T4b Chinese budget": "CHERY GREAT_WALL GWM HAVAL ORA CHANGAN JAECOO OMODA NETA MG GEELY",
    "T5 luxury": "MERCEDES-BENZ BMW LEXUS AUDI VOLVO MINI LAND_ROVER TESLA",
    "T6 super luxury": "PORSCHE BENTLEY MASERATI",
    "T7 commercial / lorry / bus / van": "HINO KING_LONG DONG_FENG FOTON UD YANGTSE SKS FARID LMG",
    "motorcycle": "YAMAHA MODENAS SYM",
}
TIER_OF = {b.replace("_", " "): t for t, bs in TIERS.items() for b in bs.split()}
# user 2026-10-31: the tier follows the VEHICLE, not only the brand — Isuzu D-Max / MU-X (normal car) = T2, an Isuzu lorry = T7;
# any lorry / truck / bus (Mitsubishi Fuso, Toyota Dyna, Inokom Lorimas …) = T7
COMMERCIAL = re.compile(r"\b(LORRY|TRUCK|BUS|N-?SERIES|ELF|FUSO|CANTER|DYNA|LORIMAS|NPR\w*|NKR\w*|NHR\w*|NLR\w*|NQR\w*|FRR\w*|FVR\w*|FVZ\w*|\d+(\.\d+)? ?TON)\b", re.I)

# user 2026-10-31 ("yes for 2"): high-end Japanese / Korean models get their own tier between T2 and T5
T2P = re.compile(r"\b(ALPHARD|VELLFIRE|ESTIMA|HARRIER|CAMRY|CROWN|LAND ?CRUISER|PRADO|ACCORD|ODYSSEY|LEGEND|TEANA|ELGRAND|MURANO|CX-?8|CX-?9|PALISADE|CARNIVAL|STARIA)\b", re.I)

# user 2026-11-04 (Mazda 3 Rear Wheelhouse priced from the whole T2 median = too cheap): inside the tier, compare first with cars
# of the SAME CLASS (segment / body) and a NEWER generation (model year - 10 or later), then the same class, then the whole tier.
SEG = [
    ("A/B small", r"\b(MYVI|AXIA|BEZZA|VIVA|KANCIL|KELISA|KENARI|SAGA|IRIZ|PERSONA|WIRA|ISWARA|VIOS|YARIS|CITY|JAZZ|ALMERA|MARCH|LIVINA|MAZDA ?2|SWIFT|CELERIO|ATTRAGE|MIRAGE|I10|I20|ACCENT|PICANTO|RIO|BRIO)\b"),
    ("C compact", r"\b(MAZDA ?3|AXELA|CIVIC|COROLLA|ALTIS|SYLPHY|PULSAR|ELANTRA|CERATO|FORTE|LANCER|IMPREZA|PREVE|SUPRIMA|INSPIRA|WAJA|GEN-?2|FOCUS|GOLF|JETTA)\b"),
    ("D large", r"\b(MAZDA ?6|ATENZA|CAMRY|ACCORD|TEANA|SONATA|OPTIMA|K5|PERDANA|PASSAT)\b"),
    ("SUV", r"\b(CX-?\d+|HR-?V|CR-?V|BR-?V|WR-?V|X-?TRAIL|KICKS|RAV ?4|COROLLA CROSS|FORTUNER|HARRIER|ATIVA|ARUZ|X50|X70|X90|TUCSON|SANTA ?FE|KONA|CRETA|SPORTAGE|SORENTO|SELTOS|OUTLANDER|ASX|PAJERO|FORESTER|XV|MU-?X|VITARA|JIMNY)\b"),
    ("MPV", r"\b(ALZA|ARUZ|EXORA|ERTIGA|AVANZA|VELOZ|INNOVA|SIENTA|WISH|ESTIMA|ALPHARD|VELLFIRE|ODYSSEY|STREAM|FREED|SERENA|GRAND LIVINA|STAREX|STARIA|CARNIVAL|CARENS|XPANDER|PREMIO|ISIS)\b"),
    ("pickup", r"\b(HILUX|NAVARA|TRITON|D-?MAX|RANGER|BT-?50)\b"),
]
def seg_of(model):
    m = re.sub(r"^\[OURS[^\]]*\]\s*", "", model or "").upper()
    return next((n for n, rx in SEG if re.search(rx, m)), None)
# lookup-only name variants (prices only; the estimate row keeps the photo name)
PRICE_ALIAS = [(r"^rear wheelhouse", "wheel house inner rear"), (r"^wheel arch inner rear", "wheel house inner rear"), (r"^front wheelhouse", "wheel house inner front")]

def tier_of(model):
    if COMMERCIAL.search(model): return "T7 commercial / lorry / bus / van"
    t = TIER_OF.get(brand_of(model))
    if t and t.startswith("T2") and T2P.search(model): return "T2+ Japanese / Korean premium"
    return t

def brand_of(model):
    w = re.sub(r"^\[OURS[^\]]*\]\s*", "", model).upper().split()
    if not w: return ""
    two = " ".join(w[:2])
    return two if two in TIER_OF else w[0]

def fam(model):
    w = re.sub(r"^\[OURS[^\]]*\]\s*", "", model).split()
    return " ".join(w[:3] if w and w[0] in ("LAND", "GREAT", "MERCEDES-BENZ") and len(w) > 2 and w[0] != "MERCEDES-BENZ" else w[:2])

def show_part(blocks, kw, mkw=None):
    kw = kw.lower()
    rows = []
    if mkw:
        blocks = [b for b in blocks if all(t in b["model"].lower() for t in mkw.lower().split())]
        print(f"(only models matching '{mkw}': {len(blocks)} case blocks)")
    for b in blocks:
        for c in b["parts"]:
            if kw in c[0].lower():
                price = c[-1]
                rows.append((price, c[0], b["model"]))
    if not rows:
        print(f"(no part matches '{kw}')"); return
    # numeric sort
    def num(p):
        try: return float(p.replace(",", ""))
        except: return 0.0
    rows.sort(key=lambda r: num(r[0]))
    prices = [num(r[0]) for r in rows if num(r[0])>0]
    print(f"== '{kw}' found in {len(rows)} rows across models ==")
    if prices:
        print(f"   price range RM{min(prices):,.2f} – RM{max(prices):,.2f}  (median RM{sorted(prices)[len(prices)//2]:,.2f})\n")
    by = {}
    for pr, item, model in rows:
        if num(pr) > 0: by.setdefault(fam(model), []).append(num(pr))
    if len(by) > 1:
        print("   by brand + model (cases, median):")
        for f, v in sorted(by.items(), key=lambda x: -len(x[1]))[:15]:
            v.sort(); print(f"     {f:28} {len(v):4}  RM{v[len(v)//2]:,.2f}")
        print()
    for price, item, model in rows[:40]:
        print(f"   RM{price:>10}  {item[:42]:42}  [{model[:44]}]")
    if len(rows) > 40: print(f"   ... {len(rows)-40} more.")

def list_models(blocks, kw=None):
    names = sorted(b["model"] for b in blocks)
    if kw: names = [n for n in names if kw.lower() in n.lower()]
    for n in names: print(n)
    print(f"\n{len(names)} models.")

def ref(blocks, kw, model):
    """user 2026-10-31: never mix all models. Same model (brand + model family, same year generation first) -> median;
    no row for that model -> same brand median; only when the brand has none -> all-model median."""
    def num(p):
        try: return float(p.replace(",", ""))
        except: return 0.0
    kw = kw.lower(); m = re.sub(r"^\[OURS[^\]]*\]\s*", "", model or "").strip()
    f = fam(m).lower(); brand = f.split()[0] if f else ""
    gen = re.search(r"\b((?:19|20)\d\d)\b", m); gen = gen.group(1) if gen else None
    AB = {"frt": "front", "fr": "front", "rr": "rear", "assy": "assembly", "l": "lh", "r": "rh"}
    toks = lambda t: [AB.get(w, w) for w in re.findall(r"[a-z0-9]+", re.sub(r"\[[^]]*\]|\([^)]*\)", " ", t.lower()))]
    for a, b in PRICE_ALIAS:
        kw = re.sub(a, b, kw)
    want = toks(kw)
    def hits(pred):
        rows = [(num(c[-1]), c[0], b["model"]) for b in blocks if pred(b) for c in b["parts"] if num(c[-1]) > 0]
        def match(w2):
            exact = [r for r in rows if sorted(toks(r[1])) == sorted(w2)]          # same words, any order (Door Hinge Front LH = Door Front Hinge LH)
            return exact or [r for r in rows if all(w in toks(r[1]) for w in w2)]  # else: contains all the words
        sw = {"lh": "rh", "rh": "lh"}
        return match(want) or match([sw.get(w, w) for w in want])   # 2026-11-04: the other side's price at the same level beats a looser level
    tiers = []
    if gen: tiers.append((f"same model {f} {gen}", lambda b: fam(b["model"]).lower() == f and gen in b["model"]))
    tiers += [(f"same model {f}", lambda b: fam(b["model"]).lower() == f),
              (f"same brand {brand}", lambda b: fam(b["model"]).lower().split()[:1] == [brand])]
    tier = tier_of(m)
    if tier:
        sg = seg_of(m); yr = int(gen) if gen else None
        yof = lambda b: int(re.search(r"\b((?:19|20)\d\d)\b", b["model"]).group(1)) if re.search(r"\b((?:19|20)\d\d)\b", b["model"]) else 0
        if sg and yr:
            tiers.append((f"same tier, same class {sg}, {yr-10}+", lambda b: tier_of(b["model"]) == tier and seg_of(b["model"]) == sg and yof(b) >= yr - 10))
        if sg:
            tiers.append((f"same tier, same class {sg}", lambda b: tier_of(b["model"]) == tier and seg_of(b["model"]) == sg))
        tiers.append((f"same tier {tier}", lambda b: tier_of(b["model"]) == tier))
    tiers.append(("ALL models (no row in this tier) ⚠️ OTHER TIER - do not use as is, compare same-class cars by hand", lambda b: True))
    for label, pred in tiers:
        h = hits(pred)
        if h:
            v = sorted(x[0] for x in h); med = v[len(v)//2]
            print(f"REF {kw!r}: RM{med:,.2f}  <- median of {len(v)} rows, {label}" + ("   (< 5 rows: flag it)" if len(v) < 5 else ""))
            for x in sorted(h)[:8]:
                print(f"   RM{x[0]:>10,.2f}  {x[1][:42]:42}  [{x[2][:50]}]")
            return med
    print(f"REF {kw!r}: no price anywhere"); return None

def brands(blocks, kw=None):
    t = {}
    for b in blocks:
        f = fam(b["model"]); br = f.split()[0] if f else "?"
        if kw and kw.lower() not in br.lower(): continue
        t.setdefault(br, {}).setdefault(f, 0); t[br][f] += 1
    for br, fs in sorted(t.items(), key=lambda x: -sum(x[1].values())):
        print(f"{br} ({sum(fs.values())} cases): " + ", ".join(f"{f.split(' ',1)[-1]} {n}" for f, n in sorted(fs.items(), key=lambda x: -x[1])))

def main():
    blocks = load()
    args = sys.argv[1:]
    if not args:
        print(f"[local price lookup — {len(blocks)} models loaded]  commands: model <kw> | part <kw> | models [kw] | quit")
        while True:
            try: line = input("> ").strip()
            except EOFError: break
            if line in ("quit","exit","q",""): break
            parts = line.split(None, 1)
            cmd = parts[0]; kw = parts[1] if len(parts)>1 else ""
            if cmd=="model": show_model(blocks, kw)
            elif cmd=="part": show_part(blocks, kw)
            elif cmd=="models": list_models(blocks, kw or None)
            else: show_part(blocks, line)  # default: treat as part search
        return
    mkw = None
    if "--model" in args:
        i = args.index("--model"); mkw = " ".join(args[i+1:]); args = args[:i]
    cmd, kw = args[0], " ".join(args[1:])
    if cmd == "brands":
        return brands(blocks, kw or None)
    if cmd == "part":
        return show_part(blocks, kw, mkw)
    if cmd == "ref":
        return ref(blocks, kw, mkw)
    {"model":show_model, "part":show_part}.get(cmd, lambda b,k: list_models(b, k or None) if cmd=="models" else show_part(b, " ".join(args)))(blocks, kw)

if __name__ == "__main__":
    main()
