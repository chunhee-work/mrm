"""Phase A step 1: make the case in Merimen. Ported from tools/mrm-bot/createpar2_sinar.mjs (the owner's proven script) and playbook 02.

It drives the logged-in Merimen tab of the worker Chrome through Playwright over the local debugging port. It never types a password,
never prints or stores the session marks (CFID / CFTOKEN / USID / RID live in the page address), and never logs a page address.

`fill` opens the create form in a new tab and fills every field, then reads it back. Nothing is saved. A dry run stops there.
`create` is `fill`, then, only when every check passed, clicks Next, handles the pop-ups, sets the manager and the adjuster, and reads
the case id. Anything unexpected (a duplicate warning, a rejected form, an unsure model, a workshop that is not exactly one row)
stops with a short code instead of a guess, because a wrong case in Merimen costs the user money (model changes cost RM12)."""

from __future__ import annotations

import re
import time
from dataclasses import dataclass, field
from urllib.parse import urlencode, parse_qs, urlparse

from .create_spec import Spec, fmt_ic
from .pick_model import pick

CLAIMS = "https://www.merimen.com.my/claims/index.cfm"
SESSION_KEYS = ("CFID", "CFTOKEN", "USID", "RID")
DUP = re.compile(r"already an active claim|CONFIRM that this is NOT", re.I)


def session_query(url: str) -> str | None:
    """"CFID=..&CFTOKEN=..&USID=..&RID=.." from a logged-in claims address, or None. The caller must not log it."""
    try:
        u = urlparse(url or "")
    except ValueError:
        return None
    if u.scheme != "https" or u.netloc != "www.merimen.com.my" or not u.path.startswith("/claims/"):
        return None
    q = parse_qs(u.query)
    if not q.get("CFID") or not q.get("RID"):
        return None
    return urlencode([(k, q[k][0]) for k in SESSION_KEYS if q.get(k)])  # re-encoded: a value with & + % = must survive


def norm(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", (text or "").lower().replace("(hq)", " ")).strip()


def pick_person(options: list[tuple[str, str]], name: str) -> str | None:
    """The option value for a manager or adjuster typed by the user. An exact name (the "(HQ)" mark ignored) wins and an "(HQ)" option beats
    a plain one (playbook 02); the first of equals wins. With no exact name, a partial hit counts only when the typed name sits inside
    exactly one option's text; two or more, or none, is None: the caller stops and says so, never guesses."""
    want = norm(name)
    if not want:
        return None
    exact: list[tuple[int, str]] = []
    partial: list[str] = []
    for value, text in options:
        if not value:
            continue
        t = norm(text)
        if t == want:
            exact.append((0 if "(hq)" in (text or "").lower() else 1, value))
        elif f" {want} " in f" {t} ":
            partial.append(value)
    if exact:
        return min(exact, key=lambda x: x[0])[1]  # min keeps the first of equals
    return partial[0] if len(partial) == 1 and len(want.split()) >= 2 else None  # a one-word name ("Tan") never picks by partial match


def pick_workshop_row(rows: list[str], name: str) -> tuple[int | None, str]:
    """Which Lookup row is the user's workshop: (index, "") for exactly one, else (None, reason). Never the first of several."""
    want = norm(name)
    hits = [i for i, r in enumerate(rows) if want and f" {want} " in f" {norm(r)} "]  # whole words: "AB Motor" is not inside "CAB MOTOR WORKS"
    exact = [i for i in hits if norm(rows[i]) == want]
    if len(hits) > 1 and len(exact) == 1:
        hits = exact  # "Bengkel Ali" next to "Bengkel Ali Jaya": the exact one wins
    if len(hits) > 1:
        hq = [i for i in hits if "(hq)" in rows[i].lower()]
        hits = hq if len(hq) == 1 else hits
    if len(hits) == 1:
        return hits[0], ""
    return None, "workshop_ambiguous" if hits else "workshop_not_found"


def keywords_for(name: str) -> list[str]:
    """The Lookup search matches from the START of the name: the whole name first, then shorter starts."""
    words = norm(name).split()
    out = []
    for n in (len(words), 3, 2):
        k = " ".join(words[:n])
        if k and k not in out:
            out.append(k)
    return out


_MARKS = re.compile(r"(CFID|CFTOKEN|USID|RID)=[^&\s\"']+", re.I)


def redact(text: str) -> str:
    """Anything that came off a Merimen page and may end up in the timeline loses its session marks first."""
    return _MARKS.sub(r"\1=***", text or "")


@dataclass
class CreateReport:
    ok: bool = False
    code: str = ""  # "" when ok; else a short fixed code
    problems: list[str] = field(default_factory=list)  # field-level failures found before saving
    case_id: str | None = None
    ext_id: str | None = None
    note: str | None = None  # something to do by hand after the case exists (manager / adjuster not set)
    model: str = ""
    workshop_coid: str = ""
    messages: list[str] = field(default_factory=list)  # Merimen's own validation lines when it rejected the form
    cleared: bool = False  # Next was pressed but Merimen did not make a case (still on the form): a retry cannot duplicate anything
    readback: str = ""  # what the form held right before it was saved (or would have been): insurer, branch, workshop, model, cover
    white_model: bool = False  # the chosen model option has no parts/price data (playbook 02: say so)

    def line(self) -> str:
        bits = [self.code] if self.code else []
        if self.problems:
            bits.append("; ".join(self.problems)[:300])
        if self.messages:
            bits.append("Merimen says: " + " | ".join(redact(m) for m in self.messages)[:300])
        return " ".join(bits)


# --- small page helpers (JS strings are the ones the owner's script has used on the live form) ---------------------------------------

_T = """({n, v}) => { var e = document.querySelector('[name=' + n + ']'); if (!e) return 0; e.value = v;
  e.dispatchEvent(new Event('input', {bubbles: true})); e.dispatchEvent(new Event('change', {bubbles: true})); return 1; }"""
_SV = """({n, rx}) => { var s = document.querySelector('select[name=' + n + ']'); if (!s) return 0;
  var o = [...s.options].find(x => new RegExp(rx, 'i').test(x.text.trim())); if (!o) return 0;
  s.value = o.value; s.dispatchEvent(new Event('change', {bubbles: true})); if (s.onchange) s.onchange(); return o.text.trim() || 1; }"""
_SVV = """({n, v}) => { var s = document.querySelector('select[name=' + n + ']'); if (!s) return 0;
  if (![...s.options].some(x => x.value === String(v))) return 0;
  s.value = String(v); s.dispatchEvent(new Event('change', {bubbles: true})); if (s.onchange) s.onchange(); return 1; }"""
_HOUR = """({n, hh}) => { var s = document.querySelector('select[name=' + n + ']');
  if (!s) { var t = document.querySelector('input[name=' + n + ']'); if (!t) return 0; t.value = hh + ':00';
    t.dispatchEvent(new Event('change', {bubbles: true})); if (t.onblur) t.onblur(); return 'txt'; }
  var o = [...s.options].find(x => new RegExp('^' + hh + ':').test(x.text.trim())); if (!o) return 0;
  s.value = o.value; s.dispatchEvent(new Event('change', {bubbles: true})); if (s.onchange) s.onchange(); return 1; }"""
_CLICK = """(sel) => { var c = document.querySelector(sel); if (!c) return 0; if (!c.checked) c.click(); return 1; }"""
_RADIO = """({n, v}) => { var r = document.querySelector('input[name=' + n + '][value="' + v + '"]'); if (!r) return 0;
  r.checked = true; r.click(); r.dispatchEvent(new Event('change', {bubbles: true})); return 1; }"""
_OPTS = """(n) => { var s = document.querySelector('select[name=' + n + ']'); if (!s) return null;
  return [...s.options].map(o => [o.value, o.text.trim(), o.className || '']); }"""
# Clicks a visible OK only after reading the box around it: a box that asks something (confirm, duplicate, overwrite, delete) is NOT clicked and its text
# comes back as "STOP:<text>" so the worker stops instead of answering a question the owner's script never answered.
_OK = """() => { var t = [...document.querySelectorAll('input,button')].find(e => ((e.value || e.innerText || '').trim() === 'OK') && e.offsetParent !== null);
  if (!t) return ''; var box = t.closest('[role=dialog],[class*=modal],[class*=dialog],[class*=popup]') || t.closest('table'), b = t, tx = box ? (box.innerText || '').trim() : '';
  for (var i = 0; !tx && i < 6 && b.parentElement; i++) { b = b.parentElement; tx = (b.innerText || '').trim(); if (tx.length < 4) tx = ''; }
  // an ALLOW list: only the insurer-API notices and the points box from the owner's playbook are answered; anything else (or anything that asks) is a STOP
  // a container that is long (a layout table holding the whole form) is not "the box": unknown = STOP. Only the owner's notices are answered.
  if (tx.length > 300 || /confirm|already|duplicate|overwrite|delete|proceed|continue|are you sure/i.test(tx) || !/not found|charged|\\bpts?\\b|points/i.test(tx)) return 'STOP:' + tx.slice(0, 120);
  t.click(); return 'OK'; }"""
_MSGS = """() => { var o = []; document.querySelectorAll('*').forEach(e => { var t = (e.childNodes[0] && e.childNodes[0].nodeValue || '').trim();
  if (t && /should|required|must|invalid|specified|cannot|please|exist|duplicate/i.test(t) && e.offsetParent !== null && t.length < 160) o.push(t); });
  return [...new Set(o)].slice(0, 60); }"""
_BUSY = re.compile(r"please wait|saving|processing|loading|in progress|submitting", re.I)  # a progress note is not a rejection


def _new_msgs(now, pre):
    return [m for m in now if m not in pre and not _BUSY.search(m)]


_CHK = """() => { function g(n) { var e = document.querySelector('[name=' + n + ']'); return e ? e.value : ''; }
  return {rep: g('ddlbREPCOID'), repName: g('ddlbREPCOIDTEXT'), man: g('ddlbMan'), model: g('ddlbModel'), cur: g('sleCURINSCOID'), plate: g('sleREGNO'), chassis: g('sleCHANO')}; }"""


class MerimenCreate:
    """One instance per org Chrome. `base_page` is the logged-in Merimen tab; every attempt opens (and closes) a tab of its own."""

    def __init__(self, base_page, *, timeout_scale: float = 1.0, on_created=None, before_submit=None):
        self.base = base_page
        self.before_submit = before_submit  # called after every check passed and right before Next; returns None to go on, or a stop code
        self.alerts: list[str] = []
        self.unexpected: list[str] = []  # confirm() / prompt() texts that were dismissed, not accepted
        self.on_created = on_created  # called with (case_id, ext_id) the moment the case exists, before the manager and adjuster are set
        self.scale = timeout_scale
        self.cur = None
        self.cur_problems: list[str] = []

    # ---- waits: a scale below 1 only speeds up a test against a local fixture ----
    def _ms(self, ms: int) -> int:
        return max(0, int(ms * self.scale))

    def _t(self, n, v):
        return self.cur.evaluate(_T, {"n": n, "v": v})

    def _sv(self, n, rx):
        return self.cur.evaluate(_SV, {"n": n, "rx": rx})

    def _need(self, n, v):
        """Set a text field that the form must have; a field that is not on the page is a problem, never silently skipped."""
        if not self._t(n, v):
            self.cur_problems.append("field:" + n)

    def _svv(self, n, v):
        return self.cur.evaluate(_SVV, {"n": n, "v": v})

    def _ev(self, js, arg=None, default=None):
        """evaluate that survives a page which is moving (Merimen redirects after Next): an error is "no answer yet", never a crash."""
        try:
            return self.cur.evaluate(js, arg) if arg is not None else self.cur.evaluate(js)
        except Exception:  # noqa: BLE001
            return default

    def _ok_loop(self, rounds: int, gap: int = 1500):
        for _ in range(rounds):
            r = self._ev(_OK, None, "")
            if not r:
                break
            if str(r).startswith("STOP:"):
                self.unexpected.append(redact(str(r)[5:]))  # a question box: left unanswered, the case stops
                break
            self.cur.wait_for_timeout(self._ms(gap))

    def _dialog(self, d) -> None:
        """An insurer API warning is a JS alert: OK at once and carry on (playbook 02). A confirm() or prompt() is something the owner's
        script never meant to answer (a duplicate or overwrite question): it is dismissed, its text kept, and the case stops."""
        if d.type in ("alert", "beforeunload"):
            if d.type == "alert":
                self.alerts.append(redact((d.message or "")[:160]))  # kept: a duplicate warning shown as an alert must not vanish
            d.accept()
            return
        self.unexpected.append(redact((d.message or "")[:120]))
        d.dismiss()

    # ---- fill ----
    def _open_form(self) -> str | None:
        q = session_query(self.base.url)
        if not q:
            return "not_logged_in"
        self.cur = self.base.context.new_page()
        self.cur.on("dialog", self._dialog)
        self.cur.goto(f"{CLAIMS}?fusebox=MTRclaim&fuseaction=dsp_clmreg&{q}", wait_until="domcontentloaded")
        self.cur.wait_for_timeout(self._ms(3000))
        if self.cur.locator("input[type=password]").count() > 0:
            from . import login_seen

            login_seen.mark_if_shown(self.cur)  # the code stays "form_not_open" (create_step retries it as before); the mark lets loop log in again
            return "form_not_open"
        if not self.cur.locator("select[name=ddlbInsurer]").count():
            return "form_not_open"
        return None

    def _workshop(self, spec: Spec, rep: CreateReport) -> None:
        cur = self.cur
        for kw in keywords_for(spec.workshop_name):
            try:
                with cur.expect_popup(timeout=8000) as pi:
                    cur.locator("#MTRworkshopbtn").click(force=True, timeout=6000)
                pop = pi.value
                pop.on("dialog", self._dialog)
            except Exception:  # noqa: BLE001
                rep.problems.append("workshop_popup")
                return
            pop.wait_for_timeout(self._ms(1500))
            pop.evaluate("""(kw) => { var t = document.querySelector('input[name=MTRworkshopslcFilter],input[type=text]'); if (!t) return 0; t.value = kw;
              t.dispatchEvent(new Event('input', {bubbles: true})); t.dispatchEvent(new Event('change', {bubbles: true})); return 1; }""", kw)
            pop.evaluate("""() => { var b = [...document.querySelectorAll('input[type=button],button')].find(x => /^\\s*Search\\s*$/i.test(x.value || x.innerText || '')); if (b) b.click(); }""")
            pop.wait_for_timeout(self._ms(2500))
            rows = pop.evaluate("""() => [...document.querySelectorAll('tr')].filter(r => !r.querySelector('tr')).map(r => (r.innerText || '').replace(/\\s+/g, ' ').trim())""")
            idx, why = pick_workshop_row(rows, spec.workshop_name)
            if idx is None:
                try:
                    pop.close()
                except Exception:  # noqa: BLE001
                    pass
                if why == "workshop_ambiguous":
                    rep.problems.append(why)
                    return
                continue  # not found with this start: try a shorter one
            matching = pop.evaluate("""(i) => { var rs = [...document.querySelectorAll('tr')].filter(r => !r.querySelector('tr')); var t = rs[i]; if (!t) return 'no';
              var c = t.closest('a') || t.querySelector('a') || t; c.click(); return 'clicked'; }""", idx)
            cur.wait_for_timeout(self._ms(2500))
            if matching != "clicked":
                rep.problems.append("workshop_not_found")
            return
        rep.problems.append("workshop_not_found")

    def fill(self, spec: Spec) -> CreateReport:
        rep = CreateReport()
        try:
            bad = self._open_form()
        except Exception:  # noqa: BLE001  (the message of a Playwright error carries the session address: keep only a code)
            bad = "form_error"
        if bad:
            rep.code = bad
            return rep
        cur, P = self.cur, rep.problems
        self.cur_problems = P
        try:
            w = lambda ms: cur.wait_for_timeout(self._ms(ms))  # noqa: E731
            if not self._svv("ddlbInsurer", spec.ins_coid):
                P.append("insurer_option")
            w(2800)
            if not self._sv("ddlbINSCOID", spec.branch_match):
                P.append("branch_option")
            w(1500)
            if not self._svv("ddlbCLAIMTYPE", "TP"):
                P.append("claim_type")
            w(2800)
            if spec.ins_coid == "64":
                self._sv("ddlbVehClass_TMI", "Private")
            self._t("sleCURINSCOID", spec.ins_coid)
            self._need("sleACCDATE", spec.acc_date)
            if not cur.evaluate(_HOUR, {"n": "sleACCTIME", "hh": spec.acc_hour}):
                P.append("accident_time")
            c = spec.client
            if c["is_company"]:
                cur.evaluate(_RADIO, {"n": "sleCLMnmsel", "v": "1"})
                cur.evaluate(_RADIO, {"n": "sleCLMID1cel", "v": "1"})
                w(500)
                self._need("sleCLMnm", c["name"])
                self._need("sleCLMID1", c["nric"])
            else:
                cur.evaluate(_RADIO, {"n": "sleCLMnmsel", "v": "2"})
                self._need("sleCLMnm", c["name"])
                self._need("sleCLMID1", fmt_ic(c["nric"]))
            self._need("sleREGNO", spec.plate)
            self._need("sleCHANO", spec.veh["chassis"])
            self._workshop(spec, rep)
            chk = cur.evaluate(_CHK)
            rep.workshop_coid = chk.get("rep") or ""
            if not rep.workshop_coid and "workshop_not_found" not in P and "workshop_ambiguous" not in P and "workshop_popup" not in P:
                P.append("workshop_not_registered")
            elif chk.get("repName") and f" {norm(spec.workshop_name)} " not in f" {norm(chk['repName'])} ":
                P.append("workshop_mismatch")
            a = spec.atfault
            self._need("slePOLNO", a["policy"])
            if a["is_cover_note"]:
                cur.evaluate(_CLICK, "input[name=siISCOVERNOTE],input[name=chkCOVERNOTE]")
            self._need("slePOLFROM", a["from"])
            self._need("slePOLTO", a["to"])
            if not self._svv("ddlbNEWPOL", "1"):
                P.append("new_policy_option")
            if a["owner_is_company"]:
                cur.evaluate(_RADIO, {"n": "sleInmsel", "v": "1"})
                cur.evaluate(_RADIO, {"n": "sleIID1cel", "v": "1"})
                w(400)
                self._need("sleInm", a["owner_name"])
                self._need("sleIID1", a["owner_id"])
            else:
                self._need("sleInm", a["owner_name"])
                passport = bool(re.search(r"[A-Za-z]", a["owner_id"]))
                self._need("sleIID1", a["owner_id"] if passport else fmt_ic(a["owner_id"]))
                if passport:
                    cur.evaluate(_RADIO, {"n": "sleIID1sel", "v": "3"})
            self._t("sleIPhone1", c["phone"])
            if c["is_company"]:
                cur.evaluate(_RADIO, {"n": "sleTPnmsel", "v": "1"})
                cur.evaluate(_RADIO, {"n": "sleTPID1cel", "v": "1"})
                self._need("sleTPnm", c["name"])
                self._need("sleTPID1", c["nric"])
            else:
                self._need("sleTPnm", c["name"])
                self._need("sleTPID1", fmt_ic(c["nric"]))
            self._need("sleTPREGNO", a["plate"])
            claimant = False
            if c["policy"] and c["ins_coid"]:
                # playbook 02: tick TPOWN first, the two claimant-insurance fields ship disabled and a disabled field is not submitted
                cur.evaluate("""() => { var c = document.getElementById('TPOWN'); if (c && !c.checked) c.click(); return 1; }""")
                w(800)
                self._need("sleTPPOLNO", c["policy"])
                if not self._svv("ddlb3INSCOID", c["ins_coid"]):
                    P.append("client_insurer_option")
                # a disabled field is not submitted: the save "works" and stores nothing (playbook 02). Both must be enabled and hold their values.
                held = cur.evaluate("""() => ['ddlb3INSCOID', 'sleTPPOLNO'].map(n => { var e = document.querySelector('[name=' + n + ']'); return e ? [!e.disabled, !!e.value] : [false, false]; })""")
                if not all(en and has for en, has in held):
                    P.append("claimant_insurance_not_set")
                claimant = True
            else:
                cur.evaluate("""() => { ['ddlb3INSCOID', 'sleTPPOLNO', 'sleTRAILERREGNO', 'sleTRAILERTPREGNO'].forEach(n => { var e = document.querySelector('[name=' + n + ']'); if (e) e.removeAttribute('chkrequired'); }); return 1; }""")
            cur.evaluate("""() => { var sels = [...document.querySelectorAll('select')].filter(s => { var tr = s.closest('tr'); var l = tr ? (tr.innerText || '') : '';
              return (/insured vehicle class|vehicle class/i.test(l) || /VEHCLASS/i.test(s.name)) && !/_TMI/i.test(s.name); });
              for (const s of sels) { var o = [...s.options].find(x => /Private.Company/i.test(x.text)); if (o) { s.value = o.value; s.dispatchEvent(new Event('change', {bubbles: true})); if (s.onchange) s.onchange(); return 1; } } return 0; }""")
            if not self._sv("ddlbDAMTYPE", "Collision"):
                P.append("damage_type")
            self._need("mleLossDesc", spec.loss)
            if not self._sv("sleINITIALEST_DD", "10,000 - 12,500"):
                P.append("initial_estimate_option")  # cannot be changed after the claim is notified
            if not self._sv("ddlbPOLCOVER", spec.polcover):
                P.append("policy_cover_option")
            self._pick_model(spec, rep)
            self._need("sleCURINSCOID", spec.ins_coid)
            if claimant:  # picking the model and the cover re-draws parts of the form: the two claimant-insurance fields must STILL be enabled and filled
                held2 = cur.evaluate("""() => ['ddlb3INSCOID', 'sleTPPOLNO'].map(n => { var e = document.querySelector('[name=' + n + ']'); return e ? [!e.disabled, !!e.value] : [false, false]; })""")
                if not all(en and has for en, has in held2) and "claimant_insurance_not_set" not in P:
                    P.append("claimant_insurance_not_set")
            after = cur.evaluate(_CHK)
            if after.get("cur") != spec.ins_coid:
                P.append("handling_insurer")
            rep.workshop_coid = after.get("rep") or rep.workshop_coid
            rep.readback = self._readback()
            if self.unexpected:
                P.append("dialog: " + self.unexpected[0])
            rep.ok = not P
            rep.code = "" if rep.ok else "form_not_ready"
        except Exception as e:  # noqa: BLE001
            rep.ok = False
            rep.code = "form_error"
            rep.problems.append(type(e).__name__)
        return rep

    def _readback(self) -> str:
        """The chosen option text of the selects that matter, for the timeline line. No names, numbers or session marks."""
        got = self.cur.evaluate("""() => ['ddlbInsurer', 'ddlbINSCOID', 'ddlbPOLCOVER', 'ddlb3INSCOID', 'ddlbMan'].map(n => { var s = document.querySelector('select[name=' + n + ']');
          return n + '=' + (s && s.selectedIndex >= 0 ? s.options[s.selectedIndex].text.trim() : '?'); })""")
        return redact("; ".join(got))[:300]

    def _pick_model(self, spec: Spec, rep: CreateReport) -> None:
        cur, P = self.cur, rep.problems
        make = spec.veh["make"]
        if not self._sv("ddlbMan", "^" + re.escape(make) + "$"):
            P.append("make_not_found:" + make[:30])
            return
        opts: list = []
        for _ in range(14):  # a big make (Mazda has 360 entries) is filled in by a later callback: wait until the list stops growing
            cur.wait_for_timeout(self._ms(2000))
            now = cur.evaluate(_OPTS, "ddlbModel") or []
            grown = len(now) != len(opts)
            opts = now
            if len(opts) > 5 and not grown:
                break
        cur.wait_for_timeout(self._ms(1500))
        opts = cur.evaluate(_OPTS, "ddlbModel") or opts  # one last read after the final wait
        have = [{"v": v, "t": t, "c": c} for v, t, c in opts if v]
        r = pick({make: have}, {"make": make, "rcModel": spec.veh["rc_model"], "cc": spec.veh["cc"],
                                "transmission": "", "body": spec.veh["body"], "jpjReg": spec.veh["reg_date"], "year": spec.veh["year"]})
        if r["status"] != "OK" or not r["pick"]:
            P.append("model_unsure: " + " / ".join(t for t, _s in r["top"][:3])[:200])
            return
        if not self._svv("ddlbModel", r["pick"]):
            P.append("model_option")
            return
        rep.model = r.get("text") or ""
        rep.white_model = not next((o["c"] for o in have if o["v"] == r["pick"]), "").endswith("1")

    # ---- save ----
    def create(self, spec: Spec) -> CreateReport:
        """fill, and when every check passed, save. Always closes its tab."""
        rep = self.fill(spec)
        try:
            if not rep.ok:
                return rep
            self.pressed = False
            try:
                return self._save(spec, rep)
            except Exception:  # noqa: BLE001
                if not self.pressed:  # the mark is written and Next is clicked only after this flag is set: nothing happened, a retry is safe
                    rep.ok, rep.code = False, "form_error"
                    return rep
                # Next may already have been pressed: this is never "try again" (a retry could make a second case)
                if not rep.case_id:  # a page that was moving made an evaluate fail: the address may already hold the case number
                    try:
                        m = None
                        for _ in range(6):  # a redirect that is still on its way: look at the address for a few seconds
                            u = self.cur.url or ""
                            m = re.search(r"caseid=(\d+)", u, re.I) if "adjclmref" in u else None
                            if m:
                                break
                            self.cur.wait_for_timeout(self._ms(1000))
                        if m:
                            rep.case_id = m.group(1)
                            e = re.search(r"extid=(\d+)", u, re.I)
                            rep.ext_id = e.group(1) if e else None
                            if self.on_created:
                                self.on_created(rep.case_id, rep.ext_id)
                    except Exception:  # noqa: BLE001
                        pass
                if rep.case_id:
                    rep.ok, rep.note = True, rep.note or "manager_adjuster_not_set"
                else:
                    rep.ok, rep.code = False, "create_unclear"
                return rep
        finally:
            self.close()

    def close(self) -> None:
        if self.cur is not None:
            try:
                self.cur.close()
            except Exception:  # noqa: BLE001
                pass
            self.cur = None

    def _save(self, spec: Spec, rep: CreateReport) -> CreateReport:
        cur = self.cur
        w = lambda ms: cur.wait_for_timeout(self._ms(ms))  # noqa: E731
        # everything that can fail is read BEFORE the mark is written: between the mark and the click there is nothing left to go wrong
        pre = set(cur.evaluate(_MSGS))  # texts already on the form before Next: static labels are not a rejection
        nxt = cur.locator('input[value*="Next"],button:has-text("Next")')
        absent = nxt.count() == 0
        if self.before_submit:
            try:
                stop = self.before_submit()  # locks the workshop and writes the "Next pressed" mark; nothing has been pressed yet
            except Exception:  # noqa: BLE001  (a database hiccup before anything was pressed: retry, no person needed)
                stop = "form_error"
            if stop:
                rep.ok, rep.code = False, stop
                return rep
        self.pressed = True  # from here on an error means "Next may have gone out"
        try:
            nxt.first.click(force=True, timeout=4000)
        except Exception:  # noqa: BLE001  (a slow click may already have gone out: never submit a second time)
            pass
        if absent:  # only when there is no Next button at all
            self._ev("() => { try { SubmitEntry(); } catch (e) {} }")
        w(4500)
        self._ok_loop(6)
        w(2500)
        url = cur.url or ""
        # a slow Merimen still shows the form while it saves: wait (up to ~20 s more) for the page to move or to say why it will not
        for _ in range(10):
            if not re.search(r"act_clmreg|dsp_clmreg", url) or self.unexpected or _new_msgs(self._ev(_MSGS, None, []), pre) or self._ev(
                    "(rx) => new RegExp(rx, 'i').test(document.body.innerText || '')", DUP.pattern, False):
                break
            w(2000)
            url = cur.url or ""
        if self.unexpected and re.search(r"act_clmreg|dsp_clmreg", url):
            # a dismissed question cannot be proven to have come before the POST, so the mark stays and a person looks in the worklist
            rep.ok, rep.code, rep.cleared = False, "unexpected_dialog", False  # never cleared: a person checks the worklist (a dismissed question can come after the POST)
            rep.messages = list(self.unexpected)[:3]
            return rep
        if re.search(r"act_clmreg|dsp_clmreg", url):
            if any(DUP.search(a) for a in self.alerts):
                rep.ok, rep.code = False, "duplicate_warning"  # the warning came as an alert and the page is still the form: stop, mark stands
                rep.messages = [a for a in self.alerts if DUP.search(a)][:1]
                return rep
            if self._ev("(rx) => new RegExp(rx, 'i').test(document.body.innerText || '')", DUP.pattern, False):
                # the owner's script confirms this warning; a retry after a crash would also land here, so the worker stops and a person decides
                rep.ok, rep.code = False, "duplicate_warning"
                return rep
            form_here = bool(cur.locator("select[name=ddlbInsurer]").count())
            rep.messages = [m[:160] for m in _new_msgs(self._ev(_MSGS, None, []), pre)]
            if not form_here:  # no form on the page: Merimen may have made the case, whatever the text says
                rep.ok, rep.code = False, "create_unclear"
                rep.messages = (rep.messages or ["page after Next shows no create form"])[:2]
                return rep
            if not rep.messages:  # still the form but nothing NEW says why: the save may still be running, so the mark stays
                rep.ok, rep.code = False, "create_unclear"
                rep.messages = ["still on the create form, no new reason shown"]
                return rep
            rep.ok, rep.code, rep.cleared = False, "form_rejected", True  # the form is still there AND said why
            return rep
        if "adjclmref" not in url:
            # Next was pressed and the page is neither the form nor the manager page: the case may exist. Keep what is safe to keep (the page
            # name, never the address) and tell a person to look in the worklist for this plate before anything is tried again.
            rep.ok, rep.code = False, "create_unclear"
            land = re.search(r"fuseaction=([A-Za-z_]{1,40})", url)
            rep.messages = [f"landed on {land.group(1) if land else 'an unknown page'}"]
            return rep
        cid = re.search(r"caseid=(\d+)", url, re.I)
        ext = re.search(r"extid=(\d+)", url, re.I)

        def got(c, e):
            rep.case_id, rep.ext_id, rep.ok = c, e, True
            if self.on_created:  # the number is written BEFORE any other page read: nothing below can lose it
                try:
                    self.on_created(rep.case_id, rep.ext_id)
                except Exception:  # noqa: BLE001  (the end of the job writes the number again; a failed early write must not stop the manager step)
                    pass

        if cid:
            got(cid.group(1), ext.group(1) if ext else None)
        else:  # a slow page: look again for a few seconds; only the address and a hidden field named caseid count, never a link on the page
            for _ in range(3):
                w(1500)
                url = cur.url or ""
                cid = re.search(r"caseid=(\d+)", url, re.I)
                ext = ext or re.search(r"extid=(\d+)", url, re.I)
                if cid:
                    break
            if not cid:
                hid = self._ev("() => { var e = document.querySelector('input[name=caseid],input[name=CASEID]'); return e ? e.value : ''; }", None, "")
                cid = re.match(r"^(\d+)$", str(hid or ""))
            if cid:
                got(cid.group(1), ext.group(1) if ext else None)
        if not rep.case_id:
            rep.ok, rep.code = False, "create_unclear"
            rep.messages = ["manager page opened but no case number was found"]
            return rep
        w(1200)
        opts_m = self._ev(_OPTS, "ddlbMGRNAME", []) or []
        opts_a = self._ev(_OPTS, "ddlbADJNAME", []) or []
        mv = pick_person([(v, t) for v, t, _c in opts_m], spec.manager)
        av = pick_person([(v, t) for v, t, _c in opts_a], spec.adjuster)
        if not mv or not av:
            rep.note = "manager_adjuster_not_set"  # the case exists: a person sets them, the worker must not make another case
            return rep
        self._svv("ddlbMGRNAME", mv)
        self._svv("ddlbADJNAME", av)
        cur.evaluate("() => { try { SaveReport(2); } catch (e) {} }")
        w(4000)
        self._ok_loop(4)
        return rep
