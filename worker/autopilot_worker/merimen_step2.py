"""Phase B Step 2 in Merimen: the real adapter for step2_run (catalogue / apply / selected). Ported 1:1 from the owner's
tools/mrm-bot/selcat2.mjs (read the Select Parts page), tickall.mjs + gonext.mjs (tick, Save, Thatcham "Apply & Submit", Next) and rows.mjs
(read the estimate rows back), as tools/step2/apply_plan.py runs them (playbook 07).

Same rules as the other Merimen steps: only this case's dsp_selection / dsp_details addresses (case id + ext id stored by Phase A), session
marks never logged, a question box is never answered. Ticking only ADDS ticks (tickall never unticks): a name the user changed is caught by
the two-way check afterwards and left for a person. Manual rows (parts the catalogue does not have) are added on dsp_details after Next, with a group, quantity and reference
price from manual_price.py (addparts.mjs); a row without a usable price is left out, so the two-way check lists it for a person."""

from __future__ import annotations

import re

from .merimen_create import CLAIMS, redact, session_query

_LAB = """c => { let t = ''; let n = c.nextSibling; while (n && !(n.tagName === 'INPUT' || n.tagName === 'BR')) { t += n.textContent || ''; n = n.nextSibling; }
  if (!t.trim()) { const s = c.closest('span,td'); t = s ? s.textContent : ''; } return t.replace(/\\s+/g, ' ').trim(); }"""
_READ = "() => { const lab = " + _LAB + """;
  return {cat: [...document.querySelectorAll('input[type=checkbox][name=CP]')].map(c => [c.value, lab(c), c.checked]),
          labs: [...document.querySelectorAll('input[type=checkbox][name=CL]')].map(c => [lab(c), c.checked]),
          veh: (document.body.innerText.match(/Vehicle Model:\\s*(.{0,90})/) || [])[1] || ''}; }"""
_TICK = "(T) => { const lab = " + _LAB + """; let p = 0, n = 0, r = 0, m = 0, seen = {};
  document.querySelectorAll('input[type=checkbox][name=CP]').forEach(c => { if (T.CP.includes(c.value) && !seen[c.value]) { seen[c.value] = 1; if (!c.checked) c.click(); p++; } });
  document.querySelectorAll('input[type=checkbox][name=CL]').forEach(c => { if (T.N.includes(lab(c)) && !c.checked) { c.click(); n++; } });
  document.querySelectorAll('input[type=checkbox][name=CLR]').forEach(c => { if (T.R.includes(lab(c)) && !c.checked) { c.click(); r++; } });
  document.querySelectorAll('input[type=checkbox][name=CM]').forEach(c => { if ((T.CM || []).includes(lab(c)) && !c.checked) { c.click(); m++; } });
  return [p, n, r, m]; }"""
_MCLK = """(rx) => { const t = [...document.querySelectorAll('td[onclick]')].filter(e => /MClk/.test(e.getAttribute('onclick')))
  .find(e => new RegExp(rx).test((e.value || e.textContent || '').trim())); if (t) { t.click(); return 1; } return 0; }"""
_THATCHAM = """() => { const t = [...document.querySelectorAll('input,button,a,td,span')].find(e => /^Apply & Submit$/.test((e.value || e.textContent || '').trim()) && e.offsetParent !== null);
  if (t) { t.click(); return 1; } return 0; }"""
_OK = """() => { const t = [...document.querySelectorAll('input,button')].find(e => /^OK$/.test((e.value || e.innerText || '').trim()) && e.offsetParent !== null);
  if (!t) return ''; const box = t.closest('[role=dialog],[class*=modal],[class*=dialog],[class*=popup]') || t.parentElement; const tx = (box.innerText || '').replace(/\\s+/g, ' ').trim().slice(0, 140);
  if (/are you sure|delete|overwrite|duplicate|remove/i.test(tx)) return 'STOP:' + tx; t.click(); return 'OK'; }"""
_ADD = """(R) => { const out = []; const have = []; const n0 = +((document.querySelector('[name=PROWCNT]') || {}).value || 0);
  for (let i = 1; i <= n0; i++) { const d = document.getElementById('PDS' + i); if (d && d.value) have.push(d.value.trim().toLowerCase()); }
  for (const [g, desc, price, qty, cmt] of R) { if (have.includes(desc.toLowerCase())) { out.push('have'); continue; }
    const gp = document.getElementById('PADDGP'), ds = document.getElementById('PADDDS'), pt = document.getElementById('PADDPT');
    if (!gp || !ds || !pt || typeof PCloneRow !== 'function' || typeof oest === 'undefined' || !oest.PGrp || !(g in oest.PGrp)) { out.push('nogroup'); continue; }
    gp.setAttribute('KEY', g); gp.value = oest.PGrp[g]; ds.value = desc; pt.value = price;
    try { PCloneRow(null, true); } catch (e) { out.push('err'); continue; }
    const row = document.getElementById('PROWCNT').value;
    if (qty && qty !== '1') { const q = document.getElementsByName('PBT' + row)[0]; if (q) { q.value = qty; if (typeof FormStoreUpdate === 'function') FormStoreUpdate(q); q.dispatchEvent(new Event('change', {bubbles: true})); } }
    if (cmt) { const c = document.getElementById('PCM' + row); if (c) { c.value = cmt; if (c.onblur) c.onblur(); } }
    have.push(desc.toLowerCase()); out.push('ok'); }
  return out; }"""
_ROWS = """() => { const cnt = document.querySelector('[name=PROWCNT]'); if (!cnt) return null; const n = +cnt.value; const o = [];
  for (let i = 1; i <= n; i++) { const pt = document.querySelector('[name=PPT' + i + ']'); if (!pt) continue; const tr = pt.closest('tr');
    const e = document.getElementById('PDS' + i) || document.getElementById('PTDS' + i); const d = e ? (e.tagName === 'INPUT' ? e.value : e.textContent) : (tr && tr.cells[1] ? tr.cells[1].textContent : '');
    o.push([d.replace(/\\s+/g, ' ').trim().slice(0, 80), (document.querySelector('[name=PBT' + i + ']') || {}).value || '1']); } return o; }"""


class Step2Error(RuntimeError):
    """The Select Parts page could not be used. Ticking only adds ticks, so running Phase B again is safe; the pipeline stops the case for a person."""

    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


class RealStep2:
    """`page_for()` returns the logged-in Merimen tab (or None). Every call opens its own tab and closes it."""

    def __init__(self, page_for, *, timeout_scale: float = 1.0, rows_for=None):
        self.page_for = page_for
        self.scale = timeout_scale
        self.unexpected: list[str] = []
        self.last = ""  # one short line of what apply did, for the timeline
        self._cat: list = []  # the catalogue read last (manual rows take the group of a sibling part)
        self._veh = ""  # Merimen's "Vehicle Model:" text (the reference price looks up this model)
        self.rows_for = rows_for  # (missing, cat, model) -> (rows, unpriced); default manual_price.rows_for
        self.manual: dict = {}  # what the manual-row step did: added / unpriced, for the timeline

    def _ms(self, ms):
        return max(0, int(ms * self.scale))

    def _dialog(self, d):
        if d.type in ("alert", "beforeunload"):
            d.accept()
            return
        self.unexpected.append(redact((d.message or "")[:120]))
        d.dismiss()

    def _open(self, case: dict, action: str):
        base = self.page_for()
        q = session_query(base.url) if base is not None else None
        cid, ext = str(case.get("merimen_caseid") or ""), str(case.get("merimen_extid") or "")
        if not q or not re.fullmatch(r"\d{4,12}", cid) or not re.fullmatch(r"\d{4,12}", ext):
            return None
        page = base.context.new_page()
        page.on("dialog", self._dialog)
        tail = "&tpins=0" if action == "dsp_details" else ""
        page.goto(f"{CLAIMS}?fusebox=MTRestinterface&fuseaction={action}&caseid={cid}&extid={ext}{tail}&{q}", wait_until="domcontentloaded")
        page.wait_for_timeout(self._ms(5000))
        if page.locator("input[type=password]").count() > 0:
            from . import login_seen

            login_seen.mark()
            page.close()
            return None
        return page

    @staticmethod
    def _close(page):
        try:
            page.close()
        except Exception:  # noqa: BLE001
            pass

    def catalogue(self, case: dict):
        try:
            page = self._open(case, "dsp_selection")
        except Exception:  # noqa: BLE001
            return None
        if page is None:
            return None
        try:
            r = page.evaluate(_READ)
            if not r.get("cat"):
                return None
            self._cat, self._veh = r["cat"], (r.get("veh") or "").strip()
            return {"cat": r["cat"], "labs": r["labs"], "make": (r.get("veh") or "").split(" ")[0]}
        except Exception:  # noqa: BLE001
            return None
        finally:
            self._close(page)

    def _oks(self, page, rounds=3):
        for _ in range(rounds):
            r = page.evaluate(_OK) or ""
            if not r:
                return
            if r.startswith("STOP:"):
                self.unexpected.append(redact(r[5:]))
                raise Step2Error("unexpected_dialog")
            page.wait_for_timeout(self._ms(1200))

    def _thatcham(self, page):
        for _ in range(3):
            if not page.evaluate(_THATCHAM):
                break
            page.wait_for_timeout(self._ms(6000))

    def apply(self, case: dict, plan: dict) -> None:
        """tickall.mjs + gonext.mjs. Raises Step2Error when the page cannot be used (the pipeline stops the case; running it again only adds ticks)."""
        page = self._open(case, "dsp_selection")
        if page is None:
            raise Step2Error("unreadable")
        try:
            T = {"CP": list(plan.get("CP") or []), "N": list(plan.get("N") or []), "R": list(plan.get("R") or []), "CM": list(plan.get("CM") or [])}
            p, n, r, m = page.evaluate(_TICK, T)
            if not page.evaluate(_MCLK, "^Save$"):
                raise Step2Error("no_save_button")
            page.wait_for_timeout(self._ms(3500))
            self._thatcham(page)
            self._oks(page)
            page.wait_for_timeout(self._ms(2000))
        finally:
            self._close(page)
        # gonext.mjs: a fresh Select Parts page, Next builds the estimate rows (another Thatcham Apply & Submit may come)
        page = self._open(case, "dsp_selection")
        if page is None:
            raise Step2Error("unreadable")
        try:
            if page.evaluate(_MCLK, "^Next"):
                page.wait_for_timeout(self._ms(4000))
                self._thatcham(page)
                page.wait_for_timeout(self._ms(5000))
                self._oks(page)
            if self.unexpected:
                raise Step2Error("unexpected_dialog")
            self.last = f"ticked {p} parts, labour N {n} R {r}, misc {m}"
        finally:
            self._close(page)
        missing = list(plan.get("manual") or [])
        if missing:
            self._manual(case, missing)

    def _manual(self, case: dict, missing: list) -> None:
        """addparts.mjs: one row per missing part on dsp_details (a name already there is skipped), then Save. Rows without a usable
        price are never added: the two-way check then lists them for a person."""
        if self.rows_for is None:
            from .manual_price import rows_for as default

            self.rows_for = default
        rows, unpriced = self.rows_for(missing, self._cat, self._veh or str(case.get("car_model") or ""))
        self.manual = {"rows": rows, "unpriced": unpriced, "added": 0}
        if not rows:
            return
        page = self._open(case, "dsp_details")
        if page is None:
            raise Step2Error("unreadable")
        try:
            res = page.evaluate(_ADD, rows)
            self.manual["added"] = res.count("ok")
            if "ok" in res:
                for _ in range(2):
                    page.wait_for_timeout(self._ms(250))
                    self._oks(page, 2)
                page.evaluate("() => document.querySelectorAll('img').forEach(im => im.style.pointerEvents = 'none')")
                btn = page.get_by_text("Save", exact=True)
                if btn.count() == 0:
                    raise Step2Error("no_save_button")
                btn.first.click(force=True)
                page.wait_for_timeout(self._ms(6000))
                self._oks(page)
            if self.unexpected:
                raise Step2Error("unexpected_dialog")
            self.last += f", manual rows {self.manual['added']}" + (f" ({len(unpriced)} without a price)" if unpriced else "")
        finally:
            self._close(page)

    def selected(self, case: dict):
        try:
            page = self._open(case, "dsp_details")
        except Exception:  # noqa: BLE001
            return None
        if page is None:
            return None
        try:
            rows = page.evaluate(_ROWS)
            return None if rows is None else [(str(a), str(b or "1")) for a, b in rows]
        except Exception:  # noqa: BLE001
            return None
        finally:
            self._close(page)
