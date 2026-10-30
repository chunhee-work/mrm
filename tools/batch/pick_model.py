#!/usr/bin/env python3
"""Speed-up 3: pick the Merimen model variant from the RC data (playbook 02 "Vehicle model").

  python3 pick_model.py <model_opts.json> <case.json>     # one case: case = {"make","rcModel","cc","transmission","body","jpjReg"}
  python3 pick_model.py test                               # accuracy test against batch 3 + 4 (known answers)

Order (02): TRIM -> engine + body + transmission -> date bracket containing the registration date -> green.
Returns the best option + score + the top 3, and "UNSURE" when the top two are too close or nothing fits —
then Claude checks it by hand (as before).
"""
import json, os, re, sys

SYN = {"AV": ["ADVANCE", "ADVANCED", "AV"], "ADVANCE": ["ADVANCE", "ADVANCED", "AV"], "BASE": ["B-LINE", "BASE"],
       "BASELINE": ["B-LINE", "BASE LINE"], "HIGH": ["GLS", "HIGH"], "STD": ["STANDARD"], "STANDARD": ["STANDARD"]}
STOP = {"AUTO", "AUTOMATIK", "AUTOMATIC", "MANUAL", "CVT", "AT", "MT", "L", "I-VTEC", "IVTEC", "VVT", "DOHC", "2WD", "4WD", "TURBO"}


def toks(s):
    return [t for t in re.findall(r"[A-Z0-9][A-Z0-9\-+.]*", s.upper())]


def bracket(t):
    m = re.search(r"\[(\d\d)/(\d\d)-(?:(\d\d)/(\d\d))?\]", t)
    if not m:
        return None
    a = 2000 + int(m.group(2)) if int(m.group(2)) < 50 else 1900 + int(m.group(2))
    s = (a, int(m.group(1)))
    e = None
    if m.group(3):
        b = 2000 + int(m.group(4)) if int(m.group(4)) < 50 else 1900 + int(m.group(4))
        e = (b, int(m.group(3)))
    return s, e


def score(opt, c):
    t = opt["t"]; T = t.upper(); sc = 0.0; why = []
    rc = re.sub(r"^[A-Z]+\s*/\s*", "", c["rcModel"].upper())          # drop "PERODUA / "
    rct = [x for x in toks(rc) if x not in STOP]
    fam = rct[0] if rct else ""
    while fam in ("MAZDA", "TOYOTA", "HONDA", "PROTON", "PERODUA", "MINI", "BMW", "NISSAN", "MITSUBISHI") and len(rct) > 1:   # "BMW / MINI COOPER S" -> COOPER
        rct = rct[1:]; fam = rct[0]
    if not T.startswith(fam.replace("-", "-")) and fam not in T.split()[0:2]:
        return -99, ["family"]
    sc += 10; why.append("family")
    # engine size
    m = re.search(r"(?:Sal|Hatch|SUV|MPV|Van|Cab|Wagon|Coupe|Pickup|Conv)\.?\s+(\d(?:\.\d+)?)\s", t)
    if m and c.get("cc"):
        d = abs(float(m.group(1)) - int(c["cc"]) / 1000)
        sc += 4 if d <= 0.06 else (1 if d <= 0.15 else -6); why.append(f"eng{d:.2f}")
    # body
    if c.get("body"):
        b = c["body"].upper()
        if ("4 DR" in b and "4 DR" in T) or ("5 DR" in b and ("5 DR" in T or "HATCH" in T)) or ("MPV" in b and "MPV" in T) or ("SUV" in b and "SUV" in T):
            sc += 2; why.append("body")
        elif re.search(r"\d DR", b) and re.search(r"\d DR", T):
            sc -= 3
    # transmission
    tr = (c.get("transmission") or "").upper() + " " + rc
    want = "M" if re.search(r"MANUAL|\(M\)|\bMT\b", tr) else ("A" if re.search(r"AUTO|CVT|\bAT\b|\(A\)", tr) else None)
    if want:
        if f"({want})" in T or (want == "A" and "CVT" in T):
            sc += 3; why.append("trans")
        elif re.search(r"\((A|M)\)", T):
            sc -= 4
    # trim words (everything in the RC model after the family, minus engine/transmission words)
    trims = []
    for x in rct[1:]:
        g = re.match(r"^\d(?:\.\d+)?L?([A-Z]+)$", x)          # "1.5G" -> G
        if g and g.group(1) not in STOP and g.group(1) != "L":
            trims.append(g.group(1))
        elif not re.match(r"^\d", x) and x not in STOP:
            trims.append(x)
    if not re.search(r"EXECUTIVE|PREMIUM|PREMIER|SPORT|ELITE|LIMITED|HIGH", rc):   # RC names no upper trim -> prefer the base trim (Saga KER815/TBE8692: Standard)
        if re.search(r"\b(STANDARD|STD|BASE|B-LINE|N-LINE)\b", T):
            sc += 2; why.append("base-trim")
        elif re.search(r"\b(EXECUTIVE|PREMIUM|PREMIER|SPORT|ELITE|LIMITED)\b", T):
            sc -= 1
    for w in trims:
        alts = SYN.get(w, [w])
        if any(re.search(r"(?<![A-Z])" + re.escape(a) + r"(?![A-Z])", T) for a in alts):
            sc += 5; why.append("trim:" + w)
    # date bracket containing the registration date
    br = bracket(t); reg = c.get("jpjReg", "")
    if br and re.match(r"\d\d/\d\d/\d{4}", reg):
        y, mo = int(reg[6:]), int(reg[3:5]); s, e = br
        inside = (y, mo) >= s and (e is None or (y, mo) <= e)
        sc += 4 if inside else -5; why.append("date" if inside else "date-out")
    # model-name generation "2001 To 2018" / "2021 On" must contain the manufacture year (RC Tahun Dibuat)
    g = re.search(r"\b(19|20)(\d\d) (To (19|20)(\d\d)|On)\b", t)
    if g and c.get("year"):
        y0 = int(g.group(1) + g.group(2)); y1 = int(g.group(4) + g.group(5)) if g.group(4) else 2100; yr = int(str(c["year"])[:4])
        if y0 <= yr <= y1:
            sc += 2; why.append("gen")
        else:
            sc -= 4; why.append("gen-out")
    if opt.get("c", "").endswith("1"):
        sc += 1; why.append("green")
    return sc, why


def pick(opts, c):
    cands = sorted(((score(o, c), o) for o in opts.get(c["make"].upper(), []) if o.get("t")), key=lambda x: -x[0][0])
    if not cands or cands[0][0][0] < 12:
        return {"pick": None, "status": "UNSURE", "top": [(o["t"], s[0]) for s, o in cands[:3]]}
    (s1, w1), o1 = cands[0]
    s2 = cands[1][0][0] if len(cands) > 1 else -99
    st = "OK" if s1 - s2 >= 2 else "UNSURE"
    return {"pick": o1["v"], "text": o1["t"], "score": s1, "why": w1, "status": st, "top": [(o["t"], s[0]) for s, o in cands[:3]]}


def test():
    H = os.path.expanduser("~/mrm-bot"); opts = json.load(open(os.path.join(H, "model_opts_sinar.json")))
    cases = []
    for cf, rf in (("cases_b3.json", "report_b3.json"), ("cases_b4.json", "report_b4.json")):
        C = json.load(open(os.path.join(H, cf))); R = json.load(open(os.path.join(H, rf)))
        for p, d in C.items():
            v = d["veh"]
            if not v.get("modelValue") or p not in R:
                continue
            cases.append((p, {"make": v["make"], "rcModel": v.get("rcModel", ""), "cc": v.get("cc", ""), "transmission": v.get("transmission", ""),
                              "body": v.get("body", ""), "jpjReg": R[p]["veh"].get("jpjReg", ""), "year": v.get("year") or R[p]["veh"].get("manYear", "")}, v["modelValue"]))
    ok = unsure_right = wrong = 0
    for p, c, truth in cases:
        r = pick(opts, c)
        right = r["pick"] == truth
        tt = next((o["t"] for o in opts.get(c["make"].upper(), []) if o["v"] == truth), "?")
        if right and r["status"] == "OK":
            ok += 1; tag = "OK     "
        elif right:
            unsure_right += 1; tag = "UNSURE+"
        else:
            wrong += 1; tag = "WRONG  " if r["status"] == "OK" else "UNSURE-"
        print(f"{tag} {p:8} RC {c['rcModel'][:34]:34} -> {str(r.get('text'))[:60]:60} | truth {tt[:60]}")
    print(f"\n{len(cases)} cases: {ok} right & sure, {unsure_right} right but flagged unsure, {wrong} not right (of which flagged unsure = safe)")


if __name__ == "__main__":
    if sys.argv[1] == "test":
        test()
    else:
        print(json.dumps(pick(json.load(open(sys.argv[1])), json.load(open(sys.argv[2]))), indent=1))
