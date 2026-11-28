"""Phase A step 2: the Adjuster Report (dsp_estmain). Ported 1:1 from tools/mrm-bot/reportpar.mjs (the owner's proven script) and playbook 04.

It drives the logged-in Merimen tab of the worker Chrome through Playwright. It never types a password, never prints or stores the session
marks, never logs a page address, and opens only the dsp_estmain address of THIS case (caseid + extid it stored when it made the case).

`fill` opens the report in a new tab, fills every field and reads back which required (pink) boxes are still empty. Nothing is saved.
`save` is `fill`, then the owner's save loop: SaveReport(1) ("Save & Adjust Estimates"), OK on Merimen's notice, fill the pink boxes it
names, at most 7 rounds; done only when Merimen lands on dsp_selection (or dsp_details). Saving the same report again overwrites it with the
same values, so a retry cannot make anything twice."""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone

from .create_spec import fmt_ic
from .merimen_create import CLAIMS, pick_person, redact, session_query

MYT = timezone(timedelta(hours=8))
NEVER_SAVES = ("sleTINTBRAND", "mleDATEALTERREASON")  # playbook 04: these stay pink whatever is done; flag, never retry
DONE = ("dsp_selection", "dsp_details")

_T = """({n, v}) => { var e = document.querySelector('[name=' + n + ']'); if (!e) return 0; e.value = v;
  e.dispatchEvent(new Event('input', {bubbles: true})); e.dispatchEvent(new Event('change', {bubbles: true})); return 1; }"""
_SV = """({n, rx}) => { var s = document.querySelector('select[name=' + n + ']'); if (!s) return 0;
  var o = [...s.options].find(x => new RegExp(rx, 'i').test(x.text.trim())); if (!o) return 0;
  s.value = o.value; s.dispatchEvent(new Event('change', {bubbles: true})); if (s.onchange) s.onchange(); return 1; }"""
# Gender must match EXACTLY: "Male" is inside "Female" (playbook 04)
_SVX = """({n, v}) => { var s = document.querySelector('select[name=' + n + ']'); if (!s) return 0;
  var o = [...s.options].find(x => x.text.trim().toLowerCase() === v.toLowerCase()); if (!o) return 0;
  s.value = o.value; s.dispatchEvent(new Event('change', {bubbles: true})); if (s.onchange) s.onchange(); return 1; }"""
_HOUR = """({n, hh}) => { var s = document.querySelector('select[name=' + n + ']');
  if (!s) { var t = document.querySelector('input[name=' + n + ']'); if (!t) return 0; t.value = hh + ':00';
    t.dispatchEvent(new Event('change', {bubbles: true})); if (t.onblur) t.onblur(); return 1; }
  var o = [...s.options].find(x => new RegExp('^' + hh + ':').test(x.text.trim())); if (!o) return 0;
  s.value = o.value; s.dispatchEvent(new Event('change', {bubbles: true})); if (s.onchange) s.onchange(); return 1; }"""
_RADIO = """({n, val}) => { var rs = [...document.querySelectorAll('input[name=' + n + ']')];
  function ta(x) { var t = '', s = x.nextSibling; while (s && t.trim().length < 4) { t += (s.textContent || s.nodeValue || ''); s = s.nextSibling; }
    return (t || x.parentElement.innerText || '').trim(); }
  var w = val.toLowerCase(); var r = rs.find(x => ta(x).toLowerCase().indexOf(w) === 0) || rs.find(x => ta(x).toLowerCase().indexOf(w) >= 0)
    || rs.find(x => x.value.toLowerCase() === (w === 'no' ? '0' : '1'));
  if (r) { r.checked = true; r.click(); r.dispatchEvent(new Event('change', {bubbles: true})); return 1; } return 0; }"""
# phone prefix: "012" or "6012-" depending on the insurer's form (playbook 04)
_PREF = """({n, pp}) => { var s = document.querySelector('select[name=' + n + ']'); if (!s) return 0; var bare = pp.replace(/^0/, '');
  var o = [...s.options].find(x => { var t = (x.text || '').trim().replace(/-$/, ''); return t === pp || t === '60' + bare || t === '6' + pp; });
  if (o) { s.value = o.value; s.dispatchEvent(new Event('change', {bubbles: true})); return 1; } return 0; }"""
_PINK = """(skip) => { function red(e) { var m = (getComputedStyle(e).backgroundColor || '').match(/rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)/); if (!m) return false;
    var r = +m[1], g = +m[2], b = +m[3]; return r > 200 && (r - g > 15 || r - b > 15) && g < 235; }
  var out = []; document.querySelectorAll('input[type=text],input:not([type]),textarea,select').forEach(e => {
    if (e.offsetParent === null || (e.value || '').trim() || !red(e) || skip.indexOf(e.name) >= 0) return; out.push(e.name); });
  return [...new Set(out)]; }"""
# the owner's red-box filler: a pink empty box the map knows gets its value; an unknown pink SELECT is left (never a random option, playbook 04)
_FILL_RED = """(FM) => { var filled = [], unknown = []; function red(e) { var m = (getComputedStyle(e).backgroundColor || '').match(/rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)/);
    if (!m) return false; var r = +m[1], g = +m[2], b = +m[3]; return r > 200 && (r - g > 15 || r - b > 15) && g < 235; }
  document.querySelectorAll('input[type=text],input:not([type]),textarea,select').forEach(e => { if (e.offsetParent === null) return;
    if ((e.value || '').trim() || !red(e)) return; if (FM[e.name] != null && FM[e.name] !== '' && e.tagName !== 'SELECT') { e.value = FM[e.name];
      e.dispatchEvent(new Event('input', {bubbles: true})); e.dispatchEvent(new Event('change', {bubbles: true})); filled.push(e.name); } else unknown.push(e.name); });
  return {filled: filled, unknown: unknown}; }"""
_OK = """() => { var t = [...document.querySelectorAll('input,button')].find(e => ((e.value || e.innerText || '').trim() === 'OK') && e.offsetParent !== null);
  if (!t) return ''; var box = t.closest('[role=dialog],[class*=modal],[class*=dialog],[class*=popup]') || t.parentElement;
  var tx = (box.innerText || '').replace(/\\s+/g, ' ').trim().slice(0, 140);
  if (/are you sure|delete|overwrite|duplicate/i.test(tx)) return 'STOP:' + tx; t.click(); return 'OK:' + tx; }"""
_MSGS = """() => { var o = []; document.querySelectorAll('*').forEach(e => { var t = (e.childNodes[0] && e.childNodes[0].nodeValue || '').trim();
  if (t && /should|required|must|invalid|specified|cannot|please|format/i.test(t) && e.offsetParent !== null && t.length < 130) o.push(t); });
  return [...new Set(o)].slice(0, 8); }"""


@dataclass
class ReportResult:
    ok: bool = False
    code: str = ""
    missing: list[str] = field(default_factory=list)  # pink boxes still empty after the fill (dry run) or after the save rounds
    messages: list[str] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)  # to check by hand after a good save (station typed, IPD code)
    saved: bool = False

    def line(self) -> str:
        bits = []
        if self.code:
            bits.append(self.code)
        if self.missing:
            bits.append("empty required boxes: " + ", ".join(self.missing[:12]))
        if self.messages:
            bits.append("Merimen says: " + " | ".join(redact(m) for m in self.messages)[:240])
        if self.notes:
            bits.append("check by hand: " + "; ".join(self.notes))
        return " ".join(bits)[:400]


class MerimenReport:
    def __init__(self, base_page, *, timeout_scale: float = 1.0, today: str | None = None):
        self.base = base_page
        self.scale = timeout_scale
        self.cur = None
        self.unexpected: list[str] = []
        self.today = today or datetime.now(MYT).strftime("%d/%m/%Y")  # playbook 04: assignment + inspection date = today, Malaysia time

    def _ms(self, ms: int) -> int:
        return max(0, int(ms * self.scale))

    def _w(self, ms: int) -> None:
        self.cur.wait_for_timeout(self._ms(ms))

    def _t(self, n, v):
        return self.cur.evaluate(_T, {"n": n, "v": "" if v is None else str(v)})

    def _sv(self, n, rx):
        return self.cur.evaluate(_SV, {"n": n, "rx": rx})

    def _dialog(self, d) -> None:
        if d.type in ("alert", "beforeunload"):  # playbook 04: any alert -> OK
            d.accept()
            return
        self.unexpected.append(redact((d.message or "")[:120]))  # a question is never answered by the worker
        d.dismiss()

    def close(self) -> None:
        if self.cur is not None:
            try:
                self.cur.close()
            except Exception:  # noqa: BLE001
                pass
            self.cur = None

    def _open(self, D: dict) -> str | None:
        q = session_query(self.base.url)
        if not q:
            return "not_logged_in"
        if not re.fullmatch(r"\d{4,12}", str(D.get("cid") or "")) or not re.fullmatch(r"\d{4,12}", str(D.get("extid") or "")):
            return "no_case"
        self.cur = self.base.context.new_page()
        self.cur.on("dialog", self._dialog)
        self.cur.goto(f"{CLAIMS}?fusebox=MTRadjuster&fuseaction=dsp_estmain&caseid={D['cid']}&extid={D['extid']}&{q}", wait_until="domcontentloaded")
        self._w(4500)
        if self.cur.locator("input[type=password]").count() > 0:
            return "not_logged_in"
        if not self.cur.locator("[name=sleFILENO],[name=slePoliceRef]").count():
            return "report_not_open"
        return None

    def _party(self, pre: str, p: dict, *, company_ok: bool = True) -> None:
        """The fields every party has (playbook 04 "Every party")."""
        T = self._t
        if p.get("dob"):
            T(f"sle{pre}DOB", p["dob"])
        if p.get("gender"):
            self.cur.evaluate(_SVX, {"n": f"sle{pre}Gender", "v": p["gender"]})

    def _phone(self, pref_field: str, num_field: str, raw: str) -> None:
        p = re.sub(r"[^0-9]", "", raw or "")
        if len(p) < 9:
            return
        self.cur.evaluate(_PREF, {"n": pref_field, "pp": p[:3]})
        self._t(num_field, p[3:])

    def fill(self, D: dict) -> ReportResult:
        res = ReportResult()
        try:
            bad = self._open(D)
        except Exception:  # noqa: BLE001  (a Playwright error carries the address: keep only a code)
            bad = "report_error"
        if bad:
            res.code = bad
            return res
        try:
            self._fill(D, res)
            res.missing = [n for n in self.cur.evaluate(_PINK, list(NEVER_SAVES)) if n not in NEVER_SAVES]
            res.ok = not res.missing and not self.unexpected
            if self.unexpected:
                res.code = "unexpected_dialog"
                res.messages = list(self.unexpected)[:2]
            elif res.missing:
                res.code = "report_not_ready"
        except Exception as e:  # noqa: BLE001
            res.ok, res.code = False, "report_error"
            res.messages = [type(e).__name__]
        return res

    def _fill(self, D: dict, res: ReportResult) -> None:
        T, SV, w, cur = self._t, self._sv, self._w, self.cur
        ins, idr, clm, cmd, veh = D["insured"], D["insDriver"], D["claimant"], D["clmDriver"], D["veh"]
        # header (playbook 04 "Header")
        T("sleFILENO", D["adjFile"]); T("sleASGMT", self.today); T("sleINSPECT", self.today); T("sleNUM_REPDAYS", D.get("repdays") or "25")
        T("mleINSPECTAT", D["inspectAt"]); T("sleRESERVE", D["reserve"])
        for sel, who in (("ddlbMGRNAME", D.get("manager")), ("ddlbADJNAME", D.get("adjuster"))):  # playbook 04: as in 02, the user's own names
            opts = cur.evaluate("(n) => { var s = document.querySelector('select[name=' + n + ']'); return s ? [...s.options].map(o => [o.value, o.text.trim()]) : null; }", sel)
            if opts is None:
                continue
            v = pick_person([(a, b) for a, b in opts], who or "")
            if v:
                cur.evaluate("({n, v}) => { var s = document.querySelector('select[name=' + n + ']'); s.value = v; s.dispatchEvent(new Event('change', {bubbles: true})); }", {"n": sel, "v": v})
            elif not cur.evaluate("(n) => { var s = document.querySelector('select[name=' + n + ']'); return !!(s && s.value); }", sel):
                res.notes.append("manager and adjuster")
        # police (playbook 04 "Claim loss / police"); the IPD code is never a random option: a person sets it with Browse
        T("slePoliceRef", D["police"]); T("slePOLICERPTDT", D["policeDate"]); cur.evaluate(_HOUR, {"n": "slePOLICERPTTM", "hh": D["policeTimeBand"]})
        T("vaCDPOLICESTATION", D["policeStation"])
        res.notes.append("police station and PIAM IPD code (Browse)" if D.get("stationGuessed") else "PIAM IPD code (Browse)")
        for g in D.get("cityGuessed") or []:  # a city the bundle did not give, filled from the address or postcode (my_postcode)
            res.notes.append(g)
        SV("ddlbFault", "Third Party"); SV("ddlbDAMTYPE", D.get("damType") or "Collision"); w(1200)
        SV("ddlbCollType", D.get("collType") or "Private"); w(800)
        cat = D["lossDescCat"]
        if cat == "Motor Collision":
            SV("ddlbLossDesc", cat)
        elif not (cat == "Head to Rear" and SV("ddlbLossDesc", "^Collision- Head to Rear.*Insured Hit TP")):  # rear: the "(Insured Hit TP)" one first
            if not SV("ddlbLossDesc", "^Collision- " + cat):
                res.notes.append("circumstances " + cat)
        cur.evaluate("() => { var e = document.querySelector('[name=mleLossDesc]'); if (e && e.tagName !== 'SELECT') e.value = ''; var a = document.querySelector('[name=AddLD]'); if (a) a.click(); }")
        w(600)
        if not cur.evaluate("() => { var e = document.querySelector('[name=mleLossDesc]'); return e ? (e.value || '') : 'x'; }"):
            T("mleLossDesc", "COLLISION- HEAD TO " + {"rear": "REAR", "front": "ON"}.get(D["impact"], "SIDE") + " (INSURED HIT TP)")
        if D.get("lossSelect"):  # Takaful template: mleLossDesc is a SELECT of cause phrases
            cur.evaluate("""(v) => { var s = document.querySelector('[name=mleLossDesc]'); if (s && s.tagName === 'SELECT') { var o = [...s.options].find(x => new RegExp(v, 'i').test(x.text));
              if (o) { s.value = o.value; s.dispatchEvent(new Event('change', {bubbles: true})); if (s.onchange) s.onchange(); } } }""", D["lossSelect"])
        T("sleAccPlace", D["accPlace"]); SV("ddlbLocClaim", "City Road")
        # insured
        if not D.get("isCompanyInsured"):
            T("sleInm", ins["name"])
            if ins["idType"] == "Passport":
                T("sleIID1", ins["nric"]); cur.evaluate("() => { var s = document.querySelector('select[name=sleIID1sel]'); if (s) { s.value = '3'; s.dispatchEvent(new Event('change', {bubbles: true})); } }")
            else:
                T("sleIID1", fmt_ic(ins["nric"]))
        self._party("I", ins)
        T("sleIAddr1", ins["addr"]); SV("ddlbIMARITAL", "Unknown"); T("sleIOCC", "OTHERS"); SV("ddlbIOCC", "Others|Unemployed")
        T("sleITIN", "NA"); T("sleISSTRegNo", "NA"); cur.evaluate(_RADIO, {"n": "sleISSTRegOpt", "val": "No"}); T("sleIEMAIL", "NOEMAIL@GMAIL.COM")
        self._phone("sleIPhone1pref", "sleIPhone1", ins["phone"])
        # insured driver = the at-fault driver
        T("sleDnm", idr["name"])
        T("sleDID1", idr["nric"] if idr["idType"] == "Passport" else fmt_ic(idr["nric"]))
        self._party("D", idr)
        T("sleDAddr1", idr["addr"]); SV("ddlbDMARITAL", "Unknown"); T("sleDOCC", "OTHERS"); SV("ddlbDOCC", "Others|Unemployed")
        T("sleCDDRVEXP", idr["exp"]); SV("ddlbDProvisional", "No"); SV("sleDRelation", "Others"); T("sleDEMAIL", "NOEMAIL@GMAIL.COM")
        self._phone("sleDPhone1pref", "sleDPhone1", idr["phone"])
        # claimant = our client
        if clm.get("isCompany"):
            cur.evaluate("() => { var r = document.querySelector('input[name=sleCLMnmsel][value=\"1\"]'); if (r) { r.checked = true; r.click(); r.dispatchEvent(new Event('change', {bubbles: true})); } }")
            w(1200)
            T("sleCLMnm", clm["name"])
            cur.evaluate("""() => { var s = document.querySelector('select[name=sleCLMID1sel]'); if (s) { var co = [...s.options].find(o => o.value === '1' || /co\\.?\\s*reg|company|business|roc|ssm/i.test(o.text));
              if (co) { s.value = co.value; s.dispatchEvent(new Event('change', {bubbles: true})); if (s.onchange) s.onchange(); } } }""")
            T("sleCLMID1", clm["nric"])
        else:
            T("sleCLMnm", clm["name"]); T("sleCLMID1", fmt_ic(clm["nric"]))
        self._party("CLM", clm)
        T("sleCLMAddr1", clm["addr"]); SV("ddlbCLMMARITAL", "Unknown"); T("sleCLMOCC", "OTHERS"); SV("ddlbCLMOCC", "Others|Unemployed")
        T("sleCLMTIN", "NA"); T("sleCLMSSTRegNo", "NA"); cur.evaluate(_RADIO, {"n": "sleCLMSSTRegOpt", "val": "No"}); T("sleCLMEMAIL", "NOEMAIL@GMAIL.COM")
        self._phone("sleCLMPhone1pref", "sleCLMPhone1", clm["phone"])
        # claimant driver: keyed by hand, COPYCLAIMANT is never ticked here (playbook 04)
        T("sleCMDnm", cmd["name"])
        T("sleCMDID1", cmd["nric"] if cmd["idType"] == "Passport" else fmt_ic(cmd["nric"]))
        if cmd["idType"] == "Passport":
            cur.evaluate("() => { var s = document.querySelector('select[name=sleCMDID1sel]'); if (s) { s.value = '3'; s.dispatchEvent(new Event('change', {bubbles: true})); } }")
        self._party("CMD", cmd)
        SV("ddlbCMDMARITAL", "Unknown"); T("sleCMDDRVEXP", cmd["exp"]); T("sleCMDEMAIL", "NOEMAIL@GMAIL.COM"); T("sleCMDAddr1", clm["addr"])
        T("sleCMDOCC", "OTHERS"); SV("ddlbCMDOCC", "Others|Unemployed")
        self._phone("sleCMDPhone1pref", "sleCMDPhone1", cmd.get("phone") or clm["phone"])
        # vehicle (our client's car, from the RC; colour and odometer from the photos)
        T("sleENGNO", veh["eng"]); T("sleJPJNO", veh["jpjLogbook"]); T("sleJPJREG", veh["jpjReg"]); T("sleVHMANYEAR", veh["manYear"]); T("sleVehCC", veh["cc"])
        SV("ddlbAssemType", re.escape(veh.get("assembly") or "Locally Assembled")); SV("ddlbVehClass", "Private"); SV("sleFUELTYPE", "Petrol")
        if not SV("ddlbCOLORID", "^" + re.escape(veh["colour"]) + "$"):
            res.notes.append("colour " + veh["colour"][:20] + " is not an option")
        T("sleODO", veh["odo"]); SV("ddlbODOUNITS", "km|Kilo")
        cur.evaluate("() => { document.querySelectorAll('input[name=cbxFLAGS]').forEach(c => { if (!c.checked) c.click(); }); }")
        # condition + tyres (fixed values)
        SV("ddlbGENCON", "Good"); SV("ddlbDRIVEABLE", "Yes"); SV("ddlbConDamage", "Moderate"); SV("ddlbPREDAMAGE", "^No")
        for f in ("sleSTEERCON", "sleFOOTCON", "sleHANDCON", "sleFSUSP", "sleRSUSP"):
            T(f, "Serviceable")
        T("slePAINTCON", "Good")
        for f in ("ddlbFLTTYPEID", "ddlbFRTTYPEID", "ddlbRLTTYPEID", "ddlbRRTTYPEID"):
            SV(f, "^Michelin$|Michelin")
        T("sleFTYRESIZE", "175/65 R17"); T("sleRTYRESIZE", "175/65 R17")
        for f in ("sleFLTREAD", "sleFRTREAD", "sleRLTREAD", "sleRRTREAD"):
            T(f, "6.00")
        T("sleSPTREAD", "8.00")
        # estimate information: Total Loss, then the labour list (empty until rbLABTYPE is clicked), paint, liability
        SV("cbxTL", "^Yes" if D.get("TL") == "Yes" else "^No")
        cur.evaluate("() => { var r = document.querySelector('input[name=rbLABTYPE]'); if (r && !r.checked) { r.click(); } }")
        w(1000)
        if not SV("ddlbLABTYPE", veh["labour"]):
            res.notes.append("labour type")
        SV("ddlbPATYPEID", "Solid"); T("LIABLEPC", "100.00")
        # states -> cities -> postcodes (a city change clears the postcode, playbook 04)
        for st, city, src in (("ddlbIState", "ddlbICity", ins), ("ddlbDState", "ddlbDCity", idr), ("ddlbCLMState", "ddlbCLMCity", clm), ("ddlbCMDState", "ddlbCMDCity", clm)):
            if src.get("state"):
                SV(st, "^" + re.escape(src["state"]) + "$|" + re.escape(src["state"])); w(500)
            if src.get("city"):
                if not SV(city, "^" + re.escape(src["city"]) + "$|" + re.escape(src["city"])) and src.get("cityGuessed"):
                    res.notes.append(f"city {src['city'][:30]} is not in Merimen's list")
                w(400)
        SV("ddlbLossState", "^" + re.escape(D["lossState"]) + "$|" + re.escape(D["lossState"])); w(600)
        SV("ddlbLOSSCITY", "^" + re.escape(D["lossCity"]) + "$|" + re.escape(D["lossCity"])); w(500)
        T("sleIPostCode", ins["postcode"]); T("sleDPostCode", idr["postcode"] or ins["postcode"]); T("sleCLMPostCode", clm["postcode"])
        T("sleCMDPostCode", clm["postcode"]); T("sleAPcode", D["lossPostcode"])
        # some templates (Takaful Malaysia) require licence no + address 2 for every party: "-" (user 2026-08-17)
        for f in ("sleILicenseNo", "sleDLicenseNo", "sleCLMLicenseNo", "sleCMDLicenseNo", "sleIAddr2", "sleDAddr2", "sleCLMAddr2", "sleCMDAddr2"):
            if cur.evaluate("(n) => { var e = document.querySelector('[name=' + n + ']'); return !!e && !(e.value || '').trim(); }", f):
                T(f, "-")
        self.fm = {"sleIDOB": ins["dob"], "sleDDOB": idr["dob"], "sleCLMDOB": clm["dob"], "sleCMDDOB": cmd["dob"],
                   "sleIPostCode": ins["postcode"], "sleDPostCode": idr["postcode"] or ins["postcode"], "sleCLMPostCode": clm["postcode"],
                   "sleAPcode": D["lossPostcode"], "sleCMDPostCode": clm["postcode"], "sleITIN": "NA", "sleCLMTIN": "NA", "sleISSTRegNo": "NA",
                   "sleCLMSSTRegNo": "NA", "sleIEMAIL": "NOEMAIL@GMAIL.COM", "sleDEMAIL": "NOEMAIL@GMAIL.COM", "sleCLMEMAIL": "NOEMAIL@GMAIL.COM",
                   "sleCMDEMAIL": "NOEMAIL@GMAIL.COM", "sleIAddr1": ins["addr"], "sleDAddr1": idr["addr"], "sleCLMAddr1": clm["addr"],
                   "sleCMDAddr1": clm["addr"], "sleODO": veh["odo"], "sleVehCC": veh["cc"], "sleVHMANYEAR": veh["manYear"], "sleENGNO": veh["eng"],
                   "sleJPJNO": veh["jpjLogbook"], "sleJPJREG": veh["jpjReg"], "LIABLEPC": "100.00", "sleCDDRVEXP": idr["exp"],
                   "sleCMDDRVEXP": cmd["exp"], "sleNUM_REPDAYS": "25", "sleINSPECT": self.today, "sleIOCC": "OTHERS", "sleDOCC": "OTHERS",
                   "sleCLMOCC": "OTHERS", "sleCMDOCC": "OTHERS", "vaCDPOLICESTATION": D["policeStation"]}

    def save(self, D: dict) -> ReportResult:
        """fill, then the owner's save loop. Always closes its tab."""
        res = self.fill(D)
        try:
            if res.code in ("not_logged_in", "no_case", "report_not_open", "report_error", "unexpected_dialog"):
                return res
            cur, w = self.cur, self._w
            cur.evaluate(_RADIO, {"n": "rdInsuredGstReg", "val": "No"}); cur.evaluate(_RADIO, {"n": "rdTPGstReg", "val": "No"})
            # a minimal claimant-driver form (no phone box): COPYCLAIMANT so the driver gets the claimant's contact (owner's script)
            cur.evaluate("() => { if (!document.querySelector('[name=sleCMDPhone1]')) { var c = document.querySelector('[name=COPYCLAIMANT],#COPYCLAIMANT'); if (c && !c.checked) { c.click(); } } }")
            w(500)
            # Takaful Malaysia: the inline onchange of the mobile boxes fills a hidden field that a scripted change does not reach
            cur.evaluate("""() => { ['sleIPhone1','sleDPhone1','sleCLMPhone1','sleCMDPhone1'].forEach(n => { var e = document.querySelector('[name=' + n + ']');
              if (e && (e.value || '').trim()) { var h = document.getElementById('hid' + n) || document.querySelector('[name=hid' + n + ']'); if (h) h.value = e.value;
              try { if (typeof e.onchange === 'function') e.onchange(); } catch (x) {} } }); }""")
            # user rule 2026-09-16: an empty required TEXT box the map does not cover gets "-"
            cur.evaluate("""() => { document.querySelectorAll('input[type=text][chkrequired],textarea[chkrequired]').forEach(e => {
              if (e.offsetParent !== null && !(e.value || '').trim()) { e.value = '-'; e.dispatchEvent(new Event('input', {bubbles: true})); e.dispatchEvent(new Event('change', {bubbles: true})); } }); }""")
            w(300)
            fa = ""
            last_unknown: list[str] = []
            for _attempt in range(7):
                w(500)
                cur.evaluate("() => { try { SaveReport(1); } catch (e) {} }")
                w(3200)
                fa = (re.search(r"fuseaction=([a-z_]+)", cur.url or "", re.I) or [None, ""])[1]
                if fa in DONE:
                    break
                ok = cur.evaluate(_OK) or ""
                if ok.startswith("STOP:"):
                    self.unexpected.append(redact(ok[5:]))
                    break
                if ok:
                    res.messages = [ok[3:]]
                w(1200)
                rb = cur.evaluate(_FILL_RED, getattr(self, "fm", {}))
                last_unknown = [n for n in rb.get("unknown", []) if n not in NEVER_SAVES]
                if not rb.get("filled"):
                    break  # nothing more the worker knows how to fill: a person looks
            if fa in DONE:
                res.ok, res.saved, res.code, res.missing = True, True, "", []
                return res
            res.ok, res.saved = False, False
            if self.unexpected:
                res.code, res.messages = "unexpected_dialog", list(self.unexpected)[:2]
            else:
                res.code = "report_rejected"
                res.missing = last_unknown or res.missing
                vis = self._ev(_MSGS) or []
                res.messages = (res.messages + vis)[:4]
            return res
        finally:
            self.close()

    def _ev(self, js):
        try:
            return self.cur.evaluate(js)
        except Exception:  # noqa: BLE001
            return None
