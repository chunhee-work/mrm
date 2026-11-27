import pytest

from autopilot_worker import merimen_docs as md
from autopilot_worker import merimen_photos as mp


def test_doc_labels():
    assert md.doc_label("WXY1234 GERAN.pdf") == "RC"
    assert md.doc_label("WXY1234 POLICY.pdf") == "INS"
    assert md.doc_label("police report.pdf") == "P.REPORT"
    assert md.doc_label("JPJ SEARCH ABC1.pdf") == "JPJ SEARCH"
    assert md.doc_label("bundle.pdf") == "DOC"


def test_doc_plan_only_pdfs():
    files = [{"id": 1, "kind": "pdf", "name": "a GERAN.pdf"}, {"id": 2, "kind": "photo", "name": "p.jpg"}, {"id": 3, "kind": "bundle_zip", "name": "x.zip"}]
    assert [d["label"] for d in md.doc_plan(files)] == ["RC"]


def test_pdf_rows_ignore_photos():
    rows = ["1 12/11/26 10:00 RC", "2 12/11/26 10:00 Front View Load JPG"]
    assert md.pdf_rows(rows) == ["1 12/11/26 10:00 RC"]


def test_small_pdf_is_not_touched(tmp_path):
    p = tmp_path / "a.pdf"
    p.write_bytes(b"%PDF-1.4 small")
    assert md.shrink(str(p)) == str(p)


def test_big_pdf_without_pymupdf_stops(tmp_path, monkeypatch):
    p = tmp_path / "a.pdf"
    p.write_bytes(b"0" * (md.MAX_BYTES + 1))
    monkeypatch.setitem(__import__("sys").modules, "fitz", None)
    with pytest.raises(md.DocError) as e:
        md.shrink(str(p))
    assert e.value.code == "too_big"


class FakeMP(md.MerimenPage):
    def __init__(self, rows):
        self.rows_ = rows
        self.tabs = []

    def rows(self, cid, ext):
        return self.rows_

    def close(self):
        pass


def test_dry_run_reads_only_and_counts():
    case = {"files": [{"id": 1, "kind": "pdf", "name": "a GERAN.pdf"}, {"id": 2, "kind": "pdf", "name": "b.pdf"}]}
    rep = md.run_docs(FakeMP(["1 d RC Doc"]), case, "123", "456", writes=False)
    assert not rep.ok and rep.code == "docs_partial"  # 1 of 2 there: a person looks
    rep = md.run_docs(FakeMP(["1 d RC", "2 d DOC"]), case, "123", "456", writes=False)
    assert rep.ok and rep.skipped == 2 and rep.uploaded == 0
    rep = md.run_docs(FakeMP([]), case, "123", "456", writes=False)
    assert rep.ok and rep.skipped == 0 and "would upload 2" in rep.line()


def test_no_case_yet_is_plan_only():
    rep = md.run_docs(None, {"files": [{"id": 1, "kind": "pdf", "name": "a.pdf"}]}, "", "", writes=True)
    assert rep.ok and rep.uploaded == 0 and rep.planned == 1


def test_live_without_local_file_stops():
    case = {"files": [{"id": 1, "kind": "pdf", "name": "a.pdf"}]}
    rep = md.run_docs(FakeMP([]), case, "1", "2", writes=True)
    assert not rep.ok and rep.code == "file_missing"


def test_no_documents_is_a_stop():
    rep = md.run_docs(FakeMP([]), {"files": []}, "1", "2", writes=False)
    assert not rep.ok and rep.code == "no_documents"


def test_photo_labels_and_compare():
    rows = ["1 12/11/26 10:00 Front View Load JPG", "2 12/11/26 10:01 Rear View Load JPG", "3 x RC Doc"]
    labels = mp.photo_labels(rows)
    assert labels == ["Front View", "Rear View"]
    assert mp.compare(["Front View", "Rear View"], labels) == {"count": 2, "mismatch": 0, "missing": []}
    r = mp.compare(["Front View", "Side View", "Rear View"], labels)
    assert r["missing"] == [1] and r["count"] == 2
    assert mp.compare(["Rear View", "Front View"], labels)["mismatch"] == 2


def test_real_photos_without_case_number_reads_none():
    class P:
        url = "https://www.merimen.com.my/claims/index.cfm?CFID=1&CFTOKEN=2&USID=3&RID=4"

    assert mp.RealPhotos(P(), lambda _i: None).labels({"merimen_caseid": None}) is None
