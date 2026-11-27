import io
from datetime import datetime, timezone

import pytest
from PIL import Image

from autopilot_worker.blobstore import delete_request, put_request
from autopilot_worker.config import Config
from autopilot_worker.loop import LeaseKeeper, maybe_cleanup, tick
from autopilot_worker.pipeline import Driver, Outcome
from autopilot_worker.screens import Screenshotter, cleanup, milestones_after, page_block, pathname, to_jpeg

OK_URL = "https://www.merimen.com.my/claims/index.cfm?fuseaction=home&CFID=1&RID=2"
LOGIN_URL = "https://www.merimen.com.my/claims/index.cfm"
TOKEN = "vercel_blob_rw_storeabc_secretxyz"
WHEN = datetime(2026, 11, 21, 8, 30, 0, tzinfo=timezone.utc)


def png(w=2000, h=1000):
    b = io.BytesIO()
    Image.new("RGB", (w, h), (200, 30, 30)).save(b, "PNG")
    return b.getvalue()


class Page:
    def __init__(self, url=OK_URL, password=0, raw=None):
        self.url, self._pw, self.raw, self.shots = url, password, raw or png(), 0

    def locator(self, sel):
        assert "password" in sel
        return type("L", (), {"count": lambda _s, pw=self._pw: pw})()

    def screenshot(self, **kw):
        self.shots += 1
        assert kw["type"] == "jpeg" and kw["quality"] == 70
        return self.raw


class Repo:
    def __init__(self):
        self.rows, self.expired, self.deleted = [], [], []

    def add_screenshot(self, **kw):
        self.rows.append(kw)

    def expired_screenshots(self, days, limit=50):
        return self.expired

    def mark_screenshot_deleted(self, row_id):
        self.deleted.append(row_id)


JOB = {"id": 7, "org_id": "o1"}
CASE = {"id": "case1", "created_by": "userA"}


def shooter(page, repo=None, puts=None, enabled=True):
    puts = puts if puts is not None else []
    return Screenshotter(repo or Repo(), enabled=enabled, page_for=lambda org: page, put=lambda p, d: puts.append((p, d)), now=lambda: WHEN), puts


def test_pathname_is_private_layout_and_rejects_bad_ids():
    assert pathname("userA", "case1", "case_opened", WHEN) == "screenshots/userA/case1/case_opened-20261121T083000000000Z.jpg"
    for bad in (("../x", "case1", "case_opened"), ("userA", "a/b", "case_opened"), ("userA", "case1", "nope")):
        with pytest.raises(ValueError):
            pathname(*bad, WHEN)


def test_jpeg_is_at_most_1280_wide():
    out = Image.open(io.BytesIO(to_jpeg(png(2000, 1000))))
    assert out.format == "JPEG" and out.width == 1280 and out.height == 640
    assert Image.open(io.BytesIO(to_jpeg(png(800, 600)))).width == 800


def test_capture_hook_stores_blob_then_row():
    s, puts = shooter(Page())
    repo = s.repo
    assert s.shoot(JOB, CASE, "case_opened") is True
    assert len(puts) == 1 and puts[0][0].startswith("screenshots/userA/case1/case_opened-") and puts[0][1][:2] == b"\xff\xd8"
    r = repo.rows[0]
    assert (r["user_id"], r["case_id"], r["job_id"], r["step"], r["caption_en"], r["caption_zh"]) == ("userA", "case1", 7, "case_opened", "Case opened", "案件已打开")
    assert r["blob_pathname"] == puts[0][0]


@pytest.mark.parametrize("page", [Page(url=LOGIN_URL), Page(password=1), Page(url="https://example.com/claims/?CFID=1&RID=2")])
def test_no_screenshot_on_the_login_page_or_any_password_box(page):
    s, puts = shooter(page)
    for step in ("login_verified", "failed"):
        assert s.shoot(JOB, CASE, step) is False
    assert page.shots == 0 and puts == [] and s.repo.rows == []
    assert page_block(page) in ("password_box", "not_logged_in")


def test_no_shot_without_submitter_flag_or_tab_and_never_raises():
    s, puts = shooter(Page())
    assert s.shoot(JOB, {"id": "case1", "created_by": None}, "case_opened") is False
    assert shooter(Page(), enabled=False)[0].shoot(JOB, CASE, "case_opened") is False
    assert Screenshotter(Repo(), enabled=True, page_for=lambda o: None, put=lambda *a: None).shoot(JOB, CASE, "case_opened") is False

    def boom(p, d):
        raise RuntimeError("blob down")

    assert Screenshotter(Repo(), enabled=True, page_for=lambda o: Page(), put=boom).shoot(JOB, CASE, "case_opened") is False


def test_milestones_claim_nothing_for_dry_runs():
    done = Outcome("done", event="dry")
    assert milestones_after("phase_a", done, saved=False) == []
    assert milestones_after("phase_a", Outcome("done", merimen_caseid="M1"), saved=True) == ["case_opened", "documents_uploaded"]
    assert milestones_after("phase_b", Outcome("done", case_status="checking"), saved=True) == ["photos_named"]
    assert milestones_after("checks", Outcome("done", done=True), saved=True) == ["case_complete"]
    assert milestones_after("phase_a", Outcome("failed", error="x"), saved=True) == ["failed"]
    assert milestones_after("intake", Outcome("failed", error="x"), saved=True) == []


def test_cleanup_deletes_blob_then_marks_and_keeps_rows_whose_blob_will_not_delete():
    repo, gone = Repo(), []
    repo.expired = [("a", "screenshots/u/c/a.jpg"), ("b", "screenshots/u/c/b.jpg")]

    def delete(path):
        if path.endswith("b.jpg"):
            raise OSError("down")
        gone.append(path)

    assert cleanup(repo, delete, 90) == 1
    assert gone == ["screenshots/u/c/a.jpg"] and repo.deleted == ["a"]


def test_cleanup_runs_only_with_worker_ui_and_at_most_hourly():
    repo = Repo()
    repo.expired = [("a", "screenshots/u/c/a.jpg")]
    off = Config.from_env({})
    on = Config.from_env({"WORKER_UI": "on"})
    from autopilot_worker import loop

    loop._last_cleanup[0] = -10_000.0
    assert maybe_cleanup(off, repo, lambda p: None, now=lambda: 5000.0) == 0
    assert maybe_cleanup(on, repo, lambda p: None, now=lambda: 5000.0) == 1
    assert maybe_cleanup(on, repo, lambda p: None, now=lambda: 5100.0) == 0


def test_blob_requests_are_private_and_keep_the_token_in_the_header():
    url, h = put_request("screenshots/u/c/x.jpg", TOKEN)
    assert url == "https://vercel.com/api/blob/?pathname=screenshots/u/c/x.jpg" and TOKEN not in url
    assert h["x-vercel-blob-access"] == "private" and h["x-vercel-blob-store-id"] == "storeabc" and h["authorization"] == f"Bearer {TOKEN}"
    u2, h2, body = delete_request("screenshots/u/c/x.jpg", TOKEN)
    assert u2.endswith("/delete") and b"screenshots/u/c/x.jpg" in body and TOKEN not in u2
    with pytest.raises(ValueError):
        put_request("../x", TOKEN)


def test_lease_keeper_renews_while_running():
    import threading

    hit = threading.Event()

    class R:
        def touch_job(self, job_id, worker):
            assert (job_id, worker) == (3, "w1")
            hit.set()

    k = LeaseKeeper(R(), 3, "w1", 60)
    k.every = 0.01
    with k:
        assert hit.wait(2)


class FakeRepo(Repo):
    def __init__(self, step, created_by="userA"):
        super().__init__()
        self.step, self.created_by, self.applied = step, created_by, []

    def heartbeat(self, *a, **k): pass
    def claim_verify(self): return None
    def reclaim_stale(self, *a): return 0
    def ensure_sessions(self): return []
    def wanted(self): return []
    def followup_cases(self): return []
    def claim(self, **k): return {"id": 7, "case_id": "case1", "step": self.step, "attempts": 1, "org_id": "o1"}
    def gate(self, org, env_on): return "ready"
    def session_status(self, org): return "connected"
    def apply(self, job, outcome): self.applied.append(outcome)

    def load(self, case_id):
        return {"id": "case1", "org_id": "o1", "status": "phase_a", "plate": "A1", "case_data": {}, "photos_done_at": None, "merimen_caseid": None,
                "car_model": None, "file_count": 0, "photo_count": 0, "created_by": self.created_by, "photos": [], "files": []}


class SavingDriver(Driver):
    def dry_run(self, phase, steps):
        from autopilot_worker.pipeline import DriveResult
        return DriveResult(ok=True)

    def save(self, phase, steps):
        from autopilot_worker.pipeline import DriveResult
        self.progress("create_case")
        return DriveResult(ok=True, case_id="M1")


def run_tick(page, *, step="phase_a", flag="on", writes=True):
    from autopilot_worker import loop
    loop._last_cleanup[0] = 1e12
    cfg = Config.from_env({"WORKER_UI": flag, "EXT_CONNECT": "on", "MERIMEN_WRITES": "on" if writes else "", "WORKER_SUBMIT": "on" if writes else ""})
    repo, puts = FakeRepo(step), []
    plan_ok = {"plate": "A1", "client_vehicle": {"chassis_no": "c", "model": "m"}, "police": {"report_no": "r", "accident_datetime": "d", "place": "p"}, "at_fault": {"policy": {"policy_no": "p"}}}
    repo.load = (lambda orig: (lambda cid: {**orig(cid), "case_data": plan_ok, "file_count": 1, "photo_count": 1}))(repo.load)
    tick(cfg, repo, launch=lambda a: None, inspect=lambda p: None, namer=None, driver=SavingDriver(), download=lambda *a: None,
         page_for=lambda org: page, put_blob=lambda p, d: puts.append(p), delete_blob=None)
    return repo, puts


def test_tick_takes_login_verified_and_case_opened_from_a_logged_in_page_only():
    repo, puts = run_tick(Page())
    steps = [r["step"] for r in repo.rows]
    assert steps == ["login_verified", "case_opened", "documents_uploaded"] and len(puts) == 3


def test_tick_takes_nothing_on_the_login_page_and_nothing_when_the_flag_is_off():
    repo, puts = run_tick(Page(url=LOGIN_URL))
    assert repo.rows == [] and puts == []
    repo, puts = run_tick(Page(), flag="")
    assert repo.rows == [] and puts == []
