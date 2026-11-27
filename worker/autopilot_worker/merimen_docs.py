"""Phase A: upload the case's documents (playbook 06 "Documents") and read Merimen's lists back.

Ported from tools/mrm-bot/uploadpar.mjs and uploadphotos.mjs. It drives the logged-in Merimen tab of the worker Chrome through Playwright.
It never types a password, never prints or logs a page address (the session marks live in it), never builds dsp_docmanage / act_docinfo
addresses (they log the session out), and never clicks Logout. A dry run (writes off) only READS the list; it never opens an upload page.

Nothing here retries a login. A page that shows a password box is "not_logged_in" and the step stops."""

from __future__ import annotations

import os
import re
import tempfile
from dataclasses import dataclass, field

from .merimen_create import CLAIMS, redact, session_query

DOC_VIEW = "fusebox=MTRdoc&fuseaction=dsp_docview&domainid=1&objid={cid}&extid={ext}&corole=4"
MAX_BYTES = 5 * 1024 * 1024  # playbook 06: Merimen silently drops a file over 5 MB
SAFE_BYTES = int(4.8 * 1024 * 1024)
DPIS = (150, 120, 100, 85, 72)


class DocError(Exception):
    def __init__(self, code: str, detail: str = ""):
        super().__init__(code)
        self.code, self.detail = code, detail


def doc_label(name: str) -> str:
    """Document Name (FDESC) by what the file is, not its file name (playbook 06)."""
    n = (name or "").upper()
    if re.search(r"GERAN|\bRC\b|OWNERSHIP", n):
        return "RC"
    if re.search(r"JPJ\s*SEARCH|TP\s*INS|I-?SEARCH", n):
        return "JPJ SEARCH"
    if re.search(r"POLICY|\bINS\b", n):
        return "INS"
    if re.search(r"P\.?\s*REPORT|POLICE|LAPORAN", n):
        return "P.REPORT"
    return "DOC"


def doc_plan(files: list[dict]) -> list[dict]:
    """The PDFs of the case, in file order, each with its Merimen label. Photos and zips are not documents."""
    out = []
    for f in files:
        if (f.get("kind") or "") not in ("pdf", ""):
            continue
        name = f.get("name") or ""
        if not name.lower().endswith(".pdf"):
            continue
        out.append({"id": f.get("id"), "name": name, "label": doc_label(name), "local": f.get("local")})
    return out


def pdf_rows(texts: list[str]) -> list[str]:
    """Captions of the rows of a docview list that are documents (not photos). A photo row says 'Load JPG'; a document row does not."""
    return [t for t in texts if t and "Load JPG" not in t]


def shrink(path: str) -> str:
    """A PDF over 5 MB becomes JPEG pages rebuilt into a PDF until it is under 4.8 MB (steps 150 -> 72 dpi). Files up to 5 MB are untouched.
    Returns the path to upload. Raises DocError("too_big") rather than uploading something Merimen would silently drop."""
    size = os.path.getsize(path)
    if size <= MAX_BYTES:
        return path
    try:
        import fitz  # PyMuPDF
    except Exception as e:  # noqa: BLE001
        raise DocError("too_big", "PyMuPDF is missing") from e
    src = fitz.open(path)
    try:
        for dpi in DPIS:
            out = fitz.open()
            for page in src:
                pix = page.get_pixmap(matrix=fitz.Matrix(dpi / 72, dpi / 72))
                img = out.new_page(width=page.rect.width, height=page.rect.height)
                img.insert_image(img.rect, stream=pix.tobytes("jpg"))
            dest = os.path.join(tempfile.mkdtemp(prefix="doc-"), os.path.basename(path))
            out.save(dest, deflate=True)
            out.close()
            if os.path.getsize(dest) < SAFE_BYTES:
                return dest
    finally:
        src.close()
    raise DocError("too_big", "still over 4.8 MB at 72 dpi")


@dataclass
class DocReport:
    ok: bool = True
    code: str | None = None
    uploaded: int = 0
    skipped: int = 0
    planned: int = 0
    note: str = ""

    def line(self) -> str:
        if not self.ok:
            return f"Documents not uploaded: {self.code}" + (f" ({self.note})" if self.note else "")
        if self.uploaded:
            return f"Documents uploaded: {self.uploaded}" + (f", {self.skipped} already there" if self.skipped else "")
        if self.skipped and not self.planned - self.skipped:
            return f"Documents already in Merimen ({self.skipped})"
        return f"Documents (dry run): would upload {self.planned - self.skipped}" + (f", {self.skipped} already there" if self.skipped else "")


class MerimenPage:
    """The few Playwright reads and clicks the document and photo steps share. `base` is the logged-in claims tab; every operation opens
    (and closes) tabs of its own."""

    def __init__(self, base, *, scale: float = 1.0):
        self.base = base
        self.scale = scale
        self.tabs: list = []

    def ms(self, n: int) -> int:
        return max(0, int(n * self.scale))

    def query(self) -> str:
        q = session_query(self.base.url)
        if not q:
            raise DocError("not_logged_in")
        return q

    def open(self, url: str):
        tab = self.base.context.new_page()
        self.tabs.append(tab)
        tab.on("dialog", lambda d: d.accept())
        tab.goto(url, wait_until="domcontentloaded")
        tab.wait_for_timeout(self.ms(2500))
        if tab.locator("input[type=password]").count() > 0:
            raise DocError("not_logged_in")
        return tab

    def docview(self, case_id: str, ext_id: str):
        return self.open(f"{CLAIMS}?{DOC_VIEW.format(cid=case_id, ext=ext_id)}&{self.query()}")

    def rows(self, case_id: str, ext_id: str) -> list[str]:
        """The captions of every document and photo row of the case, in Merimen order (text of each row, whitespace squeezed)."""
        tab = self.docview(case_id, ext_id)
        try:
            return tab.evaluate(
                "()=>[...document.querySelectorAll('a[href*=\"SVCDOCAttView\"]')].map(a=>{const t=a.closest('tr');return t?t.innerText.replace(/\\s+/g,' ').trim():''})"
            ) or []
        finally:
            self.close_tab(tab)

    def close_tab(self, tab) -> None:
        try:
            tab.close()
        except Exception:  # noqa: BLE001
            pass
        if tab in self.tabs:
            self.tabs.remove(tab)

    def close(self) -> None:
        for t in list(self.tabs):
            self.close_tab(t)


def run_docs(page, case: dict, case_id: str, ext_id: str, *, writes: bool) -> DocReport:
    """Upload the case's PDFs one at a time (a fresh upload popup per file, as the owner's script does). Reads the list first; a document
    whose label is already there is skipped. A dry run (`writes` False) only counts."""
    plan = doc_plan(case.get("files") or [])
    rep = DocReport(planned=len(plan))
    if not plan:
        rep.ok, rep.code, rep.note = False, "no_documents", "no PDF in the case"
        return rep
    if not case_id or not ext_id:
        rep.note = "no Merimen case yet: nothing to read"  # a dry run before the create: the plan alone is the answer
        return rep
    mp = page if isinstance(page, MerimenPage) else MerimenPage(page)
    try:
        have = mp.rows(case_id, ext_id)
        # No double uploads (playbook 06), decided by COUNT, because a row's text format is not proven: no document rows -> upload all;
        # as many rows as planned or more -> all are there; anything in between -> a person looks (never guess which one is missing).
        have_docs = len(pdf_rows(have))
        if have_docs >= len(plan):
            rep.skipped, todo = len(plan), []
        elif have_docs == 0:
            todo = list(plan)
        else:
            raise DocError("docs_partial", f"Merimen has {have_docs} of {len(plan)} documents")
        if not writes:
            return rep
        for d in todo:
            if not d.get("local"):
                raise DocError("file_missing", d["name"][:60])
            path = shrink(d["local"])
            _upload_one(mp, case_id, ext_id, path, d["label"])
            rep.uploaded += 1
        after = mp.rows(case_id, ext_id)
        if todo and len(pdf_rows(after)) < len(pdf_rows(have)) + len(todo):
            raise DocError("not_in_list", f"expected {len(pdf_rows(have)) + len(todo)} document rows, found {len(pdf_rows(after))}")
    except DocError as e:
        rep.ok, rep.code, rep.note = False, e.code, redact(e.detail)[:120]
    except Exception as e:  # noqa: BLE001
        rep.ok, rep.code, rep.note = False, "docs_error", redact(type(e).__name__)
    finally:
        mp.close()
    return rep


def _upload_one(mp: MerimenPage, case_id: str, ext_id: str, path: str, label: str) -> None:
    tab = mp.docview(case_id, ext_id)
    popup = None
    try:
        with tab.expect_popup(timeout=mp.ms(8000)) as info:
            tab.get_by_role("button", name=re.compile("Upload Documents", re.I)).first.click(force=True, timeout=mp.ms(6000))
        popup = info.value
    except Exception as e:  # noqa: BLE001
        mp.close_tab(tab)
        raise DocError("no_upload_popup") from e
    try:
        popup.on("dialog", lambda d: d.accept())
        popup.wait_for_timeout(mp.ms(2000))
        popup.locator("input[type=file]").first.set_input_files(path)
        popup.wait_for_timeout(mp.ms(2500))
        ok = popup.evaluate(
            """(fdesc)=>{var ft=document.querySelector('select[name=FTYPE]');var hit=false;
            if(ft)for(var i=0;i<ft.options.length;i++){if(/^Other$/i.test(ft.options[i].text.trim())){ft.value=ft.options[i].value;ft.dispatchEvent(new Event('change',{bubbles:true}));hit=true;break;}}
            var fd=document.querySelector('[name=FDESC]');if(fd){fd.value=fdesc;fd.dispatchEvent(new Event('change',{bubbles:true}));}
            return hit&&!!fd;}""",
            label,
        )
        if not ok:
            raise DocError("upload_form_unexpected")  # no "Other" type or no description box: never upload with an empty type (silent failure)
        popup.get_by_role("button", name=re.compile("Start upload", re.I)).first.click(force=True, timeout=mp.ms(3000))
        popup.wait_for_timeout(mp.ms(6000))
    finally:
        try:
            popup.close()
        except Exception:  # noqa: BLE001
            pass
        mp.close_tab(tab)
