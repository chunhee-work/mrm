"""Judgment #4 - triage a case bundle before the case is created.

This one is new: there was no code here before, only reading contact sheets by eye.
It answers the questions that actually went wrong in past batches:
  - which page is our client's own policy vs the at-fault party's I-SEARCH
  - which page names the party the police blamed
  - whether a page was misfiled from a different case (this really happened)

Privacy: unlike the other judgments, this one sends the claimant's name and plate
to the API so misfiled pages can be detected. Enable deliberately.
"""
import os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from judgments import triage_page
from client import TypeSafeError


def page_texts(pdf_path):
    """Text layer per page. Scanned pages come back empty - those still need eyes
    (or OCR); the caller decides. Returns [(page_no, text)]."""
    import fitz
    d = fitz.open(pdf_path)
    return [(i + 1, p.get_text().strip()) for i, p in enumerate(d)]


def _p(row, key):
    v = row[key]["value"]
    return v if isinstance(v, (int, float)) else 0.0


def triage_bundle(pdf_path, our_plate, our_owner_name, max_chars=6000):
    """Per-page report plus the flags that matter."""
    out, scanned = [], []
    for pno, text in page_texts(pdf_path):
        if not text:
            scanned.append(pno)
            continue
        try:
            r = triage_page(text[:max_chars], our_plate, our_owner_name)
        except TypeSafeError as e:
            return {"error": str(e)}
        r["page"] = pno
        out.append(r)

    return {
        "pages": out,
        "scanned_pages_need_eyes": scanned,
        "misfiled": [r["page"] for r in out
                     if _p(r, "belongs_to_our_vehicle") < 0.3
                     and _p(r, "is_at_fault_party_doc") < 0.3],
        "at_fault_docs": [r["page"] for r in out if _p(r, "is_at_fault_party_doc") > 0.6],
        "blame_pages": [r["page"] for r in out if _p(r, "names_the_blamed_party") > 0.6],
        "low_confidence": [r["page"] for r in out if not r["ok"]],
    }
