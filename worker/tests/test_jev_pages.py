"""Jev page check (plan #103): sort PDF pages, warn about a missing document, check the RC card. Warn only; every problem = no lines."""
import base64
import urllib.error

import pytest

fitz = pytest.importorskip("fitz")

from autopilot_worker import jev as jev_mod
from autopilot_worker import jev_pages as jp
from autopilot_worker.jev import Jev, JevError
from autopilot_worker.pipeline import Outcome
from autopilot_worker.store import PgRepo
from test_store_sql import Rec

LAB = {"rc": "vehicle_ownership_certificate", "pol": "insurance_schedule_or_cover_note", "isearch": "isearch_report",
       "rep": "police_report", "kep": "police_investigation_result", "other": "__none__"}


def pdf(*texts, password=None):
    d = fitz.open()
    for t in texts:
        d.new_page(width=300, height=400).insert_text((20, 100), t, fontsize=30)
    return d.tobytes(encryption=fitz.PDF_ENCRYPT_AES_256, user_pw=password, owner_pw=password) if password else d.tobytes()


def page_key(raw, i):
    d = fitz.open(stream=raw, filetype="pdf")
    return base64.b64encode(jp._jpg(d, i)).decode()


class Fake:
    """Answers by page image: kinds = {page_key: (label, conf, ours)}; rc = answers for the RC questions."""

    def __init__(self, kinds, rc=None, fail=False):
        self.kinds, self.rc, self.fail, self.sent = kinds, rc or {"model": 0.97, "cc": 0.97, "date": 0.97}, fail, []

    def post(self, body, timeout):
        self.sent.append(body)
        if self.fail:
            raise JevError("HTTP 500")
        a = next(iter(body["assets"].values()))["data_base64"]
        if "model" in body["questions"] or "cc" in body["questions"] or "date" in body["questions"]:
            return {"answers": {k: {"noul": v} for k, v in self.rc.items() if k in body["questions"]}}
        label, conf, ours = self.kinds.get(a, ("__none__", 0.95, 0.1))
        return {"answers": {"doc_type": {"choice": LAB.get(label, label), "confidence": conf}, "belongs": {"noul": ours}, "blamed": {"noul": 0.1},
                            "by_our_driver": {"noul": ours}}}


DATA = {"missing": [], "client_vehicle": {"model": "TOYOTA / WISH", "cc": "1,798", "registration_date": "2012-03-04"},
        "client_policy": {"insurer": "Allianz"}, "police": {"report_no": "R1", "client_report_no": "R2"}, "at_fault": {"plate": "ABC1"}}


def setup(pages, data=None, **kw):
    """pages = [(text, label, conf, ours)] in ONE pdf."""
    raw = pdf(*[p[0] for p in pages])
    kinds = {page_key(raw, i): (p[1], p[2], p[3]) for i, p in enumerate(pages)}
    fake = Fake(kinds, **kw)
    rows = []
    jev = Jev(fake.post, record=rows.append)
    case = {"id": "c1", "plate": "WXY1234", "case_data": data if data is not None else DATA, "files": [{"id": 1, "kind": "pdf", "url": "u1", "name": "a.pdf"}]}
    return jev, case, fake, rows, (lambda url: raw)


FULL = [("rc page", "rc", 0.97, 0.97), ("policy", "pol", 0.96, 0.9), ("isearch", "isearch", 0.95, 0.1), ("report", "rep", 0.95, 0.9), ("keputusan", "kep", 0.95, 0.8)]


@pytest.fixture(autouse=True)
def fresh():
    jp._cache.clear()
    jp._day.update(d="", pages=0)


def test_everything_agrees_is_quiet_and_one_row_per_call():
    jev, case, fake, rows, fetch = setup(FULL)
    assert jp.run(jev, case, fetch) == []
    assert len(fake.sent) == 6  # 5 pages + one RC check
    assert {r["purpose"] for r in rows} == {"jev_page_sort", "jev_rc_check"} and all(r["model"] == "jev-preview" for r in rows)


def test_a_missing_document_is_warned_once():
    jev, case, fake, rows, fetch = setup([p for p in FULL if p[1] != "kep"])
    assert jp.run(jev, case, fetch) == ["Jev check: no Keputusan page found in the files"]


def test_the_reader_already_listed_it_missing_adds_nothing():
    d = dict(DATA, missing=["police investigation result (Keputusan) page"])
    jev, case, fake, rows, fetch = setup([p for p in FULL if p[1] != "kep"], d)
    assert jp.run(jev, case, fetch) == []


def test_other_party_pages_need_no_our_side_score_but_our_pages_do():
    jev, case, fake, rows, fetch = setup([("rc page", "rc", 0.97, 0.1)] + FULL[1:])  # the RC page is the OTHER side
    assert jp.run(jev, case, fetch) == ["Jev check: no RC page found in the files"]


def test_the_at_fault_insurance_schedule_counts_as_the_isearch_page():
    # DCD4004 (2026-11-28): no I-SEARCH printout, the at-fault party's own Allianz schedule is in its place (playbook 01: JPJ SEARCH = 对方保单)
    other_ins = [p for p in FULL if p[1] != "isearch"] + [("their policy", "pol", 1.0, 0.18)]
    jev, case, fake, rows, fetch = setup(other_ins)
    assert jp.run(jev, case, fetch) == []


def test_our_own_insurance_schedule_is_not_an_isearch_page():
    jev, case, fake, rows, fetch = setup([p for p in FULL if p[1] != "isearch"])  # only OUR policy (ours 0.9)
    assert jp.run(jev, case, fetch) == ["Jev check: no I-SEARCH page found in the files"]


def test_the_other_party_schedule_does_not_stand_in_for_our_policy():
    jev, case, fake, rows, fetch = setup([p for p in FULL if p[1] != "pol"] + [("their policy", "pol", 1.0, 0.18)])
    assert jp.run(jev, case, fetch) == ["Jev check: no our insurance page found in the files"]


def test_no_client_insurance_found_by_the_reader_is_not_a_warning():
    d = dict(DATA, client_policy=None)
    jev, case, fake, rows, fetch = setup([p for p in FULL if p[1] != "pol"], d)
    assert jp.run(jev, case, fetch) == []


def test_rc_mismatch_gives_one_line_per_field_and_formatting_never_counts():
    jev, case, fake, rows, fetch = setup(FULL, rc={"model": 0.04, "cc": 0.03, "date": 0.5})
    out = jp.run(jev, case, fetch)
    assert out == ['Jev check: RC model "TOYOTA / WISH" not seen on the RC card by Jev', 'Jev check: RC cc "1798" not seen on the RC card by Jev']
    q = [b for b in fake.sent if "cc" in b["questions"]][0]
    assert q["state"]["cc"] == "1798" and q["state"]["model"] == "TOYOTA / WISH"


def test_rc_check_needs_type_and_side_both_sure_and_skips_empty_fields():
    low = [("rc page", "rc", 0.8, 0.97)] + FULL[1:]
    jev, case, fake, rows, fetch = setup(low)
    assert jp.run(jev, case, fetch) == [] and len(fake.sent) == 5  # RC page found, but no RC question asked
    d = dict(DATA, client_vehicle={"model": "", "cc": "1798", "registration_date": "not a date"})
    jev, case, fake, rows, fetch = setup(FULL, d)
    jp.run(jev, case, fetch)
    q = [b for b in fake.sent if "questions" in b and "cc" in b["questions"]][0]
    assert set(q["questions"]) == {"cc"}


def test_a_malformed_answer_means_no_absence_warning():
    jev, case, fake, rows, fetch = setup([p for p in FULL if p[1] != "kep"] + [("odd", "rc", 9.0, 0.5)])
    assert jp.run(jev, case, fetch) == []  # one page unreadable: no proof that Keputusan is missing


def test_parse_page_rejects_bad_shapes():
    ok = {"answers": {"doc_type": {"choice": "road_tax", "confidence": 0.9}, "belongs": {"noul": 0.5}, "by_our_driver": {"noul": 0.5}}}
    assert jp.parse_page(ok)["label"] == "road_tax"
    for bad in ({}, {"answers": []}, {"answers": {"doc_type": {"choice": "nope", "confidence": 0.9}}},
                {"answers": {**ok["answers"], "belongs": {"noul": 1.4}}}, {"answers": {**ok["answers"], "doc_type": {"choice": "road_tax", "confidence": True}}}):
        assert jp.parse_page(bad) is None


def test_over_the_page_cap_nothing_is_sent():
    jev, case, fake, rows, fetch = setup([(f"p{i}", "other", 0.9, 0.1) for i in range(jp.MAX_PAGES + 1)])
    assert jp.run(jev, case, fetch) == [] and fake.sent == []
    assert rows[0]["ok"] is False and rows[0]["error_class"] == "skip_pages"


def test_a_failed_page_call_gives_nothing_and_is_logged():
    jev, case, fake, rows, fetch = setup(FULL)
    fake.fail = True
    assert jp.run(jev, case, fetch) == []
    assert rows and all(r["ok"] is False for r in rows)


def test_budget_used_up_gives_nothing():
    jev, case, fake, rows, fetch = setup(FULL)
    t = iter(range(0, 10_000, 100))
    assert jp.run(jev, case, fetch, now=lambda: next(t)) == []


def test_only_case_files_of_kind_pdf_are_opened():
    jev, case, fake, rows, fetch = setup(FULL)
    case["files"] = [{"kind": "photo", "url": "p.jpg"}, {"kind": "bundle_zip", "url": "z"}]
    asked = []
    assert jp.run(jev, case, lambda u: asked.append(u)) == [] and asked == [] and fake.sent == []


def test_encrypted_and_corrupt_pdfs_are_skipped():
    jev, case, fake, rows, _ = setup(FULL)
    assert jp.run(jev, case, lambda u: pdf("x", password="pw")) == [] and rows[-1]["error_class"] == "skip_encrypted"
    assert jp.run(jev, case, lambda u: b"%PDF-garbage") == [] and fake.sent == []
    assert jp.run(jev, case, lambda u: None) == []


def test_the_same_pdf_is_not_asked_twice():
    jev, case, fake, rows, fetch = setup(FULL)
    jp.run(jev, case, fetch)
    n = len(fake.sent)
    jp.run(jev, case, fetch)
    assert len(fake.sent) == n + 1  # only the RC check again; the five pages come from the cache


def test_daily_cap():
    jev, case, fake, rows, fetch = setup(FULL)
    assert jp.run(jev, case, fetch, env={"JEV_PAGES_DAILY": "3"}) == [] and fake.sent == [] and rows[0]["error_class"] == "skip_daily_cap"


def test_switches():
    on = {"JEV_PAGES": "1", "TYPESAFE_API_KEY": "k"}
    assert jp.enabled(on)
    assert not jp.enabled({"TYPESAFE_API_KEY": "k"}) and not jp.enabled({**on, "JEV": "0"}) and not jp.enabled({"JEV_PAGES": "1"}) and not jp.enabled({**on, "JEV_PAGES": "0"})


def test_reader_missing_mapping():
    assert jp.reader_missing("at-fault I-SEARCH page") == "isearch"
    assert jp.reader_missing("police investigation result (Keputusan)") == "keputusan"
    assert jp.reader_missing("JPJ RC") == "rc" and jp.reader_missing("claimant insurance schedule") == "our_policy"
    assert jp.reader_missing("our police report") == "police_report" and jp.reader_missing("at-fault police report") is None


class Resp:
    def __init__(self, body=b'{"answers": {}}'):
        self.body = body

    def read(self):
        return self.body

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


def test_the_image_header_is_sent_only_with_assets_and_a_page_call_is_not_retried(monkeypatch):
    seen = []

    def urlopen(req, timeout=0):
        seen.append(dict(req.header_items()))
        return Resp()

    monkeypatch.setattr(jev_mod.urllib.request, "urlopen", urlopen)
    post = jev_mod._post_json("k")
    post({"state": {}, "model": "m", "questions": {}}, 5)
    post({"state": {}, "model": "m", "questions": {}, "assets": {"a": {}}}, 5)
    assert "Typesafe-danger-zone-images" not in seen[0] and seen[1].get("Typesafe-danger-zone-images") == "true"
    calls = []

    def boom(req, timeout=0):
        calls.append(1)
        raise urllib.error.HTTPError("u", 503, "x", {}, None)

    monkeypatch.setattr(jev_mod.urllib.request, "urlopen", boom)
    monkeypatch.setattr(jev_mod.time, "sleep", lambda s: None)
    with pytest.raises(JevError):
        post({"state": {}, "model": "m", "questions": {}, "assets": {"a": {}}}, 5)
    assert calls == [1]
    calls.clear()
    with pytest.raises(JevError):
        post({"state": {}, "model": "m", "questions": {}}, 5)
    assert calls == [1, 1]  # text calls keep their single retry


def test_extra_events_are_written_once_as_jev_check():
    rec = Rec()
    PgRepo("", db=rec).apply({"id": 1, "case_id": "c1", "step": "phase_a", "org_id": "o1"}, Outcome("done", extra_events=["Jev check: no RC page found in the files"]))
    sql, args = [s for s in rec.batches[0] if "'jev_check'" in s[0]][0]
    assert "NOT EXISTS (SELECT 1 FROM case_events" in sql and args[1] == "Jev check: no RC page found in the files"


def test_a_failed_pass_keeps_the_good_pages_and_a_rerun_asks_only_for_the_rest():
    jev, case, fake, rows, fetch = setup(FULL)
    real = fake.post
    n = {"c": 0}

    def flaky(body, timeout):
        n["c"] += 1
        if n["c"] == 3:
            raise JevError("HTTP 500")
        return real(body, timeout)

    jev.post = flaky
    assert jp.run(jev, case, fetch) == []
    cached = len(jp._cache)
    assert 0 < cached < 5
    jev.post = real
    import time
    time.sleep(0.5)  # let the calls of the first pass that were already in flight finish
    cached = len(jp._cache)
    fake.sent.clear()
    jp.run(jev, case, fetch)
    assert len(fake.sent) == (5 - cached) + 1  # the missing pages and the RC check; none of the cached ones
    assert jp._day["pages"] <= 5 + 1  # a failed call is not counted against the day


def test_an_unreadable_answer_is_never_remembered():
    jev, case, fake, rows, fetch = setup([p for p in FULL if p[1] != "kep"] + [("odd", "rc", 9.0, 0.5)])
    assert jp.run(jev, case, fetch) == []
    assert len(jp._cache) == 4  # the odd page is not cached: the next run asks again


def test_the_same_pdf_twice_in_one_case_is_asked_once():
    jev, case, fake, rows, fetch = setup(FULL)
    case["files"].append({"id": 2, "kind": "pdf", "url": "u2", "name": "b.pdf"})
    assert jp.run(jev, case, fetch) == [] and len(fake.sent) == 6


def test_a_file_we_could_not_open_means_no_absence_warning():
    jev, case, fake, rows, fetch = setup([p for p in FULL if p[1] != "kep"])
    case["files"].append({"id": 3, "kind": "image", "url": "x.png", "name": "x.png"})  # an image that is not a photo: it may hold the Keputusan
    assert jp.run(jev, case, fetch) == []
    case["files"][-1] = {"id": 3, "kind": "pdf", "url": "", "name": "y.pdf"}
    assert jp.run(jev, case, fetch) == []


def test_a_police_report_continuation_page_still_counts_as_ours():
    jev, case, fake, rows, fetch = setup([p if p[1] != "rep" else ("report", "rep", 0.95, 0.3) for p in FULL])
    jp._cache.clear()
    # by_our_driver says 0.3 and belongs is also 0.3 here: genuinely not ours -> warned; with belongs high it is present
    assert jp.run(jev, case, fetch) == ["Jev check: no our police report page found in the files"]
    assert jp.parse_page({"answers": {"doc_type": {"choice": "police_report", "confidence": 0.9}, "belongs": {"noul": 0.9}, "by_our_driver": {"noul": 0.1}}})["ours"] == 0.9


def test_an_odd_rc_answer_keeps_the_missing_document_line():
    jev, case, fake, rows, fetch = setup([p for p in FULL if p[1] != "kep"])
    real = fake.post

    def odd(body, timeout):
        out = real(body, timeout)
        if "cc" in body["questions"]:
            out["answers"] = []
        return out

    jev.post = odd
    assert jp.run(jev, case, fetch) == ["Jev check: no Keputusan page found in the files"]


def test_an_unexpanded_zip_means_no_absence_warning():
    jev, case, fake, rows, fetch = setup([p for p in FULL if p[1] != "kep"])
    case["files"].append({"id": 9, "kind": "bundle_zip", "url": "https://x/z.zip", "name": "z.zip"})
    assert jp.run(jev, case, fetch) == []
    case["files"].append({"id": 10, "kind": "photo", "url": "https://x/unzipped-9/a.jpg", "name": "a.jpg"})  # its contents were stored: the zip is opened
    jp._cache.clear()
    assert jp.run(jev, case, fetch) == ["Jev check: no Keputusan page found in the files"]


def test_cc_only_plain_values_are_asked():
    assert jp.norm_cc("1,798") == "1798" and jp.norm_cc("1798 cc") == "1798" and jp.norm_cc("1798") == "1798"
    assert jp.norm_cc("1.5L") == "" and jp.norm_cc("1498.0") == "" and jp.norm_cc("") == ""


def test_odd_case_data_shapes_do_not_lose_the_lines():
    d = dict(DATA, police="oops", at_fault=["x"], missing="none")
    jev, case, fake, rows, fetch = setup([p for p in FULL if p[1] != "rep"], d)
    assert jp.run(jev, case, fetch) == []  # no client report number known: not warned, and nothing crashed
