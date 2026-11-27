"""What the Merimen create form (dsp_clmreg) gets for one case. Pure: no page, no database, no network.

Ported from the owner's create script (tools/mrm-bot/createpar2_sinar.mjs) and playbook 02. The input is what the site's document read
stored in `cases.case_data` (web/src/lib/read-docs.ts), the user's saved details (manager, adjuster) and the workshop that
`PgRepo.claim_workshop_for_case` returned. A case that cannot be entered returns a `SpecError` with a short code, never a guess."""

from __future__ import annotations

import re
from dataclasses import dataclass, field


class SpecError(Exception):
    """The case cannot be entered yet. `code` is short and fixed; `detail` names what is missing and never holds a secret."""

    def __init__(self, code: str, detail: str = ""):
        super().__init__(code)
        self.code, self.detail = code, detail


# Merimen insurer codes: playbook 01 ("Insurers"). Same table as web/src/lib/jev-checks.ts, most specific rule first.
INSURERS: list[tuple[re.Pattern, str, str]] = [
    (re.compile(r"etiqa.*takaful|takaful.*etiqa|maybank.*takaful", re.I), "Etiqa General Takaful", "9516"),
    (re.compile(r"etiqa|maybank.*general", re.I), "Etiqa General Insurance", "9517"),
    (re.compile(r"zurich.*takaful|takaful.*zurich", re.I), "Zurich General Takaful", "9616"),
    (re.compile(r"zurich", re.I), "Zurich General Insurance", "70"),
    (re.compile(r"allianz", re.I), "Allianz", "35"),
    (re.compile(r"liberty", re.I), "Liberty", "61"),
    (re.compile(r"ikhlas", re.I), "Takaful Ikhlas", "1713"),
    (re.compile(r"takaful\s+malaysia|syarikat\s+takaful", re.I), "Syarikat Takaful Malaysia Am", "72"),
    (re.compile(r"generali", re.I), "Generali", "37"),
    (re.compile(r"sompo", re.I), "Berjaya Sompo", "32"),
    (re.compile(r"msig", re.I), "MSIG", "44"),
    (re.compile(r"\brhb\b", re.I), "RHB", "67"),
    (re.compile(r"tokio", re.I), "Tokio Marine", "64"),
    (re.compile(r"\baig\b", re.I), "AIG", "29"),
    (re.compile(r"pacific\s*(?:&|and)\s*orient|\bp\s*&\s*o\b", re.I), "Pacific & Orient", "38"),
    (re.compile(r"the\s+pacific|pacific\s+insurance", re.I), "The Pacific", "57"),
]

# Liberty files by region, from the accident place (a branch "HQ" fails the create with VDV9302). Same rules as jev-checks.ts.
LIBERTY_REGIONS: list[tuple[str, re.Pattern]] = [
    ("East Coast", re.compile(r"terengganu|pahang|kelantan|kuantan|kuala\s+terengganu|kota\s+bharu", re.I)),
    ("East Malaysia", re.compile(r"sabah|sarawak|labuan|kuching|kota\s+kinabalu|\bmiri\b|\bsibu\b", re.I)),
    ("Klang Valley", re.compile(r"selangor|kuala\s+lumpur|\bkl\b|putrajaya|petaling|shah\s+alam|\bklang\b|subang|cheras|kajang|gombak", re.I)),
    ("Northern", re.compile(r"penang|pulau\s+pinang|kedah|perlis|\bperak\b|ipoh|alor\s+setar|butterworth|georgetown", re.I)),
    ("Southern", re.compile(r"johor|melaka|malacca|negeri\s+sembilan|seremban|johor\s+bahru|\bjb\b", re.I)),
]

COMPANY = re.compile(r"sdn\.?\s*bhd|\bbhd\b|berhad|\bplt\b|\bltd\b|enterprise|trading|resources|holdings|\bco\.", re.I)


def insurer_of(text: str) -> tuple[str, str] | None:
    for rx, name, coid in INSURERS:
        if rx.search(text or ""):
            return name, coid
    return None


def liberty_region(place: str) -> str | None:
    hit = [name for name, rx in LIBERTY_REGIONS if rx.search(place or "")]
    return hit[0] if len(hit) == 1 else None


def fmt_ic(raw: str) -> str:
    """12 digits -> 123456-12-1234 (the way Merimen shows it); anything else as typed, "-" when empty."""
    digits = re.sub(r"[^0-9]", "", raw or "")
    if len(digits) == 12:
        return f"{digits[:6]}-{digits[6:8]}-{digits[8:]}"
    return (raw or "").strip() or "-"


def date_dmy(iso: str) -> str | None:
    m = re.search(r"(\d{4})-(\d{2})-(\d{2})", iso or "")
    if m:
        return f"{m.group(3)}/{m.group(2)}/{m.group(1)}"
    m = re.search(r"(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})", iso or "")
    return f"{int(m.group(1)):02d}/{int(m.group(2)):02d}/{m.group(3)}" if m else None


def hour_of(text: str) -> str | None:
    """The hour of an accident date-time ("2026-09-07 21:30", "07/09/2026 9.30 PM"). None when there is no time in it."""
    t = re.sub(r"\d{4}-\d{2}-\d{2}|\d{1,2}[/.-]\d{1,2}[/.-]\d{4}", " ", text or "")
    m = re.search(r"(\d{1,2})\s*[:.hH]\s*(\d{2})\s*([AaPp]\.?[Mm])?", t)
    if not m:
        return None
    h = int(m.group(1))
    ap = (m.group(3) or "").lower().replace(".", "")
    if ap == "pm" and h < 12:
        h += 12
    if ap == "am" and h == 12:
        h = 0
    return f"{h:02d}" if 0 <= h <= 23 else None


def loss_text(impact: str) -> str:
    """mleLossDesc. The Adjuster Report step sets the real circumstances later (and clears this first), so an unknown impact
    gets a neutral line, never a guessed direction."""
    i = (impact or "").lower()
    if re.search(r"rear", i):
        d = "REAR"
    elif re.search(r"^front$|front(?!.*side)|head\s*on", i):
        d = "ON"
    elif re.search(r"side|corner", i):
        d = "SIDE"
    else:
        return "COLLISION (INSURED HIT TP)"
    return f"COLLISION- HEAD TO {d} (INSURED HIT TP)"


def polcover_rx(cover_type: str) -> str:
    c = (cover_type or "").lower()
    if re.search(r"fire|theft|tpft", c):
        return "Fire|TPFT"
    if re.search(r"third|\btp\b", c):
        return "^Third Party"
    return "Comprehensive"  # playbook 01: nothing said -> Comprehensive, don't ask


def is_company(name: str, ident: str = "") -> bool:
    """A company owner: the name says so (Sdn Bhd, Berhad, Enterprise ...). The ID number is not looked at."""
    return bool(COMPANY.search(name or ""))


def make_and_model(rc_model: str) -> tuple[str, str]:
    """"PERODUA / MYVI - 1500 SE (AUTO)" -> ("PERODUA", "MYVI - 1500 SE (AUTO)"). No " / ": the first word is tried as the make."""
    t = re.sub(r"\s+", " ", rc_model or "").strip()
    tight = re.match(r"^([A-Za-z\-]{4,12})/(.+)$", t)  # "PERODUA/MYVI": a make written tight; "D/C" inside a model is not a make separator
    sp = re.split(r"\s+/\s+", t, maxsplit=1) if re.search(r"\s/\s", t) else (list(tight.groups()) if tight else [t])
    if len(sp) == 2:
        a, b = sp
        make, model = a.strip().upper(), b.strip()
    else:
        two = " ".join(t.split(" ")[:2]).upper()
        if two in ("MERCEDES BENZ", "LAND ROVER", "ALFA ROMEO", "ASTON MARTIN", "ROLLS ROYCE"):
            make, model = two, " ".join(t.split(" ")[2:]).strip() or t
        else:
            first, _, rest = t.partition(" ")
            make, model = first.upper(), rest.strip() or t
    if make in ("MERCEDES BENZ", "MERCEDES"):  # playbook 12 rule 7: the RC make is not always Merimen's make
        make = "MERCEDES-BENZ"
    elif make == "BMW" and model.upper().startswith("MINI"):
        make, model = "MINI", model[4:].strip()
    return make, model


@dataclass(frozen=True)
class Spec:
    plate: str
    insurer: str
    ins_coid: str
    branch_match: str  # regex on the branch option text
    acc_date: str  # dd/mm/yyyy
    acc_hour: str  # "21"
    client: dict
    veh: dict
    atfault: dict
    polcover: str
    loss: str
    manager: str
    adjuster: str
    workshop_slot: int = 1
    workshop_name: str = ""
    warnings: tuple[str, ...] = field(default_factory=tuple)


def _p(d, *keys):
    for k in keys:
        d = (d or {}).get(k) if isinstance(d, dict) else None
    return d


def _s(v) -> str:
    return re.sub(r"\s+", " ", v).strip() if isinstance(v, str) else ""


def build_spec(case_data: dict | None, plate: str, profile: dict | None, workshop: dict | None) -> Spec:
    d = case_data or {}
    prof = profile or {}
    manager, adjuster = _s(prof.get("manager")), _s(prof.get("adjuster"))
    if not manager or not adjuster:
        raise SpecError("profile_incomplete", "manager and adjuster")
    if not workshop or not _s(workshop.get("name")):
        raise SpecError("workshop_missing", "the case's workshop has no name")
    plate = _s(plate or d.get("plate")).upper().replace(" ", "")
    veh = d.get("client_vehicle") or {}
    owner = veh.get("owner") or {}
    police = d.get("police") or {}
    af = d.get("at_fault") or {}
    pol = af.get("policy") or {}
    miss = [k for k, v in (
        ("plate", plate), ("client name", _s(owner.get("name"))), ("client NRIC", _s(owner.get("nric"))), ("chassis", _s(veh.get("chassis_no"))),
        ("vehicle model", _s(veh.get("model"))), ("accident date", date_dmy(_s(police.get("accident_datetime")))),
        ("at-fault policy", _s(pol.get("policy_no"))), ("at-fault insurer", _s(pol.get("insurer"))),
        ("policy start", date_dmy(_s(pol.get("effective")))), ("policy end", date_dmy(_s(pol.get("expiry")))),
        ("at-fault plate", _s(af.get("plate") or police.get("blamed_plate"))),
        ("at-fault owner or driver", _s((af.get("owner") or {}).get("name")) or _s((af.get("driver") or {}).get("name"))),
    ) if not v]
    if miss:
        raise SpecError("missing_data", ", ".join(miss))
    hour = hour_of(_s(police.get("accident_datetime")))
    if hour is None:
        raise SpecError("missing_data", "accident time")
    ins = insurer_of(_s(pol.get("insurer")))
    if ins is None and re.search(r"lonpac", _s(pol.get("insurer")), re.I):
        # playbook 02: Lonpac cases cannot be deleted in Merimen, the spare Lonpac case is reused by hand instead of making a new one
        raise SpecError("insurer_lonpac", "reuse the spare Lonpac case (playbook 02), do not create a new one")
    if ins is None:
        raise SpecError("insurer_unknown", _s(pol.get("insurer"))[:80])
    ins_name, coid = ins
    warnings: list[str] = []
    branch = "HQ|Head"
    if ins_name == "Liberty":
        reg = liberty_region(_s(police.get("place")))
        if reg is None:
            raise SpecError("liberty_branch", "cannot tell the Liberty region from the accident place")
        branch = "^" + re.escape(reg)
    cp = d.get("client_policy") or {}
    cli_ins = insurer_of(_s(cp.get("insurer"))) if cp else None
    cli_pol = _s(cp.get("policy_no")) if cp else ""
    if cp and (_s(cp.get("insurer")) or cli_pol) and (cli_ins is None or not cli_pol):
        # playbook 02: the claimant's own insurance is mandatory whenever the bundle has it. Blank would be rejected or would wrongly say "none".
        raise SpecError("client_insurance", "the claimant's insurer or policy number is not usable: " + (_s(cp.get("insurer"))[:60] or "no insurer"))
    own_ins = (cli_ins[1], cli_pol) if cli_ins and cli_pol else None
    imp = ""
    for src in (d, police, d.get("accident") or {}):
        if isinstance(src, dict) and isinstance(src.get("impact"), str) and src["impact"].strip():
            imp = src["impact"]
            break
    atowner = af.get("owner") if _s((af.get("owner") or {}).get("name")) and _s((af.get("owner") or {}).get("nric")) else af.get("driver") or af.get("owner") or {}
    reg_date = date_dmy(_s(veh.get("registration_date")))
    make, rc_model = make_and_model(_s(veh.get("model")))
    cn = _s(owner.get("name")).upper()
    cid = _s(owner.get("nric"))
    return Spec(
        plate=plate, insurer=ins_name, ins_coid=coid, branch_match=branch,
        acc_date=date_dmy(_s(police.get("accident_datetime"))) or "", acc_hour=hour,
        client={"name": cn, "nric": cid, "phone": re.sub(r"[^0-9]", "", _s(owner.get("phone"))), "is_company": is_company(cn, cid),
                "policy": own_ins[1] if own_ins else "", "ins_coid": own_ins[0] if own_ins else ""},
        veh={"make": make, "rc_model": rc_model, "cc": (re.search(r"\d{3,5}", _s(veh.get("cc")).replace(",", "")) or [""])[0], "body": _s(veh.get("body_type")), "chassis": _s(veh.get("chassis_no")).upper(),
             "reg_date": reg_date or "", "year": (re.search(r"(?:19|20)\d{2}", _s(veh.get("year_body"))) or [(reg_date or "")[-4:]])[0]},
        atfault={"plate": _s(af.get("plate") or police.get("blamed_plate")).upper().replace(" ", ""), "policy": _s(pol.get("policy_no")),
                 "from": date_dmy(_s(pol.get("effective"))) or "", "to": date_dmy(_s(pol.get("expiry"))) or "",
                 "is_cover_note": bool(_s(pol.get("cover_note_no"))) and _s(pol.get("cover_note_no")) == _s(pol.get("policy_no")) or bool(re.match(r"AEK[TN]", _s(pol.get("policy_no")), re.I)),
                 "owner_name": _s(atowner.get("name")).upper(), "owner_id": _s(atowner.get("nric")),
                 "owner_is_company": is_company(_s(atowner.get("name")), _s(atowner.get("nric")))},
        polcover=polcover_rx(_s(pol.get("cover_type"))), loss=loss_text(imp),
        manager=manager, adjuster=adjuster,
        workshop_slot=int(workshop.get("slot") or 1), workshop_name=_s(workshop.get("name")),
        warnings=tuple(warnings),
    )
