"""Phase A / B photo steps in Merimen: the real `MerimenPhotos` of photo_sync.py. Ported from tools/mrm-bot/{listphotos,uploadphotos,relabel_ui,
reorder_ui,chkorder}.mjs and playbook 06. UI clicks only: the Relabel/Reorder link, never a hand-built dsp_docmanage address (that logs out).

Reads (labels, verify) are always safe. upload / relabel / reorder only run when photo_sync calls them, which it does only with writes on."""

from __future__ import annotations

import re
import threading

from .merimen_create import CLAIMS, redact
from .merimen_docs import DocError, MerimenPage
from .photo_sync import NotPorted

UPLOAD_PAGE = ("fusebox=SVCdoc&fuseaction=dsp_docupload&domainid=1&objid={cid}&corole=4&docclassid=2&maxno=250&picwidth=&picheight=&picfixort="
               "&BCO_FLAGMODE=ADD&BCOREAD=&BCOCONTROL=&SHOWLABEL=0&DEFAULTSEL=&nolayout=1")
BATCH = 250
# one Relabel/Reorder page at a time in this process (WORKER_SLOTS > 1): parallel relabel windows close each other's popups
# (tools/batch/phase_b.py, batch 8). Reads and uploads are not held back.
RELABEL_LOCK = threading.Lock()
LABEL_RX = re.compile(r"\d+ \d\d/\d\d/\d\d \d\d:\d\d (.+?) Load JPG")


def photo_labels(rows: list[str]) -> list[str]:
    """Captions of the photo rows, in Merimen order. A photo row reads '<n> <date> <time> <caption> Load JPG'."""
    out = []
    for r in rows:
        m = LABEL_RX.search(r or "")
        if m:
            out.append(m.group(1).strip())
    return out


def compare(plan_names: list[str], labels: list[str]) -> dict:
    """chkorder.mjs: count, position-by-position mismatches, and the 0-based plan positions that are MISSING (walk both lists in order)."""
    mismatch = sum(1 for i, n in enumerate(plan_names) if i >= len(labels) or labels[i] != n)
    miss, j = [], 0
    for i, n in enumerate(plan_names):
        if j < len(labels) and labels[j] == n:
            j += 1
        else:
            miss.append(i)
    return {"count": len(labels), "mismatch": mismatch, "missing": miss if len(labels) < len(plan_names) else []}


class RealPhotos:
    """`local_of(row id)` -> the downloaded ORIGINAL file of that photo (not the 900 px copy)."""

    def __init__(self, page, local_of, *, scale: float = 1.0):
        self.mp = MerimenPage(page, scale=scale)
        self.local_of = local_of

    def _ids(self, case: dict) -> tuple[str, str]:
        cid, ext = case.get("merimen_caseid"), case.get("merimen_extid")
        if not cid or not ext:
            raise NotPorted("no Merimen case number yet")
        return str(cid), str(ext)

    def labels(self, case: dict):
        try:
            cid, ext = self._ids(case)
            return photo_labels(self.mp.rows(cid, ext))
        except (DocError, NotPorted):
            return None
        except Exception:  # noqa: BLE001
            return None
        finally:
            self.mp.close()

    def verify(self, case: dict, plan: list[dict]) -> dict:
        got = self.labels(case)
        if got is None:
            return {"count": -1, "mismatch": len(plan), "missing": []}
        return compare([p["name"] for p in plan], got)

    def upload(self, case: dict, plan: list[dict], chunks: list[list[dict]]) -> None:
        cid, _ext = self._ids(case)
        try:
            for chunk in chunks or [plan]:
                files = []
                for p in chunk:
                    path = self.local_of(p["id"])
                    if not path:
                        raise DocError("file_missing", p.get("src", "")[:60])
                    files.append(path)
                tab = self.mp.open(f"{CLAIMS}?{UPLOAD_PAGE.format(cid=cid)}&{self.mp.query()}")
                tab.locator("input[type=file]").first.set_input_files(files)
                tab.wait_for_timeout(self.mp.ms(3000 + len(files) * 80))
                r = tab.evaluate(
                    """(B)=>{const T=[...document.querySelectorAll('select[name=FTYPE]')],D=[...document.querySelectorAll('input[name=FDESC]')];const bad=[];
                    B.forEach((x,i)=>{const s=T[i],d=D[i];if(!s||!d){bad.push(i);return;}const o=[...s.options].find(o=>o.text.trim()===x[0]);if(!o){bad.push('type'+i);return;}
                    s.value=o.value;if(window.jQuery)jQuery(s).val(o.value).trigger('change');else s.dispatchEvent(new Event('change',{bubbles:true}));
                    d.value=x[1];d.dispatchEvent(new Event('change',{bubbles:true}));d.dispatchEvent(new Event('input',{bubbles:true}));});
                    return {rows:T.length,bad};}""",
                    [[p["ftype"], p["name"]] for p in chunk],
                )
                if r["rows"] != len(chunk) or r["bad"]:
                    raise DocError("upload_form_unexpected", f"rows {r['rows']} of {len(chunk)}, bad {len(r['bad'])}")  # nothing is started
                tab.locator("button.start,button:has-text('Start upload')").first.click(force=True)
                for _ in range(900):  # up to 15 minutes, one second apart
                    tab.wait_for_timeout(self.mp.ms(1000))
                    try:
                        if not tab.evaluate("()=>document.querySelectorAll('.template-upload').length"):
                            break
                    except Exception:  # noqa: BLE001
                        break  # the page moved on or closed: the upload is over, verify() reads the list
                tab.wait_for_timeout(self.mp.ms(2000))
                self.mp.close_tab(tab)
        finally:
            self.mp.close()

    # ---- Relabel/Reorder page (one popup or page; the photos section's link is the one whose page has more than 20 ONM boxes) ----
    def _relabel_page(self, cid: str, ext: str):
        tab = self.mp.docview(cid, ext)
        links = tab.locator("a:has-text('Relabel/Reorder')")
        n = links.count()
        for i in range(n - 1, -1, -1):
            popup = None
            try:
                with tab.expect_popup(timeout=self.mp.ms(6000)) as info:
                    links.nth(i).click()
                popup = info.value
            except Exception:  # noqa: BLE001
                popup = None
            if popup:
                self.mp.tabs.append(popup)  # closed with the others, also when the step stops
            target = popup or tab
            target.wait_for_timeout(self.mp.ms(2500))
            count = target.evaluate("()=>document.querySelectorAll('input[name^=ONM]').length")
            if count > 20:  # the photos' page (the documents' link leads to a short list)
                return target, count
            if popup:
                self.mp.close_tab(popup)
            else:
                tab.go_back()
                tab.wait_for_timeout(self.mp.ms(1500))
        raise DocError("no_photo_page")

    def _save(self, target) -> None:
        target.evaluate("()=>{var b=[...document.querySelectorAll('input[type=button],button,input[type=submit]')].find(e=>/^\\s*Save\\s*$/i.test(e.value||e.innerText||''));if(b)b.click();}")
        target.wait_for_timeout(self.mp.ms(4500))
        for _ in range(3):
            ok = target.evaluate("()=>{const t=[...document.querySelectorAll('input,button')].find(e=>((e.value||e.innerText||'').trim()==='OK')&&e.offsetParent!==null);if(t){t.click();return true;}return false;}")
            if not ok:
                break
            target.wait_for_timeout(self.mp.ms(1200))

    def relabel(self, case: dict, mapping: dict[str, list[str]]) -> None:
        cid, ext = self._ids(case)
        with RELABEL_LOCK:
            self._relabel_locked(cid, ext, mapping)

    def _relabel_locked(self, cid: str, ext: str, mapping) -> None:
        try:
            target, _n = self._relabel_page(cid, ext)
            r = target.evaluate(
                """(J)=>{const onm=[...document.querySelectorAll('input[name^=ONM]')];const bad=[];
                for(const k in J){const e=onm[+k-1];if(!e){bad.push(k+':missing');continue;}if(e.value.trim()!==J[k][0]){bad.push(k+':differs');continue;}}
                if(bad.length)return {bad};
                for(const k in J){const e=onm[+k-1];e.value=J[k][1];e.dispatchEvent(new Event('change',{bubbles:true}));}
                return {bad};}""",
                mapping,
            )
            if r["bad"]:
                raise DocError("relabel_refused", ", ".join(r["bad"][:5]))  # a caption is not what was expected: nothing was changed or saved
            self._save(target)
        finally:
            self.mp.close()

    def reorder(self, case: dict, mapping: dict[str, list]) -> None:
        cid, ext = self._ids(case)
        with RELABEL_LOCK:
            self._reorder_locked(cid, ext, mapping)

    def _reorder_locked(self, cid: str, ext: str, mapping) -> None:
        try:
            target, _n = self._relabel_page(cid, ext)
            r = target.evaluate(
                """(J)=>{const rows=[...document.querySelectorAll('input[name^=ONM]')].map(o=>{const tr=o.closest('tr');return {o,sdo:tr.querySelector('input[name^=SDO]')}});const bad=[];
                rows.forEach((x,i)=>{const k=String(i+1);if(!J[k]){bad.push(k+':no map');return;}if(x.o.value.trim()!==J[k][0])bad.push(k+':name');if(!x.sdo||+x.sdo.value!==i+1)bad.push(k+':order');});
                if(rows.length!==Object.keys(J).length)bad.push('count');
                if(bad.length)return {bad};
                rows.forEach((x,i)=>{x.sdo.value=String(J[String(i+1)][1]);x.sdo.dispatchEvent(new Event('change',{bubbles:true}));x.sdo.dispatchEvent(new Event('blur'));});
                return {bad};}""",
                mapping,
            )
            if r["bad"]:
                raise DocError("reorder_refused", ", ".join(r["bad"][:5]))
            self._save(target)
        finally:
            self.mp.close()
