"""Merimen logs the worker out half way through a job (owner 2026-11-28): the job is put back without using a try, a re-login is
booked, and the job goes on from where it stopped (photos: only the part of a cut-off upload that is not in Merimen yet)."""
import time

from autopilot_worker import loop
from autopilot_worker import photo_sync as ps
from autopilot_worker.config import Config
from autopilot_worker.db import to_numbered
from autopilot_worker.loop import (
    FORCE_RELOGIN, LOST_CAP, session_alive, session_lost_outcome, sync_sessions,
)
from autopilot_worker.photo_rules import snapshot_of
from autopilot_worker.pipeline import Outcome
from autopilot_worker.store import PgRepo
from test_claim import SEED, needs_pg, run
from test_photo_sync import Fake, rows

LOGGED_IN = {"urls": ["https://www.merimen.com.my/claims/index.cfm?CFID=1&RID=2"], "has_password": False}
LOGIN_PAGE = {"urls": ["https://www.merimen.com.my/claims/login.cfm"], "has_password": False}
JOB = {"id": 100, "case_id": "c1", "step": "phase_b", "org_id": "o1", "attempts": 3}


def cfg(tmp_path, **extra):
    env = {"EXT_CONNECT": "on", "WORKER_STATE": str(tmp_path), "CHROME_BIN": "/usr/bin/true", **extra}
    return Config.from_env(env)


def provider(*tabs):
    """A page provider that can look inside the tabs: one bool per tab with session marks, True = it shows a password box."""
    def page_for(org, strict=False):
        return None
    page_for.session_tabs = lambda org: list(tabs)
    return page_for


def broken_provider():
    def page_for(org, strict=False):
        return None

    def look(org):
        raise RuntimeError("cdp")
    page_for.session_tabs = look
    return page_for


# ---------- noticing it ----------

def test_session_alive_reads_the_tab_addresses_and_the_pages(tmp_path):
    c = cfg(tmp_path)
    assert session_alive(c, lambda p: LOGGED_IN, None, "o1") is True
    assert session_alive(c, lambda p: LOGIN_PAGE, None, "o1") is False
    assert session_alive(c, lambda p: None, None, "o1") is True  # Chrome did not answer once: unknown, the job's own outcome stands
    # an old address that still carries the session marks, but the page shows a password box
    assert session_alive(c, lambda p: LOGGED_IN, provider(True), "o1") is False
    assert session_alive(c, lambda p: LOGGED_IN, provider(False), "o1") is True
    # two logged-in tabs are not "logged out"; one stale tab beside a good one is not either
    assert session_alive(c, lambda p: LOGGED_IN, provider(False, False), "o1") is True
    assert session_alive(c, lambda p: LOGGED_IN, provider(True, False), "o1") is True
    # a look that sees nothing or fails says nothing: the address decides
    assert session_alive(c, lambda p: LOGGED_IN, provider(), "o1") is True
    assert session_alive(c, lambda p: LOGGED_IN, broken_provider(), "o1") is True


# ---------- the outcome ----------

def test_under_the_cap_the_job_is_put_back_and_keeps_what_it_wrote():
    got = session_lost_outcome(JOB, Outcome("failed", case_status="waiting_user", error="photos", event="Phase B stopped. x",
                                            merimen_caseid="M1", photo_log={"a": 1}, enqueue=["checks"]), count=0)
    assert got.job_state == "requeue" and got.session_lost
    assert got.case_status is None and got.error is None and got.enqueue == []
    assert got.merimen_caseid == "M1" and got.photo_log == {"a": 1}
    assert got.event.startswith(loop.LOST_EVENT + " Phase B.")


def test_at_the_cap_the_job_takes_its_own_failure_path():
    own = Outcome("failed", case_status="waiting_user", error="photos", event="Phase B stopped. x")
    got = session_lost_outcome(JOB, own, count=LOST_CAP)
    assert got.job_state == "failed" and not got.session_lost and got.case_status == "waiting_user"
    assert got.event.startswith(f"Merimen logged out {LOST_CAP} times") and got.event.endswith("Phase B stopped. x")
    assert not got.event.startswith(loop.LOST_EVENT)  # the cap line is never counted as a put-back


class Rec:
    def __init__(self):
        self.batches = []

    def batch(self, statements):
        self.batches.append(list(statements))
        return []


def test_a_put_back_gives_the_try_back_and_marks_the_session_logged_out():
    rec = Rec()
    PgRepo("", db=rec).apply({**JOB, "attempts": 4}, session_lost_outcome(JOB, Outcome("requeue", event="x"), count=0))
    sqls = [s[0] for s in rec.batches[0]]
    assert any("attempts = GREATEST(attempts - 1, 0)" in s for s in sqls)
    assert any("UPDATE worker_sessions SET status = 'expired'" in s for s in sqls)
    assert not any("Stopped after" in str(s[1]) for s in rec.batches[0])  # the 4th claim is not "the last try" here


@needs_pg
def test_on_postgres_the_put_back_keeps_the_attempts_and_the_cap_counts_the_events():
    seed = SEED[:2] + [
        "INSERT INTO jobs (id, case_id, step, state, attempts, locked_by, locked_at) VALUES (100,'c1','phase_b','running',4,'w1',now())",
        "INSERT INTO worker_sessions (org_id, account_key, port, status, wanted) VALUES ('o1','default',9222,'connected','start')",
    ]
    rec = Rec()
    repo = PgRepo("", db=rec)
    repo.apply({**JOB, "attempts": 4}, session_lost_outcome(JOB, Outcome("failed", event="x"), count=0))
    steps = [dict(zip(("sql", "params"), to_numbered(*st))) for st in rec.batches[0]]
    count = Rec2()
    PgRepo("", db=count).session_lost_count("c1")
    csql, cargs = to_numbered(*count.calls[0])
    r = run([*steps,
             {"sql": "SELECT state, attempts, not_before > now() FROM jobs WHERE id = 100"},
             {"sql": "SELECT status, detail FROM worker_sessions WHERE org_id = 'o1'"},
             {"sql": csql, "params": cargs},
             {"sql": "INSERT INTO case_events (case_id, step, message, at) VALUES ('c1','phase_b','Merimen logged out during Phase B. old', now() - interval '7 hours')"},
             {"sql": csql, "params": cargs}], seed=seed)
    n = len(steps)
    assert r[n] == [["queued", 3, True]]
    assert r[n + 1] == [["expired", "not_logged_in"]]
    assert r[n + 2] == [[1]] and r[n + 4] == [[1]]  # an event older than 6 h is not counted


class Rec2:
    def __init__(self):
        self.calls = []

    def execute(self, sql, params=()):
        self.calls.append((sql, params))
        return [(0,)]


# ---------- the re-login ----------

class SessRepo:
    def __init__(self, rows):
        self.rows, self.sessions, self.seen = rows, [], []

    def ensure_sessions(self):
        pass

    def wanted(self):
        return self.rows

    def gate(self, org, env_on):
        return "ready"

    def set_session(self, org, **k):
        self.sessions.append((org, k))

    def seen_connected(self, org):
        self.seen.append(org)

    def relogin_order(self, orgs):
        return list(orgs)


def row(status="expired"):
    return {"org_id": "o1", "account_key": "default", "status": status, "wanted": "start", "port": 9222}


def test_a_marked_session_gets_a_relogin_although_a_tab_address_looks_logged_in(tmp_path):
    FORCE_RELOGIN.clear()
    asked = []
    sync_sessions(cfg(tmp_path), SessRepo([row()]), launch=lambda a: None, inspect=lambda p: LOGGED_IN, relogin=lambda o, p: asked.append(o))
    assert asked == []  # not marked: the address decides, as before
    FORCE_RELOGIN["o1"] = time.monotonic()
    repo = SessRepo([row()])
    sync_sessions(cfg(tmp_path), repo, launch=lambda a: None, inspect=lambda p: LOGGED_IN, relogin=lambda o, p: asked.append(o) or "ok")
    assert asked == ["o1"] and repo.sessions[-1][1]["status"] != "connected"
    assert "o1" not in FORCE_RELOGIN  # the re-login worked: the mark is gone, the next tick sees the session as it is


def test_the_mark_stays_while_the_relogin_is_refused_and_goes_without_relogin(tmp_path):
    FORCE_RELOGIN.clear()
    FORCE_RELOGIN["o1"] = time.monotonic()
    sync_sessions(cfg(tmp_path), SessRepo([row()]), launch=lambda a: None, inspect=lambda p: LOGGED_IN, relogin=lambda o, p: "pending")
    assert "o1" in FORCE_RELOGIN  # a try still on its way: the mark stays
    sync_sessions(cfg(tmp_path), SessRepo([row()]), launch=lambda a: None, inspect=lambda p: LOGGED_IN, relogin=lambda o, p: "cap")
    assert "o1" not in FORCE_RELOGIN  # refused for a while: the tab decides again (a hand login is seen at once)
    FORCE_RELOGIN["o1"] = time.monotonic()
    sync_sessions(cfg(tmp_path), SessRepo([row()]), launch=lambda a: None, inspect=lambda p: LOGGED_IN, relogin=None)
    assert "o1" not in FORCE_RELOGIN
    FORCE_RELOGIN.clear()


# ---------- going on: photos ----------

RESUMED = {"merimen_caseid": "1", "resumed_after_logout": True}
TEN = rows(*[(i, f"{i}.jpg", f"Part {i}", None) for i in range(1, 11)])


def test_prefix_done_only_for_an_exact_start():
    plan = [{"name": f"Part {i}"} for i in range(1, 6)]
    assert ps.prefix_done(["Part 1", "Part 2"], plan) == 2
    assert ps.prefix_done([], plan) == 0 and ps.prefix_done(None, plan) == 0
    assert ps.prefix_done(["Part 1", "Part 3"], plan) == 0  # a gap: not a clean start
    assert ps.prefix_done([f"Part {i}" for i in range(1, 6)], plan) == 0  # all there: nothing to resume
    assert ps.prefix_done([f"Part {i}" for i in range(1, 7)], plan) == 0  # more than planned


def test_phase_a_uploads_only_the_rest_of_a_cut_off_upload():
    m = Fake(held=["Part 1", "Part 2", "Part 3"])
    rep = ps.phase_a(RESUMED, TEN, writes=True, merimen=m)
    assert rep.ok and rep.upload == 7 and m.writes == ["upload:7:1"]
    assert "cut off" in rep.note
    # never without a logout put-back: photos already in Merimen are skipped as before (they may be someone else's)
    m = Fake(held=["Part 1"])
    rep = ps.phase_a({"merimen_caseid": "1"}, TEN, writes=True, merimen=m)
    assert rep.action == "none" and m.writes == []


def test_phase_a_still_skips_photos_that_are_not_its_start():
    m = Fake(held=["Something", "Else", "Here"])
    rep = ps.phase_a({"merimen_caseid": "1"}, TEN, writes=True, merimen=m)
    assert rep.action == "none" and m.writes == []


def test_phase_b_uploads_only_the_rest_of_a_cut_off_final_upload():
    final = rows(*[(i, f"{i}.jpg", f"Part {i}", f"Final {i}") for i in range(1, 6)])
    m = Fake(held=["Final 1", "Final 2"])
    rep = ps.phase_b(RESUMED, final, [], stored_snapshot=snapshot_of(final, []), phase_a_photos=[], writes=True, merimen=m)
    assert rep.ok and rep.upload == 3 and m.writes == ["upload:3:1"]


def test_phase_b_with_photos_that_do_not_line_up_is_still_refused():
    final = rows(*[(i, f"{i}.jpg", f"Part {i}", f"Final {i}") for i in range(1, 6)])
    m = Fake(held=["Final 2", "Final 1"])
    rep = ps.phase_b(RESUMED, final, [], stored_snapshot=snapshot_of(final, []), phase_a_photos=[], writes=True, merimen=m)
    assert not rep.ok and m.writes == []


# ---------- after the job, in the tick ----------

class CountRepo:
    def __init__(self, n=0):
        self.n = n

    def session_lost_count(self, case_id):
        return self.n


class BrokenCount:
    def session_lost_count(self, case_id):
        raise RuntimeError("db")


def test_check_after_the_job(tmp_path):
    FORCE_RELOGIN.clear()
    on = cfg(tmp_path, MERIMEN_RELOGIN="on", MERIMEN_LOGIN="on")
    fail = Outcome("failed", event="Worker error")
    got = loop.check_session_after(on, CountRepo(), JOB, fail, inspect=lambda p: LOGIN_PAGE, page_for=None)
    assert got.session_lost and "o1" in FORCE_RELOGIN  # logged out: put back, the org marked for a re-login
    FORCE_RELOGIN.clear()
    # still logged in: a real failure stays a failure
    assert loop.check_session_after(on, CountRepo(), JOB, fail, inspect=lambda p: LOGGED_IN, page_for=None) is fail
    # a job that finished, or a step that is not a Merimen one, is never looked at
    done = Outcome("done")
    assert loop.check_session_after(on, CountRepo(), JOB, done, inspect=lambda p: LOGIN_PAGE, page_for=None) is done
    assert loop.check_session_after(on, CountRepo(), {**JOB, "step": "photo_model"}, fail, inspect=lambda p: LOGIN_PAGE, page_for=None) is fail
    # the count could not be read: the outcome is left as it was
    assert loop.check_session_after(on, BrokenCount(), JOB, fail, inspect=lambda p: LOGIN_PAGE, page_for=None) is fail
    # without re-login nobody logs in again: the job keeps its own outcome, nobody is marked
    off = cfg(tmp_path)
    assert loop.check_session_after(off, CountRepo(), JOB, fail, inspect=lambda p: LOGIN_PAGE, page_for=None) is fail
    assert FORCE_RELOGIN == {}
    # re-login switched on but not built (no key, no login page): nobody would log in, so nothing is put back
    assert loop.check_session_after(on, CountRepo(), JOB, fail, inspect=lambda p: LOGIN_PAGE, page_for=None, relogin_ready=False) is fail
    assert FORCE_RELOGIN == {}
    # a wait before the step ran (gate, session, Done not pressed) is not a cut-off job
    for wait in (Outcome("requeue"), Outcome("requeue", event="Waiting for you to log in on the worker Chrome")):
        assert loop.check_session_after(on, CountRepo(), JOB, wait, inspect=lambda p: LOGIN_PAGE, page_for=None) is wait
    assert FORCE_RELOGIN == {}


def test_at_the_cap_a_bare_requeue_still_leaves_the_case_waiting_for_a_person():
    got = session_lost_outcome(JOB, Outcome("requeue", event="Phase B stopped. could not read the photos in Merimen"), count=LOST_CAP)
    assert got.job_state == "failed" and got.error == "session_lost" and got.case_status == "waiting_user"


def test_phase_a_refuses_a_cut_off_upload_with_a_gap():
    m = Fake(held=["Part 1", "Part 3"])
    rep = ps.phase_a({"merimen_caseid": "1", "resumed_after_logout": True}, TEN, writes=True, merimen=m)
    assert not rep.ok and rep.code == "hand_fix" and m.writes == []
    # a name changed while the job waited: still a partial list, still a hand fix
    rep = ps.phase_a(RESUMED, TEN, writes=True, merimen=Fake(held=["Part 1", "Old name"]))
    assert not rep.ok and rep.code == "hand_fix"
    # not after a logout: the owner's rule stands, a case that already has photos is skipped
    rep = ps.phase_a({"merimen_caseid": "1"}, TEN, writes=True, merimen=Fake(held=["Part 1", "Part 3"]))
    assert rep.ok and rep.action == "none"


def test_phase_b_does_not_resume_over_a_short_phase_a_list_with_other_files():
    # Phase A put up X 'Front Bumper', Y 'Rear Bumper' (Z dropped); the final list swaps the names: same captions, other files
    final = rows((1, "y.jpg", "Rear Bumper", "Front Bumper"), (2, "x.jpg", "Front Bumper", "Rear Bumper"), (3, "z.jpg", "Side", "Side"))
    pa = [{"name": "Front Bumper", "src": "x.jpg"}, {"name": "Rear Bumper", "src": "y.jpg"}, {"name": "Side", "src": "z.jpg"}]
    m = Fake(held=["Front Bumper", "Rear Bumper"])
    ps.phase_b(RESUMED, final, [], stored_snapshot=snapshot_of(final, []), phase_a_photos=pa, writes=True, merimen=m)
    assert not any(w.startswith("upload") for w in m.writes)


def test_stops_that_are_not_about_the_session_are_left_alone(tmp_path):
    FORCE_RELOGIN.clear()
    on = cfg(tmp_path, MERIMEN_RELOGIN="on", MERIMEN_LOGIN="on")
    for own in (Outcome("failed", case_status="pending_doc", pending_doc="documents", error="documents"),
                Outcome("failed", case_status="failed", error="missing client_vehicle.plate"),
                Outcome("failed", error="concurrency_unsafe")):
        assert loop.check_session_after(on, CountRepo(), JOB, own, inspect=lambda p: LOGIN_PAGE, page_for=None) is own
    assert FORCE_RELOGIN == {}


def test_the_mark_runs_out_after_its_time(tmp_path):
    FORCE_RELOGIN.clear()
    FORCE_RELOGIN["o1"] = 0.0
    asked = []
    sync_sessions(cfg(tmp_path), SessRepo([row()]), launch=lambda a: None,
                  inspect=lambda p: LOGGED_IN, now=lambda: loop.FORCE_TTL + 1, relogin=lambda o, p: asked.append(o) or "ok")
    assert asked == [] and "o1" not in FORCE_RELOGIN


def test_prefix_done_refuses_a_start_whose_captions_repeat():
    plan = [{"name": n} for n in ("Front Bumper", "Front Bumper", "Bonnet", "Grille")]
    assert ps.prefix_done(["Front Bumper"], plan) == 0  # which of the two went up is not known
    assert ps.prefix_done(["Front Bumper", "Front Bumper"], plan) == 0
    plan2 = [{"name": n} for n in ("Bonnet", "Grille", "Front Bumper", "Front Bumper")]
    assert ps.prefix_done(["Bonnet", "Grille"], plan2) == 2  # a repeat later in the plan does not matter


def test_phase_b_does_not_resume_over_the_phase_a_list():
    # Phase A uploaded 2 photos; the final list has 3 that start with the same names: never a "cut-off upload" of the third
    final = rows(*[(i, f"{i}.jpg", f"Part {i}", None) for i in range(1, 4)])
    pa = [{"name": "Part 1", "src": "1.jpg"}, {"name": "Part 2", "src": "2.jpg"}]
    m = Fake(held=["Part 1", "Part 2"])
    ps.phase_b(RESUMED, final, [], stored_snapshot=snapshot_of(final, []), phase_a_photos=pa, writes=True, merimen=m)
    assert not any(w.startswith("upload") for w in m.writes)
