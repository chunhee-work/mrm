"""WORKER_SLOTS (plan #150): several cases at once, one tab each; the case uploaded first goes first; one Merimen login per Chrome."""
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
    assert "--disable-background-timer-throttling" in argv and "--disable-renderer-backgrounding" in argv


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
