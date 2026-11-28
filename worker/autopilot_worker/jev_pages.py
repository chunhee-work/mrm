"""Jev page check (plan #103): sort a case's PDF pages by type, then check the RC card against what the reader wrote.

Rule (owner 2026-11-10): Jev only WARNS. It never changes a case, never sets pending, never blocks or fails a job. Every problem (no key, no
PyMuPDF, too many pages, a timeout, an odd answer) returns no lines. Off unless JEV_PAGES=1 (and the Jev key is set, and JEV is not 0).
Only the case's PDFs are opened (case_files kind pdf); a damage photo is an image file and never reaches this module.
Pages are rendered in memory and never written to disk; page bytes and Jev answers are never logged."""

from __future__ import annotations

import base64
import hashlib
import re
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from concurrent.futures import TimeoutError as FutureTimeout
from typing import Callable

from .jev import Jev, JevError

PAGE_MODEL = "jev-preview"  # image questions need the preview model (handoff)
MAX_PAGES = 60  # per case; more and nothing is sent
MAX_PDF_BYTES = 25 * 1024 * 1024
PARALLEL = 4
BUDGET_S = 60.0  # the whole pass; over it, nothing is reported (all or nothing)
DPI = 100
RC_DPI = 150  # the RC card has small print (cc, date): one sharper render for the one RC page
MAX_SIDE_PX = 2000
SURE = 0.9  # a warning needs this much
PRESENT = 0.7  # a page counts as "this document is here" from this confidence (owner tests: 100% right at >= 0.7)
MAX_LINES = 4
DAILY_PAGES = 600  # default per-process cap per calendar day (JEV_PAGES_DAILY overrides)

# Owner-tested v2 prompts (typesafe/judgments.py, 84 pages / 10 cases: doc type 96%). Copied here because the worker image only has typesafe/photo_train.
DOC_TYPES = {
    "vehicle_ownership_certificate": "JPJ Sijil Pemilikan Kenderaan / vehicle ownership certificate (geran).",
    "insurance_schedule_or_cover_note": "An insurer's policy schedule, certificate or cover note for a vehicle.",
    "isearch_report": ("A vehicle look-up printout (ISM/MyCarInfo I-SEARCH, or a JPJ mySIKAP 'Butir-Butir Kenderaan / "
                       "Pemilik / Insurans' page) listing a vehicle's owner, insurer and policy number. Not issued by the insurer."),
    "police_report": "A police report (Repot Polis) narrative made by a party.",
    "police_investigation_result": "The police Keputusan Penyiasatan letter naming the party at fault (disalahkan).",
    "police_sketch": "A police sketch plan (Rajah Kasar) or measurement page.",
    "road_tax": "A road tax / Lesen Kenderaan Motor disc.",
    "__none__": "Something else or unreadable.",
}

# one canonical name per document the workflow needs; every other label is "other" and never leads to a warning
CANON = {
    "vehicle_ownership_certificate": "rc",
    "insurance_schedule_or_cover_note": "our_policy",
    "isearch_report": "isearch",
    "police_report": "police_report",
    "police_investigation_result": "keputusan",
}
NEEDED = ("rc", "our_policy", "police_report", "keputusan", "isearch")
# stored (English) wording of a document in the Activity line; the web app translates the line
DOC_WORDS = {"rc": "RC", "our_policy": "our insurance", "police_report": "our police report", "keputusan": "Keputusan", "isearch": "I-SEARCH"}
# which pages must be OUR side: the client's RC, the client's insurance and the client's police report. I-SEARCH is the other party's, Keputusan is shared.
OUR_SIDE = {"rc", "our_policy", "police_report"}
OURS_MIN = 0.5


def reader_missing(text: str) -> str | None:
    """A missing-document sentence written by the reader -> one of NEEDED (same reading as docKey() in web/src/lib/case-text.ts); None = not a needed one."""
    s = text.lower()
    if re.search(r"keputusan|investigation result|penyiasatan", s):
        return "keputusan"
    if re.search(r"i-?search", s):
        return "isearch"
    if re.search(r"jpj|rc\b|sijil pemilikan|log ?book|chassis|registration", s):
        return "rc"
    if re.search(r"insurance|schedule|policy|cover note|polisi", s):
        return "our_policy"
    if re.search(r"at-?fault.*(police|report)|(police|report).*at-?fault|disalahkan", s):
        return None  # the other party's police report is not one of the five
    if re.search(r"police|polis", s):
        return "police_report"
    return None


def questions() -> dict:
    return {
        "doc_type": {"type": "choice", "criteria": DOC_TYPES,
                     "instructions": "`page` is one scanned page from a Malaysian motor-insurance claim bundle. What kind of document is it?"},
        "belongs": {"type": "noul", "instructions": (
            "Our client's vehicle is `our_plate`. Does `page` belong to OUR client's side of the case "
            "(our vehicle's registration/insurance/road tax, a police report made by our driver, or the "
            "police investigation result / sketch of this accident), as opposed to the OTHER party's "
            "vehicle, insurance, vehicle search or police report?")},
        "blamed": {"type": "noul", "instructions": "Does `page` state which party or vehicle the police blamed (disalahkan) for the accident?"},
        "by_our_driver": {"type": "noul", "instructions": (
            "If `page` is a police report (Repot Polis): in 'Pengadu Menyatakan', is the complainant describing driving "
            "vehicle `our_plate` themselves (\"saya memandu ... `our_plate`\"), rather than another vehicle? "
            "Ignore spaces in plate numbers. If `page` is not a police report, answer no.")},
    }


def _prob(a) -> float | None:
    v = (a or {}).get("noul") if isinstance(a, dict) else None
    return float(v) if isinstance(v, (int, float)) and not isinstance(v, bool) and 0.0 <= v <= 1.0 else None


def parse_page(resp: dict) -> dict | None:
    """{label, conf, ours} from one answer, or None when anything is off (unknown label, missing id, wrong type, number outside 0..1)."""
    ans = (resp or {}).get("answers")
    if not isinstance(ans, dict):
        return None
    dt = ans.get("doc_type")
    if not isinstance(dt, dict):
        return None
    label, conf = dt.get("choice"), dt.get("confidence")
    if label not in DOC_TYPES or not isinstance(conf, (int, float)) or isinstance(conf, bool) or not 0.0 <= conf <= 1.0:
        return None
    belongs, by_driver = _prob(ans.get("belongs")), _prob(ans.get("by_our_driver"))
    if belongs is None or by_driver is None:
        return None
    return {"label": label, "conf": float(conf), "ours": max(belongs, by_driver) if label == "police_report" else belongs}  # a police report page counts as ours if either signal says so (a continuation page has no "Pengadu Menyatakan")


def norm_model(v) -> str:
    return " ".join(str(v or "").upper().split())


def norm_cc(v) -> str:
    """Digits of a plain cc value (1798, 1,798, 1798 cc); anything else (1.5L, 1498.0) gives "" so the field is not asked."""
    m = re.fullmatch(r"\s*(\d{1,3}(?:[,\s]\d{3})+|\d+)\s*(?:cc)?\s*", str(v or ""), re.I)
    return re.sub(r"\D", "", m.group(1)) if m else ""


def norm_date(v) -> str:
    return str(v or "").strip()


def rc_questions(data: dict) -> tuple[dict, dict]:
    """(state, questions) for the three RC checks; a field with no stored value is not asked."""
    cv = (data or {}).get("client_vehicle") or {}
    state, qs = {}, {}
    model, cc, date = norm_model(cv.get("model")), norm_cc(cv.get("cc")), norm_date(cv.get("registration_date"))
    if model:
        state["model"] = model
        qs["model"] = {"type": "noul", "instructions": "Does `page` (a JPJ ownership certificate) show the vehicle model `model` as Buatan/Nama Model? Spacing, letter case and a shortened maker or model name do not matter."}
    if cc:
        state["cc"] = cc
        qs["cc"] = {"type": "noul", "instructions": "Does `page` show Keupayaan Enjin (engine capacity) `cc` cc? Thousands separators do not matter."}
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", date):
        state["registration_date"] = date
        qs["date"] = {"type": "noul", "instructions": ("Does `page` show Tarikh Pendaftaran (registration date) `registration_date` (YYYY-MM-DD)? "
                                                      "The card may write it as DD/MM/YYYY, DD-MM-YYYY or with a month name: that is the same date.")}
    return state, qs


# ---- day cap and per-PDF cache (in this process only; nothing is stored)
_day = {"d": "", "pages": 0, "cap": DAILY_PAGES}  # cap = this run's daily cap, for the helpers
_cache: dict[tuple, dict] = {}  # (pdf sha, our plate, page in that pdf) -> a parsed page; (pdf sha, "af:"+at-fault plate, page) -> {"p": yes}


def _daily_cap(env) -> int:
    try:
        return max(0, int(env.get("JEV_PAGES_DAILY") or DAILY_PAGES))
    except ValueError:
        return DAILY_PAGES


def enabled(env) -> bool:
    return env.get("JEV_PAGES") == "1" and env.get("JEV") != "0" and bool((env.get("TYPESAFE_API_KEY") or "").strip())


def pymupdf_ok() -> bool:
    try:
        import fitz  # noqa: F401  (PyMuPDF)
        return True
    except Exception:  # noqa: BLE001
        return False


def _jpg(doc, i: int, dpi: int = DPI) -> bytes:
    page = doc[i]
    r = page.rect
    zoom = min(dpi / 72.0, MAX_SIDE_PX / max(r.width, r.height, 1.0))
    import fitz

    return page.get_pixmap(matrix=fitz.Matrix(zoom, zoom)).tobytes("jpg")


def _asset(jpg: bytes) -> tuple[str, dict]:
    ref = str(uuid.uuid4())
    return ref, {ref: {"type": "image", "format": "jpg", "data_base64": base64.b64encode(jpg).decode()}}


def run(jev: Jev, case: dict, fetch: Callable[[str], bytes | None], *, env=None, now=time.monotonic, today=lambda: time.strftime("%Y-%m-%d")) -> list[str]:
    """The Activity lines (stored English, at most MAX_LINES) for one case. [] on anything but a clean, complete pass."""
    env = env or {}
    _day["cap"] = _daily_cap(env)
    _day["af_on"] = env.get("JEV_ISEARCH_PLATE") != "0"  # one switch for the I-SEARCH plate question alone
    cid = case.get("id")
    try:
        return _run(jev, case, fetch, env, now, today(), cid)
    except Exception:  # noqa: BLE001  (nothing here may ever stop a case)
        return []


def _run(jev, case, fetch, env, now, day, cid) -> list[str]:
    try:
        import fitz
    except Exception:  # noqa: BLE001
        return []
    all_files = case.get("files", [])
    files = [f for f in all_files if f.get("kind") == "pdf" and f.get("url")]  # a damage photo is never a case_files pdf
    if not files:
        return []
    # a file we did not open (a pdf row without a link, or an image that is not a photo) means we cannot prove a document is absent
    def opened(z) -> bool:  # a zip counts only when its contents were stored as ordinary rows (url holds /unzipped-<zip id>/), same test as the web app
        return any(f"/unzipped-{z.get('id')}/" in str(g.get("url") or "") for g in all_files)

    complete = all(f.get("kind") in ("pdf", "photo", "bundle_zip") and (f.get("kind") != "pdf" or f.get("url")) and (f.get("kind") != "bundle_zip" or opened(f)) for f in all_files)
    t0 = now()
    docs: list[tuple[str, object]] = []  # (sha, open document), one per distinct PDF
    try:
        seen = set()
        for f in files:
            if now() - t0 > BUDGET_S:
                jev.log("page_sort", case_id=cid, ok=False, error_class="skip_budget", model=PAGE_MODEL)
                return []
            raw = fetch(f["url"])
            if not raw or len(raw) > MAX_PDF_BYTES:
                jev.log("page_sort", case_id=cid, ok=False, error_class="skip_file", model=PAGE_MODEL)
                return []
            sha = hashlib.sha256(raw).hexdigest()
            if sha in seen:
                continue
            seen.add(sha)
            try:
                d = fitz.open(stream=raw, filetype="pdf")
            except Exception:  # noqa: BLE001
                jev.log("page_sort", case_id=cid, ok=False, error_class="skip_corrupt", model=PAGE_MODEL)
                return []
            docs.append((sha, d))
            if d.needs_pass or d.is_encrypted:
                jev.log("page_sort", case_id=cid, ok=False, error_class="skip_encrypted", model=PAGE_MODEL)
                return []
        total = sum(len(d) for _, d in docs)
        if total == 0 or total > MAX_PAGES:
            jev.log("page_sort", case_id=cid, ok=False, error_class="skip_pages", model=PAGE_MODEL)
            return []
        if _day["d"] != day:
            _day["d"], _day["pages"] = day, 0
        plate = str(case.get("plate") or "")
        pages = [(sha, i, d) for sha, d in docs for i in range(len(d))]  # global page order = results order
        todo = [k for k, (sha, i, _d) in enumerate(pages) if (sha, plate, i) not in _cache]
        if _day["pages"] + len(todo) + 1 > _daily_cap(env):
            jev.log("page_sort", case_id=cid, ok=False, error_class="skip_daily_cap", model=PAGE_MODEL)
            return []
        # render here, one page at a time (a MuPDF document is not thread-safe); the pool only does the network call, with bytes
        try:
            rendered = {k: _jpg(pages[k][2], pages[k][1]) for k in todo}
        except Exception:  # noqa: BLE001
            jev.log("page_sort", case_id=cid, ok=False, error_class="skip_render", model=PAGE_MODEL)
            return []
        qs = questions()

        def one(k):
            ref, assets = _asset(rendered[k])
            return k, parse_page(jev.ask({"page": ref, "our_plate": plate}, qs, purpose="page_sort", case_id=cid, assets=assets, model=PAGE_MODEL))

        if todo:
            ex = ThreadPoolExecutor(PARALLEL)
            ok = 0
            try:
                futs = [ex.submit(one, k) for k in todo]
                deadline = t0 + BUDGET_S
                for f in futs:
                    k, parsed = f.result(timeout=max(0.1, deadline - now()))
                    ok += 1
                    sha, i, _d = pages[k]
                    if parsed is not None:  # an unreadable answer is never remembered: the next run asks again
                        _cache[(sha, plate, i)] = parsed
            except (FutureTimeout, JevError):
                for f in futs:  # keep every page that did answer, so a re-run asks only for the rest
                    if f.done() and not f.cancelled() and f.exception() is None:
                        k, parsed = f.result()
                        if parsed is not None and (pages[k][0], plate, pages[k][1]) not in _cache:
                            _cache[(pages[k][0], plate, pages[k][1])] = parsed
                            ok += 1
                _day["pages"] += ok  # only calls that answered count against the day
                return []  # all or nothing; the pages that did answer stay cached for the next run
            finally:
                ex.shutdown(wait=False, cancel_futures=True)
            _day["pages"] += ok
        results = [_cache.get((sha, plate, i)) for sha, i, _d in pages]
        return _lines(jev, case, results, docs, complete=complete, now=now, t0=t0, cid=cid)
    finally:
        for _, d in docs:
            try:
                d.close()
            except Exception:  # noqa: BLE001
                pass


def _present(results: list[dict | None], doc: str) -> bool:
    for r in results:
        if r and CANON.get(r["label"]) == doc and r["conf"] >= PRESENT and (doc not in OUR_SIDE or r["ours"] >= OURS_MIN):
            return True
    return False


def _lines(jev, case, results, docs, *, complete, now, t0, cid) -> list[str]:
    data = case.get("case_data") if isinstance(case.get("case_data"), dict) else {}
    data = {**data, **{k: (data.get(k) if isinstance(data.get(k), dict) else {}) for k in ("police", "at_fault", "client_vehicle")},
            "missing": data.get("missing") if isinstance(data.get("missing"), list) else []}
    out: list[str] = []
    # RC card check FIRST: it is one call, and the I-SEARCH plate step below may use up the time budget (review round 3)
    rc_out: list[str] = []
    best = None
    for idx, r in enumerate(results):
        if r and r["label"] == "vehicle_ownership_certificate" and r["conf"] >= SURE and r["ours"] >= SURE and (best is None or r["conf"] > results[best]["conf"]):
            best = idx
    if best is not None:
        try:
            rc_out = _rc_lines(jev, data, docs, best, now, t0, cid)
        except Exception:  # noqa: BLE001  (the missing-document lines below still run)
            rc_out = []
    # rule A: a needed document with no page, and the reader did not already say it is missing. Skipped when any page could not be read (no proof of absence).
    if complete and all(results):
        listed = {reader_missing(str(m)) for m in (data.get("missing") or [])}
        for doc in NEEDED:
            if doc in listed or _present(results, doc):
                continue
            if doc == "our_policy" and not data.get("client_policy"):
                continue  # the reader found no client insurance: that is not a blocker, nothing to compare
            if doc == "police_report" and not (data.get("police") or {}).get("client_report_no"):
                continue
            if doc in ("keputusan", "isearch") and not (data.get("at_fault") or {}).get("plate") and not (data.get("police") or {}).get("report_no"):
                continue
            if doc == "isearch" and _day.get("af_on", True):
                try:
                    if _at_fault_schedule(jev, data, results, docs, now, t0, cid):
                        continue  # a page shows the at-fault plate's insurance; anything else (no, could not ask) keeps the old warning
                except Exception:  # noqa: BLE001
                    pass
            out.append(f"Jev check: no {DOC_WORDS[doc]} page found in the files")
    out.extend(rc_out)
    seen, lines = set(), []
    for ln in out:
        if ln not in seen:
            seen.add(ln)
            lines.append(ln[:300])
    return lines[:MAX_LINES]  # missing documents first, then RC model, cc, date (the order they were added)


MAX_AF_PAGES = 6  # at most this many candidate pages get the at-fault plate question
AF_YES = PRESENT  # live (15 cases): yes pages 0.91-0.97 (DCD4004 once 0.91), no pages 0.01-0.07; 0.9 would sit on the yes edge
NOT_INSURANCE = {"vehicle_ownership_certificate", "police_report", "police_investigation_result", "police_sketch", "road_tax"}  # a road tax disc names the insurer too
AF_ORDER = {"isearch_report": 0, "insurance_schedule_or_cover_note": 1}  # likeliest first; every other label after


def norm_plate(v) -> str:
    return re.sub(r"[^A-Z0-9]", "", str(v or "").upper())


def _at_fault_schedule(jev, data, results, docs, now, t0, cid) -> bool:
    """Playbook 01: JPJ SEARCH = 对方保单 = the at-fault party's insurance/I-SEARCH page. The page is not always a clean ISM printout: the
    at-fault vehicle's own insurance schedule (DCD4004), a rotated mySIKAP page (QAT110) or a phone screenshot (VBD9393) also do the job,
    and Jev types those with low confidence. "Not ours" alone is too weak (our own continuation page scores low, a misfiled schedule names
    another plate), so each candidate page (not ours, not an RC or police page) is asked one question: does it show the at-fault plate's insurance?
    True = yes on a page. False = anything else: no candidate, no at-fault plate, the plate differs from
    the police's blamed plate, every asked page said no, or a question could not be asked; False keeps the old warning (warn-only: a false
    warning only makes a person look, a false "present" would hide a missing page)."""
    blamed = norm_plate((data.get("police") or {}).get("blamed_plate"))
    plate = norm_plate((data.get("at_fault") or {}).get("plate")) or blamed  # same fallback as create_spec.py and the case page
    if plate and blamed and blamed != plate:
        jev.log("isearch_check", case_id=cid, ok=False, error_class="skip_plate_mismatch", model=PAGE_MODEL)
        return False  # the reader's at-fault plate is not the plate the police blamed: a person must look, so the warning stays
    cands = [g for g, r in enumerate(results) if r and r["label"] not in NOT_INSURANCE and r["ours"] < OURS_MIN]
    cands.sort(key=lambda g: (AF_ORDER.get(results[g]["label"], 2), results[g]["ours"], -results[g]["conf"]))  # the least "ours" first
    if not plate or not cands:
        return False
    q = {"af": {"type": "noul", "instructions": (
        "Does `page` show an insurance policy or cover note for the vehicle `at_fault_plate`, with a policy or cover note number or an insurance period? "
        "An insurer's name alone is not enough. "
        "It may be an insurer's schedule, a vehicle look-up printout or a screenshot, and it may be rotated. "
        "Answer no if the page names a different vehicle. Ignore spaces and letter case in plate numbers.")}}
    for g in cands[:MAX_AF_PAGES]:
        sha, i = _locate(docs, g)
        key = (sha, "af:" + plate, i)  # same shape as the page-sort key: the page number INSIDE that PDF, so a re-run with other files still matches
        if key not in _cache:
            skip = ("skip_budget" if now() - t0 > BUDGET_S - 5 else "skip_daily_cap" if _day["pages"] + 1 > _day["cap"] else None)  # the RC check already ran (and counted) before this step
            img = None if skip else _page_jpg(docs, g, DPI)  # not RC_DPI: a full scanned page at 150 dpi was refused (HTTP 400, QAT110)
            if img is None:
                jev.log("isearch_check", case_id=cid, ok=False, error_class=skip or "skip_render", model=PAGE_MODEL)
                return False
            ref, assets = _asset(img)
            _day["pages"] += 1  # a sent call counts against the day, answered or not
            try:
                ans = jev.ask({"page": ref, "at_fault_plate": plate}, q, purpose="isearch_check", case_id=cid, assets=assets, model=PAGE_MODEL).get("answers")
            except JevError:
                return False  # Jev.ask already wrote the failed row
            p = _prob((ans if isinstance(ans, dict) else {}).get("af"))
            if p is None:
                jev.log("isearch_check", case_id=cid, ok=False, error_class="bad_answer", model=PAGE_MODEL)
                return False
            _cache[key] = {"p": p}
        if _cache[key]["p"] >= AF_YES:
            return True
    return False


def _locate(docs, global_index: int) -> tuple[str, int]:
    """(pdf sha, page number inside that pdf) for a page's position across all the case's files."""
    n = global_index
    for sha, d in docs:
        if n < len(d):
            return sha, n
        n -= len(d)
    return "", -1


def _rc_lines(jev, data, docs, best, now, t0, cid) -> list[str]:
    state, qs = rc_questions(data)
    if not qs or now() - t0 > BUDGET_S - 5:
        return []
    rc = _rc_page(docs, best)
    if rc is None:
        return []
    ref, assets = _asset(rc)
    state["page"] = ref
    try:
        ans = jev.ask(state, qs, purpose="rc_check", case_id=cid, assets=assets, model=PAGE_MODEL).get("answers")
    except JevError:
        return []
    ans = ans if isinstance(ans, dict) else {}
    _day["pages"] += 1
    cv = data.get("client_vehicle") or {}
    shown = {"model": ("model", norm_model(cv.get("model"))), "cc": ("cc", norm_cc(cv.get("cc"))), "date": ("registration date", norm_date(cv.get("registration_date")))}
    out = []
    for k in ("model", "cc", "date"):
        p = _prob(ans.get(k))
        if k in qs and p is not None and p <= 1 - SURE + 1e-9:
            name, val = shown[k]
            out.append(f'Jev check: RC {name} "{val[:80]}" not seen on the RC card by Jev')
    return out


def _rc_page(docs, global_index: int) -> bytes | None:
    return _page_jpg(docs, global_index, RC_DPI)


def _page_jpg(docs, global_index: int, dpi: int) -> bytes | None:
    n = global_index
    for _, d in docs:
        if n < len(d):
            try:
                return _jpg(d, n, dpi)
            except Exception:  # noqa: BLE001
                return None
        n -= len(d)
    return None
