"""WORKER_SLOTS (plan #150): several cases at once, one tab each; the case uploaded first goes first; one Merimen login per Chrome."""
import pathlib
import threading
import time

import pytest

from autopilot_worker import loop, login_seen, relogin
from autopilot_worker.config import Config
from autopilot_worker.pool import JobPool, slot_driver
from autopilot_worker.pipeline import Driver
from test_claim import claim, needs_pg, run


# ---------- the switch ----------

def test_slots_default_one_and_org_limit_follows(tmp_path):
    base = {"WORKER_STATE": str(tmp_path)}
    c = Config.from_env(base)
    assert c.slots == 1 and c.org_limit == 1
    c = Config.from_env({**base, "WORKER_SLOTS": "3"})
    assert c.slots == 3 and c.org_limit == 3  # one user's cases may fill every slot
    c = Config.from_env({**base, "WORKER_SLOTS": "3", "ORG_CONCURRENCY": "1"})
    assert c.slots == 3 and c.org_limit == 1  # an explicit ORG_CONCURRENCY still wins
    for bad in ("0", "9", "two", "-1"):
        with pytest.raises(ValueError):
            Config.from_env({**base, "WORKER_SLOTS": bad})


# ---------- the pool ----------

def test_pool_runs_at_most_slots_jobs_at_once_and_every_job_once():
    lock = threading.Lock()
    now_running, peak, done, drivers = [0], [0], [], set()

    def run_one(job, driver, extra):
        with lock:
            now_running[0] += 1
            peak[0] = max(peak[0], now_running[0])
        drivers.add(id(driver))
        driver.case = job  # a per-job attribute on the slot's own copy
        time.sleep(0.05)
        assert driver.case is job  # no other slot changed it meanwhile
        with lock:
            now_running[0] -= 1
            done.append((job["id"], extra.get("relogin_ready")))

    pool = JobPool(2, run_one, make_driver=lambda: slot_driver(Driver()))
    submitted = 0
    jobs = [{"id": i, "step": "phase_a", "org_id": "o1"} for i in range(5)]
    while submitted < len(jobs):
        while pool.free() > 0 and submitted < len(jobs):
            pool.submit(jobs[submitted], relogin_ready=True)
            submitted += 1
        time.sleep(0.005)
    assert pool.wait_idle(5)
    assert peak[0] == 2
    assert sorted(d[0] for d in done) == [0, 1, 2, 3, 4] and all(d[1] for d in done)
    assert len(drivers) == 2  # one driver copy per slot thread


def test_pool_refuses_a_job_without_a_free_slot_and_a_crash_frees_the_slot():
    gate = threading.Event()

    def run_one(job, driver, extra):
        if job["id"] == 1:
            raise RuntimeError("boom")
        gate.wait(2)

    pool = JobPool(1, run_one, make_driver=lambda: object())
    pool.submit({"id": 1, "step": "intake"})
    assert pool.wait_idle(2)  # the crash did not keep the slot
    pool.submit({"id": 2, "step": "intake"})
    with pytest.raises(RuntimeError):
        pool.submit({"id": 3, "step": "intake"})
    gate.set()
    assert pool.wait_idle(2)


def test_busy_orgs_counts_only_merimen_steps():
    gate = threading.Event()
    pool = JobPool(3, lambda job, d, e: gate.wait(2), make_driver=lambda: object())
    pool.submit({"id": 1, "step": "photo_model", "org_id": "o1"})
    pool.submit({"id": 2, "step": "phase_b", "org_id": "o2"})
    pool.submit({"id": 3, "step": "intake", "org_id": "o3"})
    assert pool.busy_orgs() == {"o2"}
    gate.set()
    assert pool.wait_idle(2)
    assert pool.busy_orgs() == set()


def test_slot_driver_is_a_copy_without_the_last_jobs_state():
    base = Driver()
    base.case = {"id": "x"}
    base.progress = lambda c: None
    base.jev = "shared-jev"
    d = slot_driver(base)
    assert d is not base and d.case is None and d.progress is None
    assert d.jev == "shared-jev"  # the shared, thread-safe parts are kept
    d.case = {"id": "y"}
    assert base.case == {"id": "x"}


def test_login_seen_is_per_thread():
    login_seen.reset()
    login_seen.mark()
    other = []
    t = threading.Thread(target=lambda: other.append(login_seen.seen()))
    t.start()
    t.join()
    assert login_seen.seen() is True and other == [False]
    login_seen.reset()


# ---------- tabs ----------

class FakePage:
    def __init__(self, tid, opener=None, url="https://www.merimen.com.my/claims/index.cfm?CFID=1&RID=2"):
        self.tid, self.opener, self.url = tid, opener, url
        self.context = FakeCtx(self)


class FakeCtx:
    def __init__(self, page):
        self.page = page
        self.opened = []

    def new_page(self):
        pg = FakePage(f"step-{len(self.opened)}-{self.page.tid}")
        self.opened.append(pg)
        return pg


def info(pg):
    return {"targetId": pg.tid, **({"openerId": pg.opener} if pg.opener else {})}


def test_the_home_tab_records_the_tabs_its_steps_open(monkeypatch):
    from autopilot_worker import __main__ as m

    monkeypatch.setattr(m, "_target_info", info)
    m.STEP_TABS.clear()
    home = FakePage("home")
    wrapped = m.HomeTab(home)
    assert wrapped.url == home.url  # reads go to the real page
    step = wrapped.context.new_page()
    assert step.tid in m.STEP_TABS
    popup = FakePage("pop", opener=step.tid)
    hand = FakePage("hand")
    # another job's step tab and a popup are not the home tab; a second tab opened by hand still is one more (several_tabs, as before)
    assert m.not_step_tabs([home, step, popup], info=info) == [home]
    assert m.not_step_tabs([home, step, hand], info=info) == [home, hand]
    # only a step tab left (the home tab was closed): it is never taken as the home tab
    assert m.not_step_tabs([step], info=info) == []
    m.STEP_TABS.clear()


# ---------- re-login waits for the org's running Merimen jobs ----------

class SessRepo:
    def __init__(self):
        self.sessions = []

    def ensure_sessions(self):
        pass

    def wanted(self):
        return [{"org_id": "o1", "account_key": "default", "status": "waiting_login", "wanted": "start", "port": 9222}]

    def gate(self, org, env_on):
        return "ready"

    def set_session(self, org, **k):
        self.sessions.append((org, k))

    def seen_connected(self, org):
        pass

    def relogin_order(self, orgs):
        return orgs


LOGIN_PAGE = {"urls": ["https://www.merimen.com.my/claims/index.cfm"], "has_password": False}


@pytest.fixture
def fresh():
    relogin.reset()
    loop._launched.clear()
    loop._busy_since.clear()
    yield
    relogin.reset()
    loop._launched.clear()
    loop._busy_since.clear()


def test_relogin_waits_while_a_merimen_job_of_the_org_runs_then_goes_ahead(tmp_path, fresh):
    cfg = Config.from_env({"EXT_CONNECT": "on", "WORKER_STATE": str(tmp_path), "CHROME_BIN": "/usr/bin/true", "MERIMEN_LOGIN": "on", "MERIMEN_RELOGIN": "on"})
    t = [1000.0]
    asked = []

    def sync(busy):
        loop.sync_sessions(cfg, SessRepo(), launch=lambda a: None, inspect=lambda p: LOGIN_PAGE, now=lambda: t[0],
                           relogin=lambda org, port: asked.append(org), busy_orgs=lambda: busy)

    sync({"o1"})
    assert asked == []  # a job of o1 still runs: no login typed under it
    t[0] += loop.RELOGIN_BUSY_WAIT - 1
    sync({"o1"})
    assert asked == []
    t[0] += 2  # waited long enough: the re-login goes ahead (its own limits still apply)
    sync({"o1"})
    assert asked == ["o1"]
    asked.clear()
    loop._busy_since.clear()
    sync({"o1"})
    assert asked == []  # a new wait starts
    sync(set())  # the job ended: at once
    assert asked == ["o1"]


def test_a_relogin_wait_ends_when_the_session_comes_back_so_a_later_logout_waits_again(tmp_path, fresh):
    cfg = Config.from_env({"EXT_CONNECT": "on", "WORKER_STATE": str(tmp_path), "CHROME_BIN": "/usr/bin/true", "MERIMEN_LOGIN": "on", "MERIMEN_RELOGIN": "on"})
    t = [1000.0]
    asked = []
    page = [LOGIN_PAGE]

    def sync():
        loop.sync_sessions(cfg, SessRepo(), launch=lambda a: None, inspect=lambda p: page[0], now=lambda: t[0],
                           relogin=lambda org, port: asked.append(org), busy_orgs=lambda: {"o1"})

    sync()  # logged out while a job runs: the wait starts
    page[0] = {"urls": ["https://www.merimen.com.my/claims/index.cfm?CFID=1&RID=2"], "has_password": False}
    t[0] += 60
    sync()  # the session came back by itself
    page[0] = LOGIN_PAGE
    t[0] += loop.RELOGIN_BUSY_WAIT + 60
    sync()  # a new logout much later, jobs still running: a new wait, nothing typed under the running steps
    assert asked == []


def test_without_slots_the_relogin_never_waits(tmp_path, fresh):
    cfg = Config.from_env({"EXT_CONNECT": "on", "WORKER_STATE": str(tmp_path), "CHROME_BIN": "/usr/bin/true", "MERIMEN_LOGIN": "on", "MERIMEN_RELOGIN": "on"})
    asked = []
    loop.sync_sessions(cfg, SessRepo(), launch=lambda a: None, inspect=lambda p: LOGIN_PAGE, relogin=lambda org, port: asked.append(org))
    assert asked == ["o1"]


# ---------- the claim ----------

READY = [
    "INSERT INTO \"user\" (id, name, email) VALUES ('u1','U','u1@example.invalid')",
    *[f"INSERT INTO merimen_credentials (org_id, username_hint, wrapped_dek, dek_nonce, username_ct, username_nonce, password_ct, password_nonce, verify_state) "
      f"VALUES ('{o}','u','a','b','c','d','e','f','ok')" for o in ("o1", "o2")],
    *[f"INSERT INTO ext_org_settings (org_id, enabled, consent_reference) VALUES ('{o}', true, 'ref')" for o in ("o1", "o2")],
    *[f"INSERT INTO ext_consents (org_id, user_id, wording_version) VALUES ('{o}', 'u1', 'v1')" for o in ("o1", "o2")],
]
ORGS_CASES = [
    "INSERT INTO organizations (id, name) VALUES ('o1', 'One'), ('o2', 'Two')",
    # user 1 uploaded c1 and c2 first, then user 2 uploaded c3
    "INSERT INTO cases (id, org_id, plate, status, created_at) VALUES ('c1','o1','A1','phase_a', now() - interval '30 minutes'), "
    "('c2','o1','A2','phase_a', now() - interval '29 minutes'), ('c3','o2','B1','phase_a', now() - interval '20 minutes')",
]


def sessions(p1=9222, p2=9222):
    return [f"INSERT INTO worker_sessions (org_id, account_key, port, status, wanted) VALUES ('o1','default',{p1},'connected','start'), "
            f"('o2','default',{p2},'connected','start')"]


def mclaim(worker, limit=3, no_create=False):
    from autopilot_worker.db import to_numbered
    from autopilot_worker.jobs import CLAIM_SQL, claim_params

    sql, args = to_numbered(CLAIM_SQL, claim_params(True, limit, worker, one_chrome=True, no_create=no_create))
    return {"sql": sql, "params": args}


@needs_pg
def test_the_case_uploaded_first_goes_first_even_its_later_step():
    seed = ORGS_CASES + [
        # user 2's photo model was queued before user 1's later intake job, but user 1's case was uploaded first
        "INSERT INTO jobs (id, case_id, step, state, created_at) VALUES (1,'c3','photo_model','queued', now() - interval '10 minutes'), "
        "(2,'c2','intake','queued', now() - interval '5 minutes'), (3,'c1','photo_model','queued', now() - interval '1 minute')",
    ]
    r = run([claim("w", 3), claim("w", 3), claim("w", 3)], seed=seed)
    assert [x[0][0] for x in r] == [3, 2, 1]


@needs_pg
def test_never_two_jobs_of_one_case_at_once():
    seed = ORGS_CASES + ["INSERT INTO jobs (id, case_id, step, state) VALUES (1,'c1','intake','running'), (2,'c1','photo_model','queued')"]
    r = run([claim("w", 5)], seed=seed)
    assert r[0] == []


@needs_pg
def test_another_users_merimen_step_waits_on_the_same_chrome_but_not_its_photo_work():
    seed = ORGS_CASES + READY + sessions() + [
        "INSERT INTO jobs (id, case_id, step, state) VALUES (1,'c1','phase_a','running'), (2,'c3','phase_a','queued'), (3,'c3','photo_model','queued')",
    ]
    r = run([mclaim("w"), mclaim("w")], seed=seed)
    assert [x[0][0] for x in r if x] == [3]  # user 2's photo model may use a free slot; its Merimen step waits for user 1's
    assert r[1] == []


@needs_pg
def test_the_same_users_merimen_steps_run_side_by_side():
    seed = ORGS_CASES + READY + sessions() + [
        "INSERT INTO jobs (id, case_id, step, state) VALUES (1,'c1','phase_a','running'), (2,'c2','phase_a','queued')",
    ]
    r = run([mclaim("w")], seed=seed)
    assert r[0][0][0] == 2


@needs_pg
def test_users_with_their_own_chrome_run_side_by_side():
    seed = ORGS_CASES + READY + sessions(9222, 9223) + [
        "INSERT INTO jobs (id, case_id, step, state) VALUES (1,'c1','phase_a','running'), (2,'c3','phase_a','queued')",
    ]
    r = run([mclaim("w")], seed=seed)
    assert r[0][0][0] == 2


@needs_pg
def test_a_second_user_on_the_same_chrome_never_runs_merimen_even_when_the_first_is_idle():
    """One Chrome = one Merimen login: user 2's case must never be written into user 1's account."""
    seed = ORGS_CASES + READY + sessions() + ["INSERT INTO jobs (id, case_id, step, state) VALUES (2,'c3','phase_a','queued')"]
    r = run([mclaim("w")], seed=seed)
    assert r[0] == []


@needs_pg
def test_a_paused_org_gets_no_new_merimen_step_but_keeps_its_photo_work():
    from autopilot_worker.db import to_numbered
    from autopilot_worker.jobs import CLAIM_SQL, claim_params

    seed = ORGS_CASES + READY + sessions() + ["INSERT INTO jobs (id, case_id, step, state) VALUES (1,'c1','phase_a','queued'), (2,'c2','photo_model','queued')"]
    sql, args = to_numbered(CLAIM_SQL, claim_params(True, 3, "w", skip_orgs=["o1", "o9"], one_chrome=True))
    r = run([{"sql": sql, "params": args}, {"sql": sql, "params": args}], seed=seed)
    assert r[0][0][0] == 2 and r[1] == []


# ---------- a job that hangs, the lease, the tabs a job leaves ----------

def test_a_job_past_its_time_limit_keeps_its_slot_and_gets_one_warning(capsys):
    """Never cut off or run twice: a step in Merimen could then be done twice (plan #150 v3). The other slots go on."""
    t = [0.0]
    release = threading.Event()
    pool = JobPool(2, lambda job, d, e: release.wait(5) if job["id"] == 1 else None, make_driver=lambda: object(), warn_seconds=100, now=lambda: t[0])
    pool.submit({"id": 1, "step": "phase_b"})
    time.sleep(0.05)
    t[0] = 101
    assert pool.free() == 1 and pool.free() == 1
    assert capsys.readouterr().err.count("slot job 1 phase_b still running") == 1
    pool.submit({"id": 2, "step": "intake"})  # the other slot still works
    time.sleep(0.05)
    assert pool.free() == 1
    release.set()
    assert pool.wait_idle(2)


def test_a_jobs_own_leftover_tabs_are_closed_when_it_ends_and_the_ids_survive_a_restart(monkeypatch, tmp_path):
    from autopilot_worker import __main__ as m

    monkeypatch.setattr(m, "_target_info", info)
    m.STEP_TABS.clear()
    m.load_step_tabs(str(tmp_path))
    closed = []

    class Tab(FakePage):
        def is_closed(self):
            return self.tid in closed

        def close(self):
            closed.append(self.tid)

    class Ctx:
        def new_page(self):
            return Tab("left")

    home = FakePage("home")
    home.context = Ctx()
    m.HomeTab(home).context.new_page()  # a step opened it and raised before closing it
    m.STEP_TABS.clear()
    assert m.load_step_tabs(str(tmp_path)) == ["left"]  # a restart still knows it is the worker's own
    assert m.end_job_tabs() == 1 and closed == ["left"]
    assert "left" not in m.STEP_TABS
    other = []
    t = threading.Thread(target=lambda: other.append(m.end_job_tabs()))
    t.start()
    t.join()
    assert other == [0]  # another job thread closes nothing of this one
    m._step_tabs_dir[0] = ""
    m.STEP_TABS.clear()


def test_left_step_tabs_are_closed_at_start_by_their_ids_only(monkeypatch, tmp_path):
    import json
    from autopilot_worker import __main__ as m
    from autopilot_worker import login_flow

    (tmp_path / m.STEP_TABS_FILE).write_text(json.dumps(["a", "b"]))
    seen = []
    monkeypatch.setattr(login_flow, "close_target", lambda port, tid: seen.append((port, tid)))
    cfg = Config.from_env({"WORKER_STATE": str(tmp_path), "WORKER_SLOTS": "2"})
    m._close_left_step_tabs(cfg)
    assert seen == [(9222, "a"), (9222, "b")]
    m._step_tabs_dir[0] = ""
    m.STEP_TABS.clear()


def test_without_slots_the_claim_keeps_its_old_merimen_rule():
    from autopilot_worker.jobs import claim_params

    assert claim_params(True, 1, "w")["one_chrome"] is False and claim_params(True, 1, "w")["skip_orgs"] == ""


def test_chrome_starts_without_slowing_background_tabs():
    from autopilot_worker.chrome import chrome_argv

    argv = chrome_argv("/usr/bin/chrome", 9222, "/var/lib/x/profile")
    assert {"--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows"} <= set(argv)


def test_one_logout_dedupe_is_only_for_slots_and_ends_with_a_relogin(tmp_path):
    from test_session_lost import CountRepo, JOB, LOGIN_PAGE
    from autopilot_worker.pipeline import Outcome

    retry = Outcome("requeue", error="report", event="Phase A not saved")
    for slots, relogin_between, want in (("1", False, 2), ("2", False, 1), ("2", True, 2)):
        loop.ORG_PUTBACKS.clear()
        loop.FORCE_RELOGIN.clear()
        loop.RELOGIN_OK.clear()
        c = Config.from_env({"WORKER_STATE": str(tmp_path), "EXT_CONNECT": "on", "MERIMEN_RELOGIN": "on", "MERIMEN_LOGIN": "on", "WORKER_SLOTS": slots})
        t = [9000.0]
        loop.check_session_after(c, CountRepo(), {**JOB, "case_id": "a"}, retry, inspect=lambda p: LOGIN_PAGE, page_for=None, seen_login=True, now=lambda: t[0])
        t[0] += 30
        if relogin_between:
            loop.RELOGIN_OK["o1"] = t[0]
        t[0] += 30
        loop.check_session_after(c, CountRepo(), {**JOB, "case_id": "b"}, retry, inspect=lambda p: LOGIN_PAGE, page_for=None, seen_login=True, now=lambda: t[0])
        assert len(loop.ORG_PUTBACKS["o1"]) == want, (slots, relogin_between)
    loop.ORG_PUTBACKS.clear()
    loop.FORCE_RELOGIN.clear()
    loop.RELOGIN_OK.clear()


def test_a_second_org_on_a_shared_chrome_is_never_logged_in(tmp_path, fresh):
    """WORKER_SLOTS > 1: the Chrome is never switched to another org's Merimen account (no re-login, never connected)."""
    cfg = Config.from_env({"EXT_CONNECT": "on", "WORKER_STATE": str(tmp_path), "CHROME_BIN": "/usr/bin/true", "MERIMEN_LOGIN": "on",
                           "MERIMEN_RELOGIN": "on", "WORKER_SLOTS": "2"})

    class Shared(SessRepo):
        def chrome_taken_by_other(self, org, port):
            return True

    asked = []
    repo = Shared()
    loop.sync_sessions(cfg, repo, launch=lambda a: None, inspect=lambda p: LOGIN_PAGE, relogin=lambda org, port: asked.append(org))
    assert asked == [] and repo.sessions[-1][1]["detail"] == "shared_chrome" and repo.sessions[-1][1]["status"] == "waiting_login"
    asked.clear()
    repo = SessRepo()  # its own Chrome (or the owner): as before
    loop.sync_sessions(cfg, repo, launch=lambda a: None, inspect=lambda p: LOGIN_PAGE, relogin=lambda org, port: asked.append(org))
    assert asked == ["o1"]


@needs_pg
def test_chrome_taken_sql_matches_the_claim_rule():
    from autopilot_worker.db import to_numbered
    from autopilot_worker.jobs import CHROME_TAKEN_SQL

    q = lambda org, port=9222: dict(zip(("sql", "params"), to_numbered(CHROME_TAKEN_SQL, {"org": org, "port": port})))  # noqa: E731
    r = run([q("o1"), q("o2")], seed=ORGS_CASES + READY + sessions())
    assert r == [[[False]], [[True]]]
    r = run([q("o2", 9223)], seed=ORGS_CASES + READY + sessions(9222, 9223))
    assert r == [[[False]]]  # its own Chrome: free


@needs_pg
def test_an_org_without_a_live_case_never_owns_the_chrome():
    from autopilot_worker.db import to_numbered
    from autopilot_worker.jobs import CHROME_TAKEN_SQL

    q = lambda org: dict(zip(("sql", "params"), to_numbered(CHROME_TAKEN_SQL, {"org": org, "port": 9222})))  # noqa: E731
    seed = ["INSERT INTO organizations (id, name) VALUES ('o1', 'One'), ('o2', 'Two')",
            "INSERT INTO cases (id, org_id, plate, status, created_at) VALUES ('c3','o2','B1','phase_a', now())"]
    r = run([q("o1"), q("o2")], seed=seed + READY + sessions())
    assert r == [[[True]], [[False]]]  # o1 has no case: o2 (with a case) owns it


@needs_pg
def test_equal_upload_times_still_give_one_fixed_order():
    seed = ["INSERT INTO organizations (id, name) VALUES ('o1', 'One')",
            "INSERT INTO cases (id, org_id, plate, status, created_at) VALUES ('cb','o1','B','phase_a', '2026-01-01'), ('ca','o1','A','phase_a', '2026-01-01')",
            "INSERT INTO jobs (id, case_id, step, state, created_at) VALUES (1,'cb','intake','queued','2026-01-01'), (2,'ca','intake','queued','2026-01-01')"]
    r = run([claim("w", 5), claim("w", 5)], seed=seed)
    assert [x[0][1] for x in r] == ["ca", "cb"]


def test_an_unreadable_step_tabs_file_starts_empty(tmp_path, capsys):
    from autopilot_worker import __main__ as m

    (tmp_path / m.STEP_TABS_FILE).write_text('["a", ')
    assert m.load_step_tabs(str(tmp_path)) == []
    assert "step tabs file unreadable" in capsys.readouterr().err
    m._step_tabs_dir[0] = ""


@needs_pg
def test_while_a_create_runs_no_second_create_is_claimed_but_later_steps_are():
    seed = ORGS_CASES + READY + sessions() + [
        "UPDATE cases SET merimen_caseid = '123456' WHERE id = 'c2'",  # c2 is made already: its Phase A is no create
        "INSERT INTO jobs (id, case_id, step, state) VALUES (2,'c1','phase_a','queued'), (3,'c2','phase_a','queued')",
    ]
    r = run([mclaim("w", no_create=True), mclaim("w", no_create=True)], seed=seed)
    assert r[0][0][0] == 3 and r[1] == []  # c1 (no Merimen case yet) waits for the running create
    r = run([mclaim("w")], seed=seed)
    assert r[0][0][0] == 2  # no create running: the case uploaded first goes first, as before


# ---------- a step tab opens only its own job's Merimen case (GPR-150-3 G1) ----------

def test_a_step_tab_may_open_only_its_own_case():
    import pytest as _pt

    from autopilot_worker import case_guard as g

    class Tab:
        url = ""

        def goto(self, url, **k):
            self.url = url

    t = g.guard_page(Tab())
    g.start("111")
    t.goto("https://www.merimen.com.my/claims/index.cfm?fusebox=MTRadjuster&caseid=111&extid=9")
    with _pt.raises(g.CaseMismatch):
        t.goto("https://www.merimen.com.my/claims/index.cfm?fusebox=MTRadjuster&caseid=222&extid=9")
    assert "caseid=111" in t.url  # the other case was never opened
    g.start(None)  # the create: no case id yet, nothing to mix up
    t.goto("https://www.merimen.com.my/claims/index.cfm?caseid=222")
    g.add("333")  # the create recorded its new case: only that one from now on
    with _pt.raises(g.CaseMismatch):
        t.goto("https://www.merimen.com.my/claims/index.cfm?caseid=222")
    g.stop()
    t.goto("https://www.merimen.com.my/claims/index.cfm?caseid=222")  # outside a job: unchecked


def test_only_one_slots_worker_per_state_folder(tmp_path):
    import pytest as _pt

    from autopilot_worker import __main__ as m

    cfg = Config.from_env({"WORKER_STATE": str(tmp_path), "CHROME_BIN": "/usr/bin/true", "WORKER_SLOTS": "2"})
    try:
        assert m._one_slots_process(cfg) is True
        with _pt.raises(SystemExit):
            m._one_slots_process(cfg)  # a second slots worker refuses to start
        assert m._one_slots_process(cfg, hold=False) is False  # a WORKER_SLOTS=1 start leaves the running worker's tabs alone
    finally:
        for f in m._SLOTS_LOCK:
            f.close()
        m._SLOTS_LOCK.clear()
    assert m._one_slots_process(cfg, hold=False) is True  # gone: free again


# ---------- review round 1 (egm) ----------

def test_a_second_orgs_login_check_never_types_into_a_shared_chrome(tmp_path, fresh):
    cfg = Config.from_env({"EXT_CONNECT": "on", "WORKER_STATE": str(tmp_path), "CHROME_BIN": "/usr/bin/true", "WORKER_SLOTS": "2"})

    class VRepo:
        finished = None

        def claim_verify(self, skip=()):
            return {"org_id": "o2"}

        def chrome_taken_by_other(self, org, port):
            return True

        def owner_email(self, org):
            return None

        def finish_verify(self, org, decision, **k):
            VRepo.finished = decision

    typed = []
    loop._verify_wait.clear()
    loop.verify_once(cfg, VRepo(), lambda user, password, port: typed.append(port), b"k" * 32)
    assert typed == [] and VRepo.finished["release"] and VRepo.finished["reason"] == "shared_chrome"
    loop._verify_wait.clear()


def test_the_pool_never_starts_a_job_twice_and_knows_a_claimed_create(capsys):
    from autopilot_worker.pool import JobPool

    gate = threading.Event()
    pool = JobPool(2, lambda job, d, extra: gate.wait(5), make_driver=lambda: object())
    pool.submit({"id": 1, "step": "phase_a", "create": True})
    assert pool.has(1) and pool.create_running()
    with pytest.raises(RuntimeError):
        pool.submit({"id": 1, "step": "phase_a", "create": True})
    gate.set()
    assert pool.wait_idle(5) and not pool.create_running()
    out = capsys.readouterr().out
    assert "job 1 phase_a start" in out and "job 1 phase_a end" in out  # the trial reads the overlap from these lines


def test_slots_one_keeps_popups_as_tabs_and_slots_keep_a_lone_home_tab_opened_from_a_link(monkeypatch):
    from autopilot_worker import __main__ as m

    monkeypatch.setattr(m, "_target_info", info)
    m.STEP_TABS.clear()
    home, linked = FakePage("home"), FakePage("linked", opener="someone")
    assert m.not_step_tabs([home, linked], info=info, chain=False) == [home, linked]  # WORKER_SLOTS=1: several_tabs as before
    assert m.not_step_tabs([linked], info=info) == [linked]  # slots, one tab: a home tab opened from a link still works
    step = m.HomeTab(home).context.new_page()
    child = FakePage("child", opener=step.tid)
    grandchild = FakePage("grandchild", opener="child")
    assert m.not_step_tabs([child, grandchild], info=info) == []  # a popup of a step tab (and its popup) is never the home tab
    m.STEP_TABS.clear()


def test_the_home_tab_is_read_only():
    from autopilot_worker import __main__ as m

    home = m.HomeTab(FakePage("home"))
    assert home.url
    for name in ("goto", "click", "fill", "reload", "evaluate", "close"):
        with pytest.raises(m.HomeTabWrite):
            getattr(home, name)


def test_a_case_mismatch_ends_the_job_for_a_person_and_is_not_swallowed():
    from autopilot_worker import case_guard as g

    assert not issubclass(g.CaseMismatch, Exception)  # the steps' own `except Exception` never turns it into a retry
    try:
        try:
            raise g.CaseMismatch("case_mismatch")
        except Exception:  # noqa: BLE001
            raise AssertionError("swallowed")
    except g.CaseMismatch:
        pass


def test_waiting_for_another_create_gives_its_try_back():
    from autopilot_worker.pipeline import Outcome
    from autopilot_worker.store import PgRepo

    class Db:
        def __init__(self):
            self.sql = []

        def batch(self, st, *a, **k):
            self.sql += list(st)
            return []

        def execute(self, *a, **k):
            return []

    repo = PgRepo.__new__(PgRepo)
    repo.db = Db()
    repo.apply({"id": 7, "case_id": "c", "org_id": "o", "attempts": 4, "step": "phase_a"},
               Outcome("requeue", error="create_busy", event="Waiting for another case to be created in Merimen first"))
    text = " ".join(s for s, _ in repo.db.sql)
    assert "attempts = GREATEST(attempts - 1, 0)" in text and "'failed'" not in text


def test_stop_seconds_stay_below_the_supervisor_timeout(tmp_path):
    c = Config.from_env({"WORKER_STATE": str(tmp_path), "CHROME_BIN": "/usr/bin/true", "WORKER_STOP_SECONDS": "300"})
    assert c.stop_seconds == 85


def test_any_worker_refuses_to_start_beside_a_slots_worker(tmp_path):
    from autopilot_worker import __main__ as m

    cfg = Config.from_env({"WORKER_STATE": str(tmp_path), "CHROME_BIN": "/usr/bin/true", "WORKER_SLOTS": "2"})
    try:
        assert m._one_slots_process(cfg)
        assert m._one_slots_process(cfg, hold=False) is False  # the lock is taken: a second worker is refused
    finally:
        for f in m._SLOTS_LOCK:
            f.close()
        m._SLOTS_LOCK.clear()


# ---------- egm round 1 / plan review round 4 (GPR-150-4, DPR-150-4) ----------

def test_a_tab_a_person_opened_from_the_home_tab_still_stops_the_pick(monkeypatch):
    from autopilot_worker import __main__ as m

    monkeypatch.setattr(m, "_target_info", info)
    m.STEP_TABS.clear()
    home = FakePage("home")
    by_hand = FakePage("hand-popup", opener="home")  # target=_blank or a middle click from the home tab keeps the opener
    assert m.not_step_tabs([home, by_hand], info=info) == [home, by_hand]  # two tabs: several_tabs, the #147 safe stop
    m.STEP_TABS.clear()


def test_a_job_end_closes_the_popups_its_step_tabs_left_open_also_after_the_step_closed_its_tab(monkeypatch):
    from autopilot_worker import __main__ as m

    class Pg:
        def __init__(self, tid):
            self.tid, self.opener, self.closed, self.handlers = tid, None, False, {}
            self.context = self

        def on(self, name, fn):
            self.handlers[name] = fn

        def new_page(self):
            return Pg("s1")

        def is_closed(self):
            return self.closed

        def close(self):
            self.closed = True

    monkeypatch.setattr(m, "_target_info", info)
    m.STEP_TABS.clear()
    m._job_tabs.pages = []
    home = Pg("home")
    step = m._StepContext(home).new_page()  # a step opens its tab (guarded) from the home tab's context
    real = step._real if hasattr(step, "_real") else step
    pop = Pg("p1")
    real.handlers["popup"](pop)  # the step's upload opens a popup
    grand = Pg("p2")
    pop.handlers["popup"](grand)  # and that popup one more
    real.close()  # the step closes its own tab, the popups stay
    other = Pg("s2")
    assert m.end_job_tabs() == 2
    assert pop.closed and grand.closed and not other.closed and not home.closed
    m.STEP_TABS.clear()


def test_a_popup_of_a_step_tab_is_recorded_in_the_file_at_the_next_use_of_the_tab(monkeypatch, tmp_path):
    import json as _json

    from autopilot_worker import __main__ as m
    from autopilot_worker import case_guard as g

    class Pg(FakePage):
        def __init__(self, tid):
            super().__init__(tid)
            self.handlers = {}
            self.context = self

        def on(self, name, fn):
            self.handlers.setdefault(name, []).append(fn)

        def new_page(self):
            return Pg("s1")

        def is_closed(self):
            return False

        def wait_for_timeout(self, ms):
            return None

        def goto(self, url, **k):
            self.url = url

    monkeypatch.setattr(m, "_target_info", info)
    monkeypatch.setattr(m, "_step_tabs_dir", [str(tmp_path)])
    monkeypatch.setattr(g, "_ON_USE", [m.record_job_tabs])
    m.STEP_TABS.clear()
    m._job_tabs.pages = []
    step = m._StepContext(Pg("home")).new_page()
    for fn in step._real.handlers["popup"]:
        fn(Pg("p1"))  # a Relabel popup: no Chrome call in the event handler
    assert "p1" not in m.STEP_TABS
    step.wait_for_timeout(1)  # the step's next use of its tab, in its own thread
    assert {"s1", "p1"} <= m.STEP_TABS
    assert {"s1", "p1"} <= set(_json.load(open(tmp_path / m.STEP_TABS_FILE)))  # a kill now leaves nothing unknown behind
    m.end_job_tabs()
    assert not m.STEP_TABS
    m._job_tabs.pages = []


def test_the_home_tab_allows_only_reading_its_address_and_opening_a_new_tab():
    from autopilot_worker import __main__ as m

    home = m.HomeTab(FakePage("home"))
    assert home.url and home.context.new_page()
    for name in ("locator", "get_by_role", "keyboard", "mouse", "main_frame", "frames", "expect_navigation", "route"):
        with pytest.raises(m.HomeTabWrite):
            getattr(home, name)
    for name in ("pages", "close"):
        with pytest.raises(m.HomeTabWrite):
            getattr(home.context, name)  # context.pages[i] would reach the home tab, context.close() every tab
    assert not issubclass(m.HomeTabWrite, Exception)  # a step's `except Exception` never swallows it
    m.STEP_TABS.clear()


def test_a_finished_create_lets_the_next_create_be_claimed_while_its_phase_a_goes_on():
    import threading as _th

    from autopilot_worker import pool as pl

    gate, inside = _th.Event(), _th.Event()

    def run_one(job, driver, extra):
        pl.create_done()  # the create let the lock go; the report, documents and photos follow
        inside.set()
        gate.wait(5)

    pool = JobPool(2, run_one, make_driver=lambda: object())
    pool.submit({"id": 1, "step": "phase_a", "create": True, "org_id": "o"})
    assert inside.wait(5)
    assert not pool.create_running()  # the claim may take the next create now
    assert pool.busy_orgs() == {"o"}
    gate.set()
    assert pool.wait_idle(5)


def test_a_checks_job_does_not_count_as_a_merimen_step():
    import threading as _th

    gate = _th.Event()
    pool = JobPool(1, lambda job, d, e: gate.wait(5), make_driver=lambda: object())
    pool.submit({"id": 1, "step": "checks", "org_id": "o"})
    assert pool.busy_orgs() == set()  # it only waits: no keepalive pause, no re-login wait for it
    assert pool.running_ids() == [1]
    gate.set()
    assert pool.wait_idle(5)


def test_waiting_for_another_create_leaves_the_case_as_it_was_and_is_no_logout():
    from autopilot_worker import loop
    from autopilot_worker.pipeline import Outcome
    from autopilot_worker.store import PgRepo

    class Db:
        def __init__(self):
            self.sql = []

        def batch(self, st, *a, **k):
            self.sql += list(st)
            return []

    repo = PgRepo.__new__(PgRepo)
    repo.db = Db()
    busy = Outcome("requeue", error="create_busy", event="Waiting for another case to be created in Merimen first")
    repo.apply({"id": 7, "case_id": "c", "org_id": "o", "attempts": 1, "step": "phase_a"}, busy)
    assert not any(st.lstrip().startswith("UPDATE cases") for st, _ in repo.db.sql)  # the case's error is not overwritten
    assert not loop._may_come_from_logout({"step": "phase_a"}, busy, seen_login=True)


@needs_pg
def test_the_chrome_owner_never_changes_while_its_merimen_step_runs():
    from autopilot_worker.db import to_numbered
    from autopilot_worker.jobs import CHROME_TAKEN_SQL

    q = lambda org: dict(zip(("sql", "params"), to_numbered(CHROME_TAKEN_SQL, {"org": org, "port": 9222})))  # noqa: E731
    seed = ["INSERT INTO organizations (id, name) VALUES ('o1', 'One'), ('o2', 'Two')",
            "INSERT INTO cases (id, org_id, plate, status, created_at) VALUES ('c1','o1','A1','phase_a', now() - interval '1 day'),"
            " ('c3','o2','B1','phase_a', now())",
            "INSERT INTO jobs (id, case_id, step, state) VALUES (5,'c3','phase_b','running')"]
    r = run([q("o1"), q("o2")], seed=seed + READY + sessions())
    assert r == [[[True]], [[False]]]  # o1's case is older, but o2's step runs now: o2 keeps the Chrome until it ends


def test_a_click_or_redirect_to_another_case_stops_the_next_action_and_ends_the_job():
    import pytest as _pt

    from autopilot_worker import case_guard as g

    handlers = {}

    class Tab:
        url = "https://www.merimen.com.my/claims/index.cfm?caseid=111"

        def on(self, name, fn):
            handlers[name] = fn

        def goto(self, url, **k):
            self.url = url

        def click(self, sel):
            self.url = "https://www.merimen.com.my/claims/index.cfm?caseid=222"  # a link that led to another case

        def locator(self, sel):
            return sel

    g.start("111", 5)
    t = g.guard_page(Tab())
    t.click("a.next")  # the click itself was on the own case
    with _pt.raises(g.CaseMismatch):
        t.locator("#save")  # the next use of the tab stops
    assert g.mismatched()
    g.start("111", 6)  # a new job starts clean
    assert not g.mismatched()

    class Frame:
        parent_frame = None
        url = "https://www.merimen.com.my/claims/index.cfm?caseid=333"

    handlers["framenavigated"](Frame())  # a redirect seen as it happens: the job is marked, run_job ends it as case_mismatch
    assert g.mismatched()

    class Popup:
        url = "https://www.merimen.com.my/claims/index.cfm?caseid=111"

        def on(self, name, fn):
            pass

    g.start("111", 7)
    handlers["popup"](Popup())
    assert not g.mismatched()  # a popup on the own case is fine
    Popup.url = "https://www.merimen.com.my/claims/index.cfm?caseid=444"
    handlers["popup"](Popup())
    assert g.mismatched()
    g.stop()


def test_every_driver_attribute_has_a_threading_model():
    import re as _re
    from pathlib import Path

    from autopilot_worker import __main__ as m
    from autopilot_worker.pool import PER_JOB, SHARED

    names = set(m._CdpDriver("s").__dict__)
    src = Path(m.__file__).read_text() + Path(m.__file__).with_name("loop.py").read_text() + Path(m.__file__).with_name("pipeline.py").read_text()
    names |= set(_re.findall(r"\bdriver\.([a-z_][a-z0-9_]*) = ", src))
    assert names <= SHARED | PER_JOB, names - SHARED - PER_JOB
    assert not SHARED & PER_JOB


# ---------- egm round 3 ----------

def _run_one(tmp_path, monkeypatch, behaviour):
    """run_job with a step that does `behaviour()` (a fake handle_job): what outcome is written."""

    from autopilot_worker import loop
    from autopilot_worker.pipeline import Driver, Outcome

    applied = []

    class Repo:
        def load(self, case_id):
            return {"id": "c1", "org_id": "o1", "status": "phase_a", "plate": "A1", "case_data": {}, "photos": [], "files": []}

        def was_put_back(self, job): return False
        def gate(self, org, env_on): return "off"
        def session_status(self, org): return "idle"
        def touch(self, *a, **k): return True
        def apply(self, job, outcome): applied.append(outcome)
        def __getattr__(self, name): return lambda *a, **k: None

    def fake_handle(*a, **k):
        behaviour()
        return Outcome("done", event="ok")

    monkeypatch.setattr(loop, "handle_job", fake_handle)
    c = Config.from_env({"WORKER_STATE": str(tmp_path), "CHROME_BIN": "/usr/bin/true"})
    loop.run_job(c, Repo(), {"id": 7, "case_id": "c1", "step": "phase_a", "attempts": 1, "org_id": "o1"}, inspect=lambda p: None,
                 namer=None, driver=Driver(), download=lambda *a: None)
    return applied[-1]


def test_run_job_ends_a_job_whose_tab_was_sent_to_another_case(tmp_path, monkeypatch):
    from autopilot_worker import case_guard as g

    class Frame:
        parent_frame = None
        url = "https://www.merimen.com.my/claims/index.cfm?caseid=999"

    def step():  # the step's tab was redirected to another case, and the step itself returned normally
        g.add("111")
        g._flag(g._MINE.st) if g._other(g._MINE.st, Frame.url) else None

    out = _run_one(tmp_path, monkeypatch, step)
    assert out.job_state == "failed" and out.error == "case_mismatch" and out.case_status == "waiting_user"


def test_a_step_that_fails_after_its_tab_was_sent_to_another_case_is_not_retried(tmp_path, monkeypatch):
    from autopilot_worker import case_guard as g

    def step():  # a redirect marked the job, then the step's next wait timed out with a plain error
        g.add("111")
        g._flag(g._MINE.st)
        raise TimeoutError("locator timed out")

    out = _run_one(tmp_path, monkeypatch, step)
    assert out.job_state == "failed" and out.error == "case_mismatch"


def test_run_job_ends_a_job_that_tried_to_change_the_home_tab(tmp_path, monkeypatch):
    from autopilot_worker import __main__ as m

    def step():
        try:
            m.HomeTab(FakePage("home")).locator("#x")
        except Exception:  # noqa: BLE001  (a step's own handler: it must not swallow it)
            raise AssertionError("swallowed")

    out = _run_one(tmp_path, monkeypatch, step)
    assert out.job_state == "failed" and out.error == "home_tab_write"


def test_a_tab_opened_from_a_step_tab_is_recorded_and_cannot_reach_the_home_tab(monkeypatch):
    from autopilot_worker import __main__ as m

    class Tab(FakePage):
        def goto(self, url, **k):
            self.url = url

    class Ctx:
        def __init__(self):
            self.n = 0

        def new_page(self):
            self.n += 1
            return Tab(f"t{self.n}")

    monkeypatch.setattr(m, "_target_info", info)
    m.STEP_TABS.clear()
    sc = m._StepContext(Ctx())
    tab = sc.new_page()
    second = tab.context.new_page()  # through the step tab's own context
    assert {"t1", "t2"} <= m.STEP_TABS and second is not None
    with pytest.raises(m.HomeTabWrite):
        tab.context.pages  # noqa: B018
    m.end_job_tabs()
    m.STEP_TABS.clear()


def test_two_workers_on_one_chrome_are_refused_even_with_different_state_folders(tmp_path, monkeypatch):
    from autopilot_worker import __main__ as m

    monkeypatch.setenv("WORKER_LOCK_DIR", str(tmp_path))
    a = Config.from_env({"WORKER_STATE": str(tmp_path / "a"), "CHROME_BIN": "/usr/bin/true", "WORKER_SLOTS": "2"})
    b = Config.from_env({"WORKER_STATE": str(tmp_path / "b"), "CHROME_BIN": "/usr/bin/true"})
    try:
        assert m._one_slots_process(a)
        assert m._one_slots_process(b, hold=False) is False  # same Chrome port 9222, other state folder
    finally:
        for f in m._SLOTS_LOCK:
            f.close()
        m._SLOTS_LOCK.clear()
    assert m._one_slots_process(b, hold=False) is True


def test_a_bad_login_never_pauses_a_job_another_slot_is_running():
    # a row paused under a running job would be resumed later and run its Merimen step a second time (I2); the claim already
    # takes no Merimen step while the login is blocked
    from autopilot_worker.store import pause_statements

    sql = pause_statements("o1", "bad login")[0][0]
    assert "state = 'queued'" in sql and "'running'" not in sql
    import inspect

    from autopilot_worker import store

    src = inspect.getsource(store.PgRepo.apply)
    assert "WHERE state = 'queued' AND id <> %s" in src and "state IN ('queued', 'running') AND id <>" not in src


def test_live_writes_with_several_jobs_per_org_and_no_slots_refuse_to_start(tmp_path):
    from autopilot_worker import __main__ as m

    base = {"WORKER_STATE": str(tmp_path), "CHROME_BIN": "/usr/bin/true", "MERIMEN_WRITES": "on", "WORKER_SUBMIT": "on"}
    with pytest.raises(SystemExit):
        m.refuse_unsafe_start(Config.from_env({**base, "ORG_CONCURRENCY": "2"}))
    m.refuse_unsafe_start(Config.from_env({**base, "ORG_CONCURRENCY": "2", "WORKER_SLOTS": "2"}))  # slots: one process, allowed
    m.refuse_unsafe_start(Config.from_env({**base}))  # one job per org: as before
    m.refuse_unsafe_start(Config.from_env({"WORKER_STATE": str(tmp_path), "CHROME_BIN": "/usr/bin/true", "ORG_CONCURRENCY": "2"}))  # no writes


def test_the_stop_waits_at_most_the_stop_seconds_for_a_running_job():
    import threading as _t
    import time as _time

    from autopilot_worker.pool import JobPool

    release = _t.Event()
    pool = JobPool(2, lambda job, driver, extra: release.wait(5), make_driver=lambda: object())
    pool.submit({"id": 1, "step": "phase_a"})
    t0 = _time.monotonic()
    assert pool.wait_idle(0.3) is False  # still running after the stop time: the process exits and cuts it off
    assert _time.monotonic() - t0 < 1.0
    release.set()
    assert pool.wait_idle(2) is True


@needs_pg
def test_a_login_blocked_or_a_port_lost_under_a_running_step_never_hands_the_chrome_over():
    """egm r5 B1: the owner's saved login turns blocked, or its row loses the port, while its Merimen step still runs: the other org
    on that Chrome still does not own it until the step ends."""
    from autopilot_worker.db import to_numbered
    from autopilot_worker.jobs import CHROME_TAKEN_SQL

    q = lambda org: dict(zip(("sql", "params"), to_numbered(CHROME_TAKEN_SQL, {"org": org, "port": 9222})))  # noqa: E731
    running = ["INSERT INTO jobs (id, case_id, step, state) VALUES (5,'c1','phase_a','running')"]
    blocked = ["UPDATE merimen_credentials SET blocked = true WHERE org_id = 'o1'"]
    no_port = ["UPDATE worker_sessions SET port = NULL WHERE org_id = 'o1'"]
    for extra in (blocked, no_port, blocked + no_port):
        r = run([q("o2")], seed=ORGS_CASES + READY + sessions() + running + extra)
        assert r == [[[True]]], extra  # o1's step runs: o2 never gets this Chrome
        r = run([q("o2")], seed=ORGS_CASES + READY + sessions() + extra)
        assert r == [[[False]]], extra  # no step of o1 runs: as before, a blocked o1 (or one with no port) does not count


def test_an_org_that_saw_no_sharer_yet_is_asked_again_before_its_relogin(tmp_path, fresh):
    """egm r5 M1: on a fresh start the first org in the loop sees a sharer whose row has no port yet; the re-login is asked again
    once every port is written, so the Chrome is never logged into the org that does not own it."""
    cfg = Config.from_env({"EXT_CONNECT": "on", "WORKER_STATE": str(tmp_path), "CHROME_BIN": "/usr/bin/true", "MERIMEN_LOGIN": "on",
                           "MERIMEN_RELOGIN": "on", "WORKER_SLOTS": "2"})

    class Later(SessRepo):
        n = 0

        def chrome_taken_by_other(self, org, port):
            self.n += 1
            return self.n > 1  # free in the loop (the sharer had no port), taken when asked again

    asked = []
    repo = Later()
    loop.sync_sessions(cfg, repo, launch=lambda a: None, inspect=lambda p: LOGIN_PAGE, relogin=lambda org, port: asked.append(org))
    assert asked == [] and repo.sessions[-1][1]["detail"] == "shared_chrome"


def test_no_milestone_screenshot_after_a_tab_went_to_another_case():
    from autopilot_worker import case_guard as g

    src = (pathlib.Path(__file__).resolve().parents[1] / "autopilot_worker" / "__main__.py").read_text()
    i = src.index("if own_only:")
    assert src.index("case_guard.mismatched()", i) < src.index("own_open_step_tab()", i)  # checked before the tab is used
    g.start("111", 9)
    g._MINE.st["bad"] = True
    assert g.mismatched()
    g.start("111", 10)


def test_a_phase_a_with_writes_off_lets_the_next_create_be_claimed(monkeypatch):
    from autopilot_worker import pool as pl
    from autopilot_worker.__main__ import _CdpDriver as RealDriver

    monkeypatch.delenv("MERIMEN_DRYRUN", raising=False)
    job = {"id": 1, "step": "phase_a", "create": True}
    pl._CURRENT.job = job
    try:
        RealDriver.dry_run(RealDriver.__new__(RealDriver), "A", ())
        assert job.get("create_done") is True
    finally:
        pl._CURRENT.job = None


def test_session_tabs_reads_the_home_tab_and_only_step_tabs_left_is_logged_out(tmp_path, monkeypatch):
    """egm r5 M3: the real page provider's session look, through a fake Playwright."""
    import sys as _sys
    import types

    from autopilot_worker import __main__ as m

    URL = "https://www.merimen.com.my/claims/index.cfm?CFID=1&CFTOKEN=2&USID=3&RID=4"

    class Cdp:
        def __init__(self, tid):
            self.tid = tid

        def send(self, name):
            return {"targetInfo": {"targetId": self.tid}}

        def detach(self):
            pass

    class Box:
        def __init__(self, shown):
            self.first = self
            self.shown = shown

        def is_visible(self):
            return self.shown

    class Page:
        def __init__(self, tid, box=False):
            self.url, self.tid, self.box, self.context = URL, tid, box, self

        def new_cdp_session(self, pg):
            return Cdp(pg.tid)

        def locator(self, sel):
            return Box(self.box)

    tabs = []

    class Browser:
        @property
        def contexts(self):
            return [types.SimpleNamespace(pages=list(tabs))]

    class PW:
        chromium = types.SimpleNamespace(connect_over_cdp=lambda url: Browser())

        def start(self):
            return self

        def stop(self):
            pass

    fake = types.ModuleType("playwright.sync_api")
    fake.sync_playwright = lambda: PW()
    monkeypatch.setitem(_sys.modules, "playwright", types.ModuleType("playwright"))
    monkeypatch.setitem(_sys.modules, "playwright.sync_api", fake)
    monkeypatch.setattr(m, "STEP_TABS", {"s"})
    for slots, open_tabs, want in (("2", [Page("h"), Page("s", box=True)], [False]),  # the home tab decides, not a step tab's form
                                   ("2", [Page("s")], [True]),  # only step tabs left: logged out
                                   ("1", [Page("s", box=True)], [True]),  # one tab at slots 1: read as before
                                   ("1", [Page("s")], [False])):
        tabs[:] = open_tabs
        cfg = Config.from_env({"WORKER_STATE": str(tmp_path), "WORKER_SLOTS": slots})
        assert m._page_provider(cfg).session_tabs("o1") == want, (slots, want)


def test_a_live_create_keeps_no_create_on_until_its_create_ends(monkeypatch):
    """egm r6 B3: with live writes the dry pass before save() must not end `no_create`; only the create itself does."""
    from autopilot_worker import pool as pl
    from autopilot_worker.__main__ import _CdpDriver

    for k, v in (("MERIMEN_WRITES", "on"), ("WORKER_SUBMIT", "on")):
        monkeypatch.setenv(k, v)
    monkeypatch.delenv("MERIMEN_DRYRUN", raising=False)
    monkeypatch.delenv("MERIMEN_CREATE_ONLY_CASE", raising=False)
    job = {"id": 1, "step": "phase_a", "create": True}
    pl._CURRENT.job = job
    try:
        d = _CdpDriver.__new__(_CdpDriver)
        d.case = {"id": "c1"}
        _CdpDriver.dry_run(d, "A", ())
        assert not job.get("create_done")  # still on: the claim takes no second create before this one runs
        monkeypatch.setenv("MERIMEN_CREATE_ONLY_CASE", "other")
        _CdpDriver.dry_run(d, "A", ())
        assert job.get("create_done") is True  # this case is not the supervised one: nothing is created, so it ends at once
    finally:
        pl._CURRENT.job = None
