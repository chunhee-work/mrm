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
from test_photo_sync import THREE, Fake, rows

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
    last = Rec2()
    PgRepo("", db=last).was_put_back(JOB)
    PgRepo("", db=last).was_put_back({**JOB, "step": "phase_a"})
    PgRepo("", db=last).was_put_back({**JOB, "id": 101})
    q = [dict(zip(("sql", "params"), to_numbered(*c))) for c in last.calls]
    r0 = run([*steps, {"sql": "INSERT INTO case_events (case_id, step, message) VALUES ('c1','phase_b','Phase B dry-run failed.')"},
              {"sql": "INSERT INTO jobs (id, case_id, step, state, created_at) VALUES (101,'c1','phase_b','queued', now() + interval '1 hour')"},
              *q], seed=seed)
    n0 = len(steps) + 2
    # this job was put back (a retry since does not end it); another step was not; a later job of the step is a new run
    assert r0[n0] == [[True]] and r0[n0 + 1] == [[False]] and r0[n0 + 2] == [[False]]
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
    for got in ("cap", "streak", "cooldown", "put_back"):
        # refused or put back: the mark stays, so the stale tab never counts as connected (that would end a failed streak)
        repo = SessRepo([row()])
        sync_sessions(cfg(tmp_path), repo, launch=lambda a: None, inspect=lambda p: LOGGED_IN, relogin=lambda o, p, g=got: g)
        assert "o1" in FORCE_RELOGIN and repo.seen == [] and repo.sessions[-1][1]["status"] != "connected"
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


def test_phase_b_never_guesses_a_partial_list_even_after_a_put_back():
    # Phase B photo writes are matched only as before (captions alone do not say which photo went up)
    final = rows(*[(i, f"{i}.jpg", f"Part {i}", f"Final {i}") for i in range(1, 6)])
    m = Fake(held=["Final 1", "Final 2"])
    rep = ps.phase_b(RESUMED, final, [], stored_snapshot=snapshot_of(final, []), phase_a_photos=[], writes=True, merimen=m)
    assert not rep.ok and m.writes == []


def test_a_login_form_a_step_found_counts_although_the_old_tab_looks_fine(tmp_path):
    FORCE_RELOGIN.clear()
    on = cfg(tmp_path, MERIMEN_RELOGIN="on", MERIMEN_LOGIN="on")
    retry = Outcome("requeue", error="report", event="Phase A not saved")
    got = loop.check_session_after(on, CountRepo(), {**JOB, "step": "phase_a"}, retry, inspect=lambda p: LOGGED_IN, page_for=None, seen_login=True)
    assert got.session_lost and "o1" in FORCE_RELOGIN
    FORCE_RELOGIN.clear()
    # a Phase A upload cut off by the login form: put back; the same photo stop without the login form stays a hand fix
    cut = Outcome("failed", case_status="waiting_user", error="photos", event="Phase A stopped. The photo step failed (not_logged_in). Check")
    hand = Outcome("failed", case_status="waiting_user", error="photos", event="Phase A stopped. Merimen has 21 photos")
    assert loop.check_session_after(on, CountRepo(), {**JOB, "step": "phase_a"}, hand, inspect=lambda p: LOGIN_PAGE, page_for=None, seen_login=True) is hand
    pa = {**JOB, "step": "phase_a"}
    assert loop.check_session_after(on, CountRepo(), pa, cut, inspect=lambda p: LOGGED_IN, page_for=None, seen_login=True).session_lost
    FORCE_RELOGIN.clear()
    assert loop.check_session_after(on, CountRepo(), pa, cut, inspect=lambda p: LOGIN_PAGE, page_for=None) is cut
    # stops meant for a person stay stops, whatever the session
    for own in (Outcome("failed", case_status="waiting_user", error="step2", event="Phase B stopped. x"),
                Outcome("failed", case_status="waiting_user", error="checks", event="Phase B: x"),
                Outcome("failed", case_status="waiting_user", error="estimate", event="Phase B not saved. x")):
        assert loop.check_session_after(on, CountRepo(), JOB, own, inspect=lambda p: LOGIN_PAGE, page_for=None, seen_login=True) is own
    assert FORCE_RELOGIN == {}


def test_a_phase_b_photo_write_that_broke_stays_a_hand_fix(tmp_path):
    on = cfg(tmp_path, MERIMEN_RELOGIN="on", MERIMEN_LOGIN="on")
    own = Outcome("failed", case_status="waiting_user", error="photos", event="Phase B stopped. The photo step failed (x).")
    assert loop.check_session_after(on, CountRepo(), JOB, own, inspect=lambda p: LOGIN_PAGE, page_for=None, seen_login=True) is own
    assert FORCE_RELOGIN == {}


def test_an_upload_whose_check_meets_the_login_form_is_a_logout_stop():
    import pytest
    from autopilot_worker import login_seen

    unread = lambda plan: {"count": -1, "mismatch": len(plan), "missing": []}  # noqa: E731
    login_seen.reset()
    rep = ps.phase_a({"merimen_caseid": "1"}, TEN, writes=True, merimen=Fake(held=[], verify=unread))
    assert not rep.ok and rep.code == "hand_fix"  # no login form seen: the old hand-fix stop
    login_seen.mark()
    with pytest.raises(login_seen.LoggedOut):  # the pipeline makes this "The photo step failed (not_logged_in)"
        ps.phase_a({"merimen_caseid": "1"}, TEN, writes=True, merimen=Fake(held=[], verify=unread))
    login_seen.reset()


def test_a_refused_relogin_holds_further_put_backs(tmp_path):
    FORCE_RELOGIN.clear()
    loop.RELOGIN_HELD.clear()
    FORCE_RELOGIN["o1"] = time.monotonic()
    sync_sessions(cfg(tmp_path), SessRepo([row()]), launch=lambda a: None, inspect=lambda p: LOGGED_IN, relogin=lambda o, p: "streak")
    assert "o1" in loop.RELOGIN_HELD
    on = cfg(tmp_path, MERIMEN_RELOGIN="on", MERIMEN_LOGIN="on")
    retry = Outcome("requeue", error="report", event="Phase A not saved")
    # the stale tab may count as connected later: the job keeps its own tries, no new forced re-login is booked
    assert loop.check_session_after(on, CountRepo(), JOB, retry, inspect=lambda p: LOGIN_PAGE, page_for=None, seen_login=True) is retry
    sync_sessions(cfg(tmp_path), SessRepo([row()]), launch=lambda a: None, inspect=lambda p: LOGGED_IN, relogin=lambda o, p: "ok")
    assert "o1" not in loop.RELOGIN_HELD  # a re-login that worked lifts the hold
    FORCE_RELOGIN.clear()
    loop.RELOGIN_HELD.clear()


def test_at_the_cap_the_job_fails_but_a_relogin_is_still_booked(tmp_path):
    FORCE_RELOGIN.clear()
    on = cfg(tmp_path, MERIMEN_RELOGIN="on", MERIMEN_LOGIN="on")
    retry = Outcome("requeue", error="report", event="Phase A not saved")
    got = loop.check_session_after(on, CountRepo(LOST_CAP), JOB, retry, inspect=lambda p: LOGIN_PAGE, page_for=None)
    assert got.job_state == "failed" and "o1" in FORCE_RELOGIN
    FORCE_RELOGIN.clear()


def test_a_resumed_phase_a_that_finds_all_its_photos_logs_them_as_its_upload():
    names = [f"Part {i}" for i in range(1, 11)]
    rep = ps.phase_a(RESUMED, TEN, writes=True, merimen=Fake(held=names))
    assert rep.ok and rep.action == "upload" and rep.upload == 0 and rep.row()["action"] == "upload"
    rep = ps.phase_a({"merimen_caseid": "1"}, TEN, writes=True, merimen=Fake(held=names))
    assert rep.action == "none"  # not after a put-back: as before


def test_the_hold_runs_out():
    loop.RELOGIN_HELD["o1"] = 100.0
    assert loop.held("o1", lambda: 100.0 + loop.HOLD_SECONDS - 1)
    assert not loop.held("o1", lambda: 100.0 + loop.HOLD_SECONDS)
    assert not loop.held("o2", lambda: 0.0)


def test_the_put_back_line_keeps_what_the_job_said():
    got = session_lost_outcome(JOB, Outcome("requeue", error="step2", event="Phase B stopped. the Merimen catalogue could not be read"), count=0)
    assert got.event.startswith(loop.LOST_EVENT) and "catalogue could not be read" in got.event


def test_the_put_back_line_drops_the_hand_fix_advice():
    ev = "Phase A stopped. The photo step failed (not_logged_in). Check the photo list in Merimen by hand before anything is run again."
    got = session_lost_outcome({**JOB, "step": "phase_a"}, Outcome("failed", error="photos", event=ev), count=0)
    assert "(not_logged_in)" in got.event and "by hand" not in got.event


def test_login_seen_marks_and_resets():
    from autopilot_worker import login_seen

    login_seen.reset()
    assert not login_seen.seen()
    login_seen.mark()
    assert login_seen.seen()
    login_seen.reset()
    assert not login_seen.seen()


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
    fail = Outcome("failed", error="worker error", event="Worker error")
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
    # no re-login cleared it in time: the org is held, so a stale tab that now counts as connected never books forced tries
    assert loop.held("o1", now=lambda: loop.FORCE_TTL + 2)
    loop.RELOGIN_HELD.clear()


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


# ---------- review round 11 ----------

class HeldRepo:
    """A put-back Phase A job that runs again while its org is held (or re-login is off): the case must still be told."""
    def __init__(self):
        self.case, self.applied = None, []

    def heartbeat(self, *a, **k): pass
    def reclaim_stale(self, *a): return 0
    def ensure_sessions(self): pass
    def wanted(self): return []
    def followup_cases(self): return []
    def claim(self, **k): return {"id": 7, "case_id": "c1", "step": "phase_a", "attempts": 1, "org_id": "o1"}
    def gate(self, org, env_on): return "off"
    def session_status(self, org): return "idle"
    def was_put_back(self, job): return True
    def apply(self, job, outcome): self.applied.append(outcome)

    def load(self, case_id):
        self.case = {"id": "c1", "org_id": "o1", "status": "phase_a", "plate": "A1", "case_data": {}, "photos": [], "files": []}
        return self.case


def test_a_put_back_job_is_told_so_also_while_its_org_is_held(tmp_path):
    from autopilot_worker.pipeline import Driver

    loop._last_cleanup[0] = 1e12
    loop.RELOGIN_HELD["o1"] = time.monotonic()
    try:
        repo = HeldRepo()
        loop.tick(cfg(tmp_path, MERIMEN_RELOGIN="on", MERIMEN_LOGIN="on"), repo, launch=lambda a: None, inspect=lambda p: None,
                  namer=None, driver=Driver(), download=lambda *a: None)
        # a partial photo list or document set then stops for a person instead of counting as "already in Merimen"
        assert repo.case["resumed_after_logout"] is True
    finally:
        loop.RELOGIN_HELD.clear()


def test_the_relogin_tab_survives_a_worker_restart(tmp_path):
    from autopilot_worker import relogin

    relogin.reset()
    relogin._own_tab["o1"] = "T9"
    relogin.save_own_tabs(str(tmp_path))
    relogin.reset()
    relogin.load_own_tabs(str(tmp_path))
    assert relogin._own_tab == {"o1": "T9"}
    (tmp_path / relogin.OWN_TABS_FILE).write_text("not json")
    relogin.reset()
    relogin.load_own_tabs(str(tmp_path))  # a broken file = none known, never a crash
    assert relogin._own_tab == {}
    relogin.load_own_tabs(None)


# ---------- review round 12 ----------

def test_a_later_run_of_the_same_job_is_strict_without_a_put_back_event(tmp_path):
    """The worker was killed half way (no put-back event): the second run of the job still never takes a partial list as done."""
    from autopilot_worker.pipeline import Driver

    loop._last_cleanup[0] = 1e12

    class Again(HeldRepo):
        def claim(self, **k): return {"id": 7, "case_id": "c1", "step": "phase_a", "attempts": 2, "org_id": "o1"}
        def was_put_back(self, job): return False

    repo = Again()
    loop.tick(cfg(tmp_path), repo, launch=lambda a: None, inspect=lambda p: None, namer=None, driver=Driver(), download=lambda *a: None)
    assert repo.case["resumed_after_logout"] is True
    first = HeldRepo()
    first.was_put_back = lambda job: False
    loop.tick(cfg(tmp_path), first, launch=lambda a: None, inspect=lambda p: None, namer=None, driver=Driver(), download=lambda *a: None)
    assert first.case["resumed_after_logout"] is False  # the first run keeps the old rule (a case with photos is skipped)


def test_a_hidden_password_field_is_no_logout():
    from autopilot_worker import login_seen

    class Loc:
        def __init__(self, shown): self.shown = shown
        @property
        def first(self): return self
        def is_visible(self): return self.shown

    class Pg:
        def __init__(self, shown): self.shown = shown
        def locator(self, sel): return Loc(self.shown)

    login_seen.reset()
    login_seen.mark_if_shown(Pg(False))
    assert not login_seen.seen()
    login_seen.mark_if_shown(Pg(True))
    assert login_seen.seen()
    login_seen.reset()
    login_seen.mark_if_shown(object())  # cannot be asked: counts as shown, as before
    assert login_seen.seen()
    login_seen.reset()


def test_the_operator_lines_are_fixed_words_once_an_hour(capsys):
    loop._noted.clear()
    loop.note("o1", "put_back", now=lambda: 0.0)
    loop.note("o1", "put_back", now=lambda: 10.0)
    loop.note("o1", "put_back", now=lambda: 3601.0)
    err = capsys.readouterr().err
    assert err.count("session_lost: put_back") == 2
    import re

    assert re.fullmatch(r"(session_lost: put_back org=[0-9a-f]{6}\n){2}", err)  # fixed words and a short hash, never the org id
    loop._noted.clear()


# ---------- review round 13 ----------

def test_phase_b_waits_for_a_phase_a_that_finished():
    """A Phase A that stopped for a person (documents cut off, the cap) leaves the case waiting_user: Done must not start Phase B."""
    from autopilot_worker.pipeline import followup_steps

    case = {"status": "waiting_user", "photos_done_at": "x", "done_epoch": 100, "photos_snapshot": "s"}
    a = lambda state, t: {"step": "phase_a", "state": state, "created_epoch": t}  # noqa: E731
    assert followup_steps({**case, "error": "docs"}, [a("failed", 50)], writes=True) == []
    assert followup_steps({**case, "error": "session_lost"}, [a("done", 40), a("failed", 50)], writes=True) == []  # the newest counts
    assert followup_steps(case, [a("failed", 40), a("done", 50)], writes=True) == ["phase_b"]
    assert followup_steps(case, [a("failed", 40), a("queued", 50)], writes=True) == []  # a Phase A queued again: after it
    assert followup_steps({**case, "error": "photos"}, [a("failed", 50)], writes=True) == ["phase_b"]  # photos only: Phase B fixes them
    # that Phase B stopped on its checks (cases.error now "checks"); Undo + Done again after the fix: a new Phase B all the same
    b = {"step": "phase_b", "state": "failed", "created_epoch": 60}
    assert followup_steps({**case, "error": "checks", "done_epoch": 70}, [a("failed", 50), b], writes=True) == ["phase_b"]
    assert followup_steps(case, [], writes=True) == ["phase_b"]  # no Phase A job here (made before the worker): as before


def test_an_org_logged_out_again_and_again_is_held_and_waits(tmp_path):
    on = cfg(tmp_path, MERIMEN_RELOGIN="on", MERIMEN_LOGIN="on")
    retry = Outcome("requeue", error="report", event="Phase A not saved")
    t = [1000.0]
    for i in range(loop.ORG_CAP):  # ORG_CAP cases, one put-back each, inside the window (separate logouts, minutes apart)
        got = loop.check_session_after(on, CountRepo(), {**JOB, "case_id": f"c{i}"}, retry, inspect=lambda p: LOGIN_PAGE,
                                       page_for=None, seen_login=True, now=lambda: t[0])
        assert got.session_lost
        t[0] += loop.SAME_LOGOUT + 1
    got = loop.check_session_after(on, CountRepo(), {**JOB, "case_id": "c9"}, retry, inspect=lambda p: LOGIN_PAGE, page_for=None,
                                   seen_login=True, now=lambda: t[0])
    assert got is retry and loop.held("o1", now=lambda: t[0])  # the 5th logout in 3 h is not put back: the org is held
    asked = []
    repo = SessRepo([row("connected")])
    sync_sessions(cfg(tmp_path, MERIMEN_RELOGIN="on", MERIMEN_LOGIN="on"), repo, launch=lambda a: None, inspect=lambda p: LOGGED_IN,
                  now=lambda: t[0], relogin=lambda o, p: asked.append(o) or "ok")
    # the stale address is not believed: not connected, and the org cap books no login at all
    assert asked == [] and repo.sessions[-1][1]["detail"] == "relogin_held" and repo.sessions[-1][1]["status"] != "connected"


def test_a_held_org_that_is_logged_out_books_the_usual_relogin(tmp_path):
    on = cfg(tmp_path, MERIMEN_RELOGIN="on", MERIMEN_LOGIN="on")
    loop._hold("o1", time.monotonic, "held_relogin_streak")
    retry = Outcome("requeue", error="report", event="Phase A not saved")
    assert loop.check_session_after(on, CountRepo(), JOB, retry, inspect=lambda p: LOGIN_PAGE, page_for=None, seen_login=True) is retry
    asked = []
    sync_sessions(on, SessRepo([row("connected")]), launch=lambda a: None, inspect=lambda p: LOGGED_IN,
                  relogin=lambda o, p: asked.append(o) or "ok")
    assert asked == ["o1"] and not loop.held("o1")  # within the DB limits as always; one that works lifts the hold


def test_a_cut_off_start_renamed_on_the_desk_meanwhile_is_resumed_under_the_names_merimen_holds():
    rs = rows((1, "a.jpg", "Front Bumper", None), (2, "b.jpg", "Bonnet", "Bonnet Dent"), (3, "c.jpg", "Grille", None))
    m = Fake(held=["Front Bumper", "Bonnet"])  # uploaded with the model's names; the desk renamed photo 2 while the job waited
    rep = ps.phase_a(RESUMED, rs, writes=True, merimen=m)
    assert rep.action == "upload" and m.writes == ["upload:1:1"]
    assert [p["name"] for p in rep.photos] == ["Front Bumper", "Bonnet", "Grille"]  # logged as Merimen holds it: Phase B relabels
    # a caption that is also another photo's name proves nothing: a person looks
    rs2 = rows((1, "a.jpg", "Bonnet", "Front Bumper"), (2, "b.jpg", "Front Bumper", "Bonnet"), (3, "c.jpg", "Grille", None))
    assert ps.phase_a(RESUMED, rs2, writes=True, merimen=Fake(held=["Bonnet"])).code == "hand_fix"


def test_a_cut_off_start_is_resumed_only_when_a_second_read_gives_the_same_list():
    class Filling(Fake):
        def __init__(self):
            super().__init__(held=["Front Bumper"])
            self.reads = 0

        def labels(self, case):
            self.reads += 1
            return ["Front Bumper"] if self.reads == 1 else ["Front Bumper", "Bonnet", "Grille"]  # the page was still filling

    m = Filling()
    rep = ps.phase_a(RESUMED, THREE, writes=True, merimen=m)
    assert rep.code == "hand_fix" and m.writes == []  # never a second copy of photos already there


# ---------- review round 14 ----------

def test_the_org_cap_books_no_login_even_when_the_address_is_logged_out(tmp_path):
    t = [1000.0]
    loop._hold("o1", lambda: t[0], "held_org_cap")
    loop.HELD_PAUSED.add("o1")
    asked = []
    repo = SessRepo([row("connected")])
    sync_sessions(cfg(tmp_path, MERIMEN_RELOGIN="on", MERIMEN_LOGIN="on"), repo, launch=lambda a: None, inspect=lambda p: LOGIN_PAGE,
                  now=lambda: t[0], relogin=lambda o, p: asked.append(o) or "ok")
    assert asked == [] and repo.sessions[-1][1]["detail"] == "relogin_held"


def test_refusals_while_held_do_not_make_the_hold_longer(tmp_path):
    t = [1000.0]
    loop._hold("o1", lambda: t[0], "held_relogin_orphan")
    loop.HELD_PAUSED.add("o1")
    on = cfg(tmp_path, MERIMEN_RELOGIN="on", MERIMEN_LOGIN="on")
    for t[0] in (2000.0, 3000.0):
        sync_sessions(on, SessRepo([row()]), launch=lambda a: None, inspect=lambda p: LOGIN_PAGE, now=lambda: t[0],
                      relogin=lambda o, p: "orphan")
    assert loop.RELOGIN_HELD["o1"] == 1000.0  # it still ends 6 h after it began
    assert not loop.held("o1", now=lambda: 1000.0 + loop.HOLD_SECONDS + 1)


def test_a_failed_second_read_is_tried_again_not_a_hand_fix():
    class Flaky(Fake):
        def __init__(self):
            super().__init__(held=["Front Bumper"])
            self.reads = 0

        def labels(self, case):
            self.reads += 1
            return ["Front Bumper"] if self.reads == 1 else None

    m = Flaky()
    rep = ps.phase_a(RESUMED, THREE, writes=True, merimen=m)
    assert rep.code == "unreadable" and m.writes == []


def test_a_stale_tab_seen_while_held_does_not_end_a_failed_streak(tmp_path):
    loop._hold("o1", time.monotonic, "held_relogin_streak")
    repo = SessRepo([row("expired")])
    sync_sessions(cfg(tmp_path, MERIMEN_RELOGIN="on", MERIMEN_LOGIN="on"), repo, launch=lambda a: None, inspect=lambda p: LOGGED_IN,
                  relogin=lambda o, p: "ok")
    assert repo.seen == []


# ---------- egm round 8 ----------

def test_a_photo_list_that_stays_unreadable_still_lets_phase_b_follow():
    """Phase A whose photo list could not be read until its tries ran out (or the logout cap) is a photo-only stop: Phase B follows Done."""
    from test_requeue import applied, job
    from autopilot_worker.pipeline import _photo_stop, followup_steps

    class Rep:
        ok, code, photos = False, "unreadable", []

        def line(self):
            return "could not read the photos in Merimen"

        def row(self):
            return None

    out = _photo_stop("A", Rep())
    assert out.job_state == "requeue" and out.error is None and out.stop_error == "photos"
    assert not [1 for s, p in applied(job(3), out) if "UPDATE cases SET" in s]  # a retry still leaves the case alone
    case_update = [p for s, p in applied(job(4), out) if "UPDATE cases SET" in s]
    assert case_update[0][5] == "photos: gave up after 4 tries" and case_update[0][0] == "waiting_user"  # a first Phase A was phase_a
    assert session_lost_outcome({**JOB, "step": "phase_a"}, out, count=LOST_CAP).error == "photos"
    case = {"status": "waiting_user", "photos_done_at": "x", "done_epoch": 100, "photos_snapshot": "s", "error": "photos: gave up after 4 tries"}
    assert followup_steps(case, [{"step": "phase_a", "state": "failed", "created_epoch": 50}], writes=True) == ["phase_b"]


def test_an_empty_second_read_is_tried_again_not_a_hand_fix():
    class Blip(Fake):
        def __init__(self):
            super().__init__(held=["Front Bumper"])
            self.reads = 0

        def labels(self, case):
            self.reads += 1
            return ["Front Bumper"] if self.reads == 1 else []

    m = Blip()
    rep = ps.phase_a(RESUMED, THREE, writes=True, merimen=m)
    assert rep.code == "unreadable" and m.writes == []


def test_jobs_that_find_the_same_logout_side_by_side_count_once_for_the_org_cap(tmp_path):
    """WORKER_SLOTS > 1 (plan #150): several running jobs meet ONE logout within SAME_LOGOUT; that is one logout, not several."""
    on = cfg(tmp_path, MERIMEN_RELOGIN="on", MERIMEN_LOGIN="on", WORKER_SLOTS="3")
    retry = Outcome("requeue", error="report", event="Phase A not saved")
    t = [5000.0]
    for i in range(loop.ORG_CAP + 2):  # more jobs than the cap, all in the same minute
        got = loop.check_session_after(on, CountRepo(), {**JOB, "case_id": f"s{i}"}, retry, inspect=lambda p: LOGIN_PAGE,
                                       page_for=None, seen_login=True, now=lambda: t[0])
        assert got.session_lost  # every one is put back
        t[0] += 5
    assert len(loop.ORG_PUTBACKS["o1"]) == 1 and not loop.held("o1", now=lambda: t[0])


def test_a_second_job_meeting_the_logout_just_counted_never_pushes_the_org_over_the_cap(tmp_path):
    """Codex #156: ORG_CAP - 1 earlier logouts, then two side-by-side jobs meet the next one. The second is that same logout: both
    are put back and the org is not held."""
    on = cfg(tmp_path, MERIMEN_RELOGIN="on", MERIMEN_LOGIN="on", WORKER_SLOTS="2")
    retry = Outcome("requeue", error="report", event="Phase A not saved")
    t = [9000.0]
    loop.ORG_PUTBACKS["o1"] = [t[0] - 3000 + 600 * i for i in range(loop.ORG_CAP - 1)]  # earlier, separate logouts
    for i in range(2):
        got = loop.check_session_after(on, CountRepo(), {**JOB, "case_id": f"q{i}"}, retry, inspect=lambda p: LOGIN_PAGE,
                                       page_for=None, seen_login=True, now=lambda: t[0])
        assert got.session_lost
        t[0] += 5
    assert len(loop.ORG_PUTBACKS["o1"]) == loop.ORG_CAP and not loop.held("o1", now=lambda: t[0])
    loop.ORG_PUTBACKS.clear()
    loop.FORCE_RELOGIN.clear()
    loop.RELOGIN_OK.clear()
