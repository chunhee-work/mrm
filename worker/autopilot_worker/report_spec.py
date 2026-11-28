"""What the Adjuster Report (dsp_estmain, playbook 04) gets for one case. Pure: no page, no database, no network.

Ported from the owner's tools/mrm-bot/build_report.py + reportpar.mjs and playbook 04. The input is what the site's document read stored in
`cases.case_data` (web/src/lib/read-docs.ts, with the Adjuster Report fields of PR #121), the case's workshop, and the photo names of the
desk (where our car was hit). Anything the bundle does not hold and the playbook gives no fixed value for stops with a `SpecError`,
never a guess: a wrong report is worse than a report a person finishes."""

from __future__ import annotations

import re
from datetime import date

from .create_spec import SpecError, date_dmy, hour_of, insurer_of, is_company, _s
from .my_postcode import guess_city

DEFAULT_PHONE = "0123456789"  # user rule 2026-08-17: never NOPHONE, a valid MY mobile placeholder

# playbook 04 "State names are the full ones". The reader is told to write them in full; short forms are mapped here.
STATES = {
    "terengganu": "Terengganu Darul Iman", "kedah": "Kedah Darul Aman", "perlis": "Perlis Indera Kayangan", "pahang": "Pahang Darul Makmur",
    "kelantan": "Kelantan Darul Naim", "johor": "Johor Darul Takzim", "perak": "Perak Darul Ridzuan", "selangor": "Selangor Darul Ehsan",
    "negeri sembilan": "Negeri Sembilan Darul Khusus", "melaka": "Melaka", "malacca": "Melaka", "sabah": "Sabah", "sarawak": "Sarawak",
    "kuala lumpur": "Wilayah Persekutuan Kuala Lumpur", "putrajaya": "Wilayah Persekutuan Putrajaya", "labuan": "Wilayah Persekutuan Labuan",
}


def state_name(raw: str) -> str:
    t = _s(raw)
    low = t.lower()
    if not low:
        return ""
    if "pinang" in low or "penang" in low:
        return t if "(" in t else "Pulau Pinang (Island)"  # the reader keeps Island / Mainland when the address says it
    for k, v in STATES.items():
        if low.startswith(k) or low == v.lower():
            return v
    return t


def city_name(raw: str) -> str:
    t = _s(raw)
    return "George Town" if re.fullmatch(r"george\s*town|georgetown", t, re.I) else t


def nric_dob_gender(nric: str, today: date) -> tuple[str, str]:
    """12-digit Malaysian NRIC -> ("dd/mm/yyyy", "Male"/"Female"); anything else ("", "")."""
    n = re.sub(r"[^0-9]", "", nric or "")
    if len(n) != 12:
        return "", ""
    yy, mm, dd = int(n[:2]), int(n[2:4]), int(n[4:6])
    if not (1 <= mm <= 12 and 1 <= dd <= 31):
        return "", ""
    y = 2000 + yy if 2000 + yy <= today.year - 16 else 1900 + yy  # a driver is at least 16
    return f"{dd:02d}/{mm:02d}/{y}", ("Male" if int(n[-1]) % 2 else "Female")


def driving_exp(dob: str, today: date) -> str:
    """playbook 04: driving experience = age - 18 (at least 1). No date of birth: 10, as the owner's script."""
    m = re.match(r"(\d{2})/(\d{2})/(\d{4})$", dob or "")
    if not m:
        return "10"
    d, mo, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
    age = today.year - y - ((today.month, today.day) < (mo, d))
    return str(max(1, min(age - 18, 60)))


def phone(raw: str) -> str:
    p = re.sub(r"[^0-9]", "", raw or "")
    if p.startswith("60"):
        p = "0" + p[2:]
    return p if len(p) >= 9 else DEFAULT_PHONE


def impact_of(names: list[str]) -> str | None:
    """playbook 04: the circumstances follow where OUR car was hit, read from the photos. The desk names (final, else the model's) are counted:
    front / rear / side words. A clear winner, else None (a person picks: never a guessed direction)."""
    score = {"front": 0, "rear": 0, "side": 0}
    for n in names:
        t = (n or "").lower()
        if re.search(r"\b(front|bonnet|grille|grill|radiator|head\s*lamp|headlamp|fog\s*lamp)\b", t):
            score["front"] += 1
        elif re.search(r"\b(rear|tail|boot|trunk|back\s*door|tailgate)\b", t):
            score["rear"] += 1
        elif re.search(r"\b(door|fender|wing|side|quarter|sill|mirror|lh|rh)\b", t):
            score["side"] += 1
    best = sorted(score.items(), key=lambda kv: -kv[1])
    if best[0][1] == 0 or best[0][1] == best[1][1]:
        return None
    # a front corner or side-swipe is "Head to Side" (playbook 04): front with as many side parts is side
    if best[0][0] == "front" and score["side"] >= score["front"] / 2 and score["side"] > 0:
        return "side"
    return best[0][0]


LOSS = {"front": "Head on collision", "rear": "Head to Rear", "side": "Head to Side"}

# Thatcham labour type (ddlbLABTYPE) from the RC body type (playbook 04)
def labour_rx(body: str) -> str | None:
    b = (body or "").lower()
    if re.search(r"mpv|multi\s*purpose|van", b):
        return "MPV"
    if re.search(r"3\s*d(?:r|oor)?\b.*hatch|three\s*door", b):
        return "3 DR HATCH"
    if re.search(r"hatch|5\s*d|five\s*door", b):  # RC "4 Dr Hatch" (Myvi) is a five-door hatch in Thatcham terms
        return "5 DR HATCH"
    if re.search(r"saloon|sedan|4\s*d|four\s*door", b):
        return "4 DR|SALOON"
    if re.search(r"pick\s*up|pickup|double\s*cab|d/c|4x4|suv|wagon|estate", b):
        return "4X4|SUV|ESTATE|PICK"
    return None


def _person(p: dict | None, today: date) -> dict:
    p = p or {}
    nric = _s(p.get("nric"))
    dob = date_dmy(_s(p.get("dob"))) or ""
    gender = _s(p.get("gender")).title()
    ndob, ngender = nric_dob_gender(nric, today)
    dob = dob or ndob
    gender = gender if gender in ("Male", "Female") else ngender
    passport = bool(re.search(r"[A-Za-z]", nric)) and not is_company(_s(p.get("name")))
    addr, state, city = _s(p.get("address")), state_name(_s(p.get("state"))), city_name(_s(p.get("city")))
    postcode = (re.search(r"\b\d{5}\b", _s(p.get("postcode"))) or re.search(r"\b\d{5}\b", addr) or [""])[0]
    guessed = ""
    if not city and (addr or postcode):  # owner 2026-11-28: never stop on a missing city; the guess is said on the case
        city, state, guessed = guess_city(postcode=postcode, state=state, address=addr)
    return {"name": _s(p.get("name")).upper(), "nric": nric, "idType": "Passport" if passport else "NRIC", "dob": dob, "gender": gender,
            "addr": addr or "-", "state": state, "city": city,
            "postcode": postcode, "phone": phone(_s(p.get("phone"))), "cityGuessed": guessed}


def build_report(case_data: dict | None, *, case_id: str, ext_id: str, workshop: dict | None, photo_names: list[str], extras: dict | None = None,
                 today: date | None = None) -> dict:
    """The report JSON reportpar.mjs reads (same keys), for one case. `extras` may carry what only a photo shows: colour, odometer."""
    today = today or date.today()
    d = case_data or {}
    ex = extras or {}
    if not case_id or not ext_id:
        raise SpecError("no_case", "the Merimen case id or ext id is not stored")
    if not workshop or not _s(workshop.get("name")):
        raise SpecError("workshop_missing", "the case's workshop has no name")
    veh = d.get("client_vehicle") or {}
    police = d.get("police") or {}
    af = d.get("at_fault") or {}
    drv = af.get("driver") or af.get("owner")
    own = af.get("owner") if _s((af.get("owner") or {}).get("name")) else drv
    claimant = _person(veh.get("owner"), today)
    clm_driver = _person(d.get("client_driver"), today) if _s((d.get("client_driver") or {}).get("name")) else dict(claimant)
    ins_driver = _person(drv, today)
    insured = _person(own, today)
    for k in ("addr", "state", "city", "postcode"):  # playbook 04: the insured's address = the at-fault party's (same as the insured driver)
        if insured[k] in ("", "-"):
            insured[k] = ins_driver[k]
            if k == "city":
                insured["cityGuessed"] = ins_driver["cityGuessed"]
    loss_state, loss_city = state_name(_s(police.get("loss_state"))), city_name(_s(police.get("loss_city")))
    loss_pc = (re.search(r"\b\d{5}\b", _s(police.get("loss_postcode"))) or [""])[0]
    loss_guessed = ""
    if not loss_city and (loss_pc or _s(police.get("place"))):
        loss_city, loss_state, loss_guessed = guess_city(postcode=loss_pc, state=loss_state, address=_s(police.get("place")))
    guessed = [f"{who} city {p['city']} (from the {p['cityGuessed']})" for who, p in (
        ("at-fault driver", ins_driver), ("insured", insured), ("claimant", claimant), ("claimant driver", clm_driver)) if p.get("cityGuessed")]
    if loss_guessed:
        guessed.append(f"accident city {loss_city} (from the {loss_guessed})")
    miss = [k for k, v in (
        ("police report no", _s(police.get("report_no")).replace(" ", "")),
        ("police report date", date_dmy(_s(police.get("report_datetime"))) or date_dmy(_s(police.get("accident_datetime")))),
        ("accident place", _s(police.get("place"))),
        ("accident state", loss_state), ("accident city", loss_city),
        ("at-fault driver name", ins_driver["name"]), ("at-fault driver NRIC", ins_driver["nric"]),
        ("claimant name", claimant["name"]), ("claimant NRIC", claimant["nric"]),
        ("claimant state", claimant["state"]), ("claimant city", claimant["city"]),
        ("at-fault state", ins_driver["state"]), ("at-fault city", ins_driver["city"]),
        ("engine no", _s(veh.get("engine_no"))), ("JPJ registration date", date_dmy(_s(veh.get("registration_date")))),
        ("cc", (re.search(r"\d{3,5}", _s(veh.get("cc")).replace(",", "")) or [""])[0]),
    ) if not v]
    if miss:
        raise SpecError("missing_data", ", ".join(miss))
    impact = _s(ex.get("impact")).lower() or impact_of(photo_names)
    if impact not in LOSS:
        raise SpecError("impact_unknown", "cannot tell from the photo names where our car was hit (front, rear or side)")
    lab = labour_rx(_s(veh.get("body_type")))
    if lab is None:
        raise SpecError("labour_type_unknown", "the RC body type does not say hatchback, saloon or MPV: " + _s(veh.get("body_type"))[:40])
    colour = _s(ex.get("colour")) or _s(veh.get("colour"))
    if not colour:
        raise SpecError("colour_unknown", "the car colour comes from the photos and is not stored yet")
    odo = re.sub(r"[^0-9]", "", _s(str(ex.get("odometer") or veh.get("odometer") or "")))  # playbook 04: unreadable -> 0
    pol = af.get("policy") or {}
    coid = (insurer_of(_s(pol.get("insurer"))) or ("", ""))[1]
    takaful_my = coid == "72"
    rep_dt = _s(police.get("report_datetime"))
    band = hour_of(rep_dt)
    if band is None:  # the owner's script: two hours after the accident, at most 22:00
        acc = hour_of(_s(police.get("accident_datetime")))
        band = f"{min(int(acc) + 2, 22):02d}" if acc is not None else None
    if band is None:
        raise SpecError("missing_data", "police report time")
    station = _s(police.get("station"))
    town = re.sub(r"^TRAFIK", "", (re.match(r"([A-Z ]+?)/", _s(police.get("report_no")).upper().replace(" ", "")) or ["", ""])[1] or "")
    year = (re.search(r"(?:19|20)\d{2}", _s(veh.get("year_body"))) or [(date_dmy(_s(veh.get("registration_date"))) or "")[-4:]])[0]
    out = {
        "cid": str(case_id), "extid": str(ext_id), "TL": "Yes" if d.get("total_loss") else "No", "adjFile": f"EXT/{case_id}/TP",
        "reserve": "10000.00", "repdays": "25", "inspectAt": _s(workshop.get("name")) + (f", {_s(workshop.get('address'))}" if _s(workshop.get("address")) else ""),
        "police": _s(police.get("report_no")).replace(" ", "").upper(),
        "policeDate": date_dmy(rep_dt) or date_dmy(_s(police.get("accident_datetime"))) or "",
        "policeTimeBand": band,
        "policeStation": station or (f"IPD {town.title()}" if town else ""),
        "stationGuessed": not station,
        "damType": "THIRD PARTY PROPERTY DAMAGE" if takaful_my else "Collision",
        "collType": "Motor Cycle" if re.search(r"motor\s*cycle|motosikal", _s(d.get("notes")), re.I) else "Private",
        "lossDescCat": "Motor Collision" if takaful_my else LOSS[impact], "impact": impact,
        "lossSelect": "Collision" if takaful_my else "",
        "accPlace": _s(police.get("place")), "lossState": loss_state, "lossCity": loss_city,
        "lossPostcode": loss_pc, "cityGuessed": guessed,
        "isCompanyInsured": is_company(insured["name"]),
        "insured": insured,
        "insDriver": {**ins_driver, "exp": driving_exp(ins_driver["dob"], today)},
        "claimant": {**claimant, "isCompany": is_company(claimant["name"])},
        "clmDriver": {**clm_driver, "exp": driving_exp(clm_driver["dob"], today)},
        "veh": {"eng": _s(veh.get("engine_no")).upper(), "jpjLogbook": _s(veh.get("jpj_log_book_no")) or "-",
                "jpjReg": date_dmy(_s(veh.get("registration_date"))) or "", "manYear": year,
                "cc": (re.search(r"\d{3,5}", _s(veh.get("cc")).replace(",", "")) or [""])[0],
                "assembly": veh.get("assembly_type") or "Locally Assembled", "colour": colour, "odo": odo or "0", "labour": lab},
    }
    return out
