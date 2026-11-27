"""Phase B estimate details in Merimen (playbook 08, step 10): the paint popup, a Damage Condition on every part row and our own misc
prices. Ported from the owner's tools/mrm-bot/estfill.mjs (cond(), misc(), the save and the read-back), pwset.mjs (paintStep) and
fillempty.mjs (a condition on rows still empty after the save).

Same rules as the other Merimen steps: only this case's dsp_details address (case id + ext id stored by Phase A), session marks never
logged, a question box is never answered. A dry run only reads the page and says what it would set. Saving is idempotent (the same
values are set again), so running Phase B again is safe.

Not here yet: manual rows with reference prices, row comments (badge / hinge / side), quantities, and the RM6,000 lift (playbook 08):
the case stops before the checks so a person does those."""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from .merimen_create import CLAIMS, redact, session_query

# --- cond(): lower-case, FIRST match wins (playbook 08 "Damage Condition"). The spare wheel retainer rule comes before the retainer rules.
_COND = [
    (r"spare wheel retainer", "Bent"),  # user 2026-11-04
    (r"roof ?lining", "Broken"),  # user 2026-10-24
    (r"bumper.*retainer", "Bracket cracked"),
    (r"bracket", "Bracket cracked"),
    (r"weather sheeting|wheel hub|wheel bearing", "Necessary"),
    (r"weatherstrip|weather strip", "Cut"),
    (r"bumper.*sensor|sensor.*bumper", "Cut"),
    (r"mirror", "Broken"),
    (r"support strut|\bstrut\b", "Broken"),
    (r"windscreen|windshield", "Broken"),
    (r"centre guide|center guide", "Broken"),
    (r"spare wheel well|wheel well", "Broken"),
    (r"lock|striker|hinge", "Bent"),
    (r"lamp panel", "Bent"),
    (r"reinforcement", "Bent"),
    (r"liner", "Damage"),
    (r"reflector|fog lamp|lamp assembly|head ?lamp|signal lamp|tail ?lamp|\blamp\b", "Cracked"),
    (r"glass|window", "Cracked"),
    (r"sensor", "Necessary"),
    (r"clip|retainer|\bguide\b|nozzle|grommet|washer", "Necessary"),
    (r"^(grille front|front grille)$", "Cut"),  # user correction FB438: Grille Front = Cut, not Broken
    (r"trim|finisher|garnish|moulding|spoiler|skirt|extractor vent|\bvent\b|badge|emblem|grille|\bmask\b|valance|\bcover\b|cladding|\bflap\b|deflector", "Broken"),
    (r"rim|tyre|wheel", "Bent"),
    (r"absorber|control arm|tie rod|crossmember|drive ?shaft|stabilizer|\blink\b|knuckle", "Bent"),
    (r"panel|tailgate|boot ?lid|bonnet|fender|quarter|\bdoor\b|floor|wheelhouse|member|pillar|roof|firewall|apron|\bdeck\b|body side|support", "Bent"),
    (r"bumper", "Broken"),
]
CONDITIONS = ("Bent", "Broken", "Cracked", "Cut", "Damage", "Necessary", "Bracket cracked")


def cond(name: str) -> str:
    n = (name or "").lower().strip()
    for rx, v in _COND:
        if re.search(rx, n):
            return v
    return "Bent"


# --- misc(): FIRST match wins, only rows Merimen lists; None = leave the row as it is (playbook 08 "Misc prices")
_MISC = [
    (r"paintwork material.*water|water.*paintwork", None),
    (r"paintwork material.*solvent", "500.00"),  # user 2026-10-10
    (r"paintwork", "500.00"),  # the generic Paintwork Materials row after the popup: 500 (user 2026-10-11)
    (r"car-o-liner|frame aligner|aligner bench|frame bench", "400.00"),
    (r"electrical", "35.00"),
    (r"underseal", "60.00"),
    (r"road test", "30.00"),
    (r"road wheel align|alignment", "45.00"),
    (r"balancing", "35.00"),
    (r"number plate", "25.00"),
    (r"windscreen sealant|glass sealant", "120.00"),  # user 2026-10-23
    (r"floor ?board sealant", "60.00"),
    (r"tail ?lamp sealant", "15.00"),
    (r"sealant", "30.00"),
    (r"other items", "35.00"),
    (r"\btyre\b", "350.00"),
    (r"air.?cond|r134", "150.00"),
    (r"fogging", "45.00"),
    (r"radiator coolant|coolant", "35.00"),  # user 2026-10-10
]


def misc(name: str) -> str | None:
    n = (name or "").lower()
    for rx, v in _MISC:
        if re.search(rx, n):
            return v
    return None


def plan_details(parts: list, miscs: list, *, only_empty: bool = False) -> dict:
    """parts: [i, name, readOnly, value]; miscs: [k, name, readOnly, value]. Returns {"PDC": {i: cond}, "MMI": {k: price}}.
    A Paintwork row is set even when Merimen makes it read-only (the popup leaves it so); the generic one is skipped when a Solvent row
    exists (never 500 twice)."""
    pdc = {}
    for i, name, ro, val, *_ in parts:
        if ro or not (name or "").strip() or (only_empty and (val or "").strip()):
            continue
        pdc[str(i)] = cond(name)
    solvent = any(re.search(r"paintwork material.*solvent", (m[1] or "").lower()) for m in miscs)
    mmi = {}
    for k, name, ro, _val in miscs:
        low = (name or "").lower()
        pw = "paintwork" in low
        if ro and not pw:
            continue
        if pw and solvent and not re.search(r"solvent|water", low):
            continue
        p = misc(name)
        if p is not None:
            mmi[str(k)] = p
    return {"PDC": pdc, "MMI": mmi}


_NAME = """el => { const tr = el && el.closest('tr'); if (!tr) return ''; for (const td of tr.querySelectorAll('td')) { const t = (td.innerText || '').trim();
  if (t && !/^[<>=*]$/.test(t)) return t.replace(/\\s+/g, ' ').slice(0, 120); } return ''; }"""
_READ = "() => { const rowName = " + _NAME + """; const v = s => document.querySelector(s);
  const pn = +((v('[name=PROWCNT]') || {}).value || 0), mn = +((v('[name=MROWCNT]') || {}).value || 0), parts = [], miscs = [];
  for (let i = 1; i <= pn; i++) { const e = v('[name=PDC' + i + ']'); if (!e) continue; const ppt = v('[name=PPT' + i + ']');
    let nm = rowName(ppt || e); if (!nm) { const d = document.getElementById('PDS' + i) || document.getElementById('PTDS' + i); nm = d ? (d.tagName === 'INPUT' ? d.value : d.textContent).replace(/\\s+/g, ' ').trim() : ''; }
    const q = v('[name=PBT' + i + ']'), c = document.getElementById('PCM' + i);
    parts.push([i, nm, !!e.readOnly, e.value || '', q ? (q.value || '1') : '1', c ? (c.value || '').trim() : '']); }
  for (let k = 1; k <= mn; k++) { const m = v('[name=MMI' + k + ']'); if (!m) continue; miscs.push([k, rowName(m), !!m.readOnly, m.value || '']); }
  return {pn, mn, pdc: document.querySelectorAll('[name^=PDC]').length, parts, miscs, man: (document.getElementById('pwm_man0') || {}).innerText || '',
          pw: typeof PWEdit === 'function'}; }"""
_SET = """(P) => { const fire = e => { e.dispatchEvent(new Event('input', {bubbles: true})); e.dispatchEvent(new Event('change', {bubbles: true})); };
  let a = 0, b = 0; for (const [i, c] of Object.entries(P.PDC)) { const e = document.querySelector('[name=PDC' + i + ']'); if (e && !e.readOnly) { e.value = c; fire(e); a++; } }
  for (const [k, p] of Object.entries(P.MMI)) { const m = document.querySelector('[name=MMI' + k + ']'); if (m) { m.readOnly = false; m.value = p; fire(m); b++; } }
  return [a, b]; }"""
_EDIT = """() => { const b = [...document.querySelectorAll('input,button,a,img,td,span')].find(e => /PWEdit\\(\\s*0\\s*,\\s*0\\s*\\)/.test(e.getAttribute('onclick') || '') || /PWEdit\\(\\s*0\\s*,\\s*0\\s*\\)/.test(e.getAttribute('href') || ''));
  if (b) { b.click(); return 'button'; } if (typeof PWEdit === 'function') { PWEdit(0, 0); return 'call'; } return ''; }"""
_POPUP = """() => { const m = document.getElementById('slePNTMAN'); if (!m) return 'noPopup'; m.value = '-1'; m.dispatchEvent(new Event('change', {bubbles: true}));
  const c = document.getElementById('sleMANCUSTOM'); if (!c) return 'noCustom'; c.style.display = ''; c.value = 'anything';
  c.dispatchEvent(new Event('change', {bubbles: true})); c.dispatchEvent(new Event('blur', {bubbles: true}));
  const k = document.getElementById('slePNTCONSUM'); if (k && k.checked) k.click();
  const s = [...document.querySelectorAll('input[type=button],button')].find(e => (e.value || e.innerText || '').trim() === 'Submit' && /PWSubmitConfirm/.test(e.getAttribute('onclick') || ''));
  if (!s) return 'noSubmit'; s.click(); return 'submitted'; }"""
_OK = """() => { const t = [...document.querySelectorAll('input,button')].find(e => /^(OK|Ok)$/.test((e.value || e.innerText || '').trim()) && e.offsetParent !== null);
  if (!t) return ''; const box = t.closest('[role=dialog],[class*=modal],[class*=dialog],[class*=popup]') || t.parentElement; const tx = (box.innerText || '').replace(/\\s+/g, ' ').trim().slice(0, 140);
  if (/are you sure|delete|overwrite|duplicate|remove/i.test(tx)) return 'STOP:' + tx; t.click(); return 'OK'; }"""
_NOIMG = "() => document.querySelectorAll('img').forEach(im => im.style.pointerEvents = 'none')"
# the paint popup's own messages ("Unsaved values will be reset...", "Retrieval completed!") are the only questions it may accept
_PAINT_OK = re.compile(r"unsaved values will be reset|retrieval completed", re.I)


class EstimateError(RuntimeError):
    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


@dataclass
class EstimateResult:
    ok: bool
    code: str = ""
    mode: str = "dry"  # dry: read and planned only; live: set and saved
    parts: int = 0
    empty: int = 0  # part rows still without a Damage Condition after the save (live) / before (dry)
    misc: dict = field(default_factory=dict)  # misc row name -> price set (or planned)
    paint: str = ""  # the Paint Manufacturer line after the popup
    notes: list = field(default_factory=list)
    review: list = field(default_factory=list)  # read-only findings for the person who submits (quantities, comments: playbook 08)

    def line(self) -> str:
        if not self.ok:
            why = {"unreadable": "the estimate page could not be read", "empty_conditions": f"{self.empty} part rows still have no Damage Condition",
                   "paint_not_set": "the Paintwork Materials price is not 500.00", "unexpected_dialog": "Merimen asked a question the worker never answers",
                   "no_save_button": "the Save button was not found", "paint_popup": f"the paint popup did not finish ({self.paint or 'no popup'})",
                   "no_rows": "the estimate has no part rows yet"}.get(self.code, self.code)
            return f"Estimate details stopped: {why}."[:300]
        verb = "set" if self.mode == "live" else "would set"
        m = ", ".join(f"{k} {v}" for k, v in list(self.misc.items())[:6])
        out = f"Estimate details {verb}: conditions on {self.parts} part rows, misc {len(self.misc)}" + (f" ({m})" if m else "") + (
            f", paint '{self.paint}'" if self.paint else "") + "."
        if self.mode == "live":
            out += (f" Check before submit ({len(self.review)}): " + "; ".join(self.review[:5]) + ("; ..." if len(self.review) > 5 else "") + "."
                    if self.review else " Read-back check: nothing to fix.")
        return out


class MerimenEstimate:
    """`page_for()` returns the logged-in Merimen tab (or None). Every call opens its own tab on this case's dsp_details and closes it."""

    def __init__(self, page_for, *, timeout_scale: float = 1.0):
        self.page_for = page_for
        self.scale = timeout_scale
        self.unexpected: list[str] = []

    def _ms(self, ms):
        return max(0, int(ms * self.scale))

    def _dialog(self, d):
        msg = d.message or ""
        if d.type in ("alert", "beforeunload") or _PAINT_OK.search(msg):
            d.accept()
            return
        self.unexpected.append(redact(msg[:120]))
        d.dismiss()

    def _open(self, case: dict):
        base = self.page_for()
        q = session_query(base.url) if base is not None else None
        cid, ext = str(case.get("merimen_caseid") or ""), str(case.get("merimen_extid") or "")
        if not q or not re.fullmatch(r"\d{4,12}", cid) or not re.fullmatch(r"\d{4,12}", ext):
            return None
        page = base.context.new_page()
        page.on("dialog", self._dialog)
        page.goto(f"{CLAIMS}?fusebox=MTRestinterface&fuseaction=dsp_details&caseid={cid}&extid={ext}&tpins=0&{q}", wait_until="domcontentloaded")
        page.wait_for_timeout(self._ms(4000))
        if page.locator("input[type=password]").count() > 0:
            page.close()
            return None
        return page

    def _reload(self, page):
        page.goto(page.url, wait_until="domcontentloaded")
        page.wait_for_timeout(self._ms(3500))

    def _settled(self, page, tries: int = 6) -> dict:
        """Render race (CDR332 filled 30 of 65): every PDC box must be on the page, and the count must hold over ~2 s."""
        last = None
        for _ in range(tries):
            r = page.evaluate(_READ)
            if r["pdc"] >= r["pn"] and last is not None and last["pdc"] == r["pdc"] and len(last["parts"]) == len(r["parts"]):
                return r
            last = r
            page.wait_for_timeout(self._ms(2000))
        raise EstimateError("unreadable")

    def _oks(self, page, rounds=3):
        for _ in range(rounds):
            r = page.evaluate(_OK) or ""
            if not r:
                return
            if r.startswith("STOP:"):
                self.unexpected.append(redact(r[5:]))
                raise EstimateError("unexpected_dialog")
            page.wait_for_timeout(self._ms(1200))

    def _save(self, page):
        page.evaluate(_NOIMG)
        btn = page.get_by_text("Save", exact=True)
        if btn.count() == 0:
            raise EstimateError("no_save_button")
        btn.first.click(force=True)
        page.wait_for_timeout(self._ms(5000))
        self._oks(page)
        if self.unexpected:
            raise EstimateError("unexpected_dialog")

    def _paint(self, page) -> str:
        """pwset.mjs: Edit -> Paint Manufacturer Other + "anything" -> consumables unticked -> Submit -> OK -> Save. Done FIRST: its confirm
        resets unsaved values."""
        if not page.evaluate(_EDIT):
            return ""
        page.wait_for_timeout(self._ms(2000))
        st = page.evaluate(_POPUP)
        if st != "submitted":
            raise EstimateError("paint_popup:" + st)
        page.wait_for_timeout(self._ms(1500))
        self._oks(page, 4)
        page.wait_for_timeout(self._ms(4000))
        self._oks(page, 4)
        man = page.evaluate("() => (document.getElementById('pwm_man0') || {}).innerText || ''")
        self._save(page)
        return man.strip()[:60]

    def read(self, case: dict) -> EstimateResult:
        """Dry run: read the page and say what would be set. Nothing is typed, nothing is clicked."""
        try:
            page = self._open(case)
        except Exception:  # noqa: BLE001
            page = None
        if page is None:
            return EstimateResult(ok=False, code="unreadable")
        try:
            r = self._settled(page)
            plan = plan_details(r["parts"], r["miscs"])
            names = {str(k): n for k, n, _ro, _v in r["miscs"]}
            return EstimateResult(ok=True, mode="dry", parts=len(plan["PDC"]), empty=sum(1 for p in r["parts"] if not p[2] and not (p[3] or "").strip()),
                                  misc={names[k][:28]: v for k, v in plan["MMI"].items()}, paint=("popup" if r["pw"] else ""))
        except EstimateError as e:
            return EstimateResult(ok=False, code=e.code)
        except Exception:  # noqa: BLE001
            return EstimateResult(ok=False, code="unreadable")
        finally:
            _close(page)

    def fill(self, case: dict) -> EstimateResult:
        """Live: paint popup, save, reload; conditions + misc, save, reload; conditions on rows still empty (fillempty), save; read back.
        Done = 0 empty part rows and the Paintwork price 500.00 (playbook 08 "Save + verify")."""
        page = self._open(case)
        if page is None:
            return EstimateResult(ok=False, code="unreadable", mode="live")
        res = EstimateResult(ok=False, mode="live")
        try:
            first = self._settled(page)
            if not first["parts"]:
                res.code = "no_rows"
                return res
            res.paint = self._paint(page) if first["pw"] else ""
            self._reload(page)
            r = self._settled(page)
            plan = plan_details(r["parts"], r["miscs"])
            names = {str(k): n for k, n, _ro, _v in r["miscs"]}
            page.evaluate(_SET, plan)
            self._save(page)
            res.parts, res.misc = len(plan["PDC"]), {names[k][:28]: v for k, v in plan["MMI"].items()}
            self._reload(page)
            r = self._settled(page)
            again = plan_details(r["parts"], [], only_empty=True)
            if again["PDC"]:  # fillempty.mjs: rows that came in during the save (manual rows move)
                page.evaluate(_SET, again)
                self._save(page)
                self._reload(page)
                r = self._settled(page)
            res.empty = sum(1 for p in r["parts"] if not p[2] and (p[1] or "").strip() and not (p[3] or "").strip())
            if res.empty:
                res.code = "empty_conditions"
                return res
            if not _paint_ok(r["miscs"]):
                res.code = "paint_not_set"
                return res
            res.ok = True
            res.review = review_rows(r["parts"])
            return res
        except EstimateError as e:
            res.code = e.code.split(":")[0]
            if e.code.startswith("paint_popup:"):
                res.paint = e.code.split(":", 1)[1]
            return res
        finally:
            _close(page)


_PAIR = re.compile(r"^(bonnet hinge|tailgate support strut|boot ?lid hinge|tailgate hinge|bumper (front|rear) sensor|door (front|rear) hinge)$")


def review_rows(parts: list) -> list:
    """Read-only checks on the saved rows (playbook 08 "Quantities to check" and "Row comments"). Nothing is changed: each finding is
    one short line for the person who submits."""
    out = []
    for row in parts:
        name = (row[1] or "").strip()
        qty, cmt = (row[4] if len(row) > 4 else "1"), (row[5] if len(row) > 5 else "")
        n = name.lower()
        try:
            q = int(float(qty or "1"))
        except ValueError:
            q = 1
        if not name:
            continue
        side = re.search(r"\b(lh|rh)\b", n)
        if re.search(r"bumper clips", n) and q % 15:
            out.append(f"{name} qty {q} (15 per bumper)")
        elif re.search(r"grille clips", n) and q != 9:
            out.append(f"{name} qty {q} (9)")
        elif _PAIR.search(n) and q != 2:
            out.append(f"{name} qty {q} (2, single row)")
        if re.search(r"badge|emblem", n) and not re.fullmatch(r"\([A-Z0-9 .\-/]+\)", cmt):
            out.append(f"{name}: comment should be the badge name in capitals, e.g. (PROTON)")
        elif re.search(r"door .*hinge", n) and not re.search(r"upper|lower", n) and not re.search(r"upper|lower", cmt, re.I):
            out.append(f"{name}: comment Upper / Lower missing")
        elif side and cmt and not re.search(r"hinge", n):
            out.append(f"{name}: has LH/RH, no comment needed")
        elif not side and q == 2 and not cmt and re.search(r"sensor|bracket|link|absorber|lamp", n):
            out.append(f"{name}: qty 2 needs the sides in the comment (Front LH & Front RH)")
    return out


def _paint_ok(miscs: list) -> bool:
    """No Paintwork row at all = nothing to check. A Solvent row must read 500.00; otherwise the generic row must."""
    rows = [(n.lower(), v) for _k, n, _ro, v in miscs if "paintwork" in (n or "").lower()]
    if not rows:
        return True
    want = [v for n, v in rows if "solvent" in n] or [v for n, v in rows if "water" not in n]
    return any(_money(v) == 500.0 for v in want)


def _money(v) -> float | None:
    try:
        return float(str(v).replace(",", "").strip())
    except ValueError:
        return None


def _close(page):
    try:
        page.close()
    except Exception:  # noqa: BLE001
        pass
