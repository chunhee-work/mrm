"""The login check is ONE try. What is put back in the queue (nothing was typed) and what waits for the user (the form may have been sent)."""
import base64
import subprocess
import sys
import textwrap

import pytest

from autopilot_worker import loop
from autopilot_worker.config import Config
from autopilot_worker.crypto import master_key, seal
from autopilot_worker.db import to_numbered
from autopilot_worker.login_flow import read_login_output, run_script, run_verify, script_fetch
from autopilot_worker.login_page import EVENT_BAD, EVENT_UNKNOWN, finish_verify, login_email
from autopilot_worker.loop import tick
from autopilot_worker.store import PgRepo
from test_claim import SEED, needs_pg, run

KEY = master_key(base64.b64encode(b"k" * 32).decode())
OTHER_KEY = master_key(base64.b64encode(b"z" * 32).decode())  # valid, but not the key the login was saved with


def row(org="org-1"):
    return {"org_id": org, **seal(KEY, org, "abuser", "s3cret-pass")}


def never(user, password):
    raise AssertionError("the page must not be asked")


def never_port(user, password, port):
    raise AssertionError("the page must not be asked")


# ---- W-4: the saved login cannot be opened with this worker's key ----

def test_a_different_valid_key_is_released_as_key_mismatch_and_nothing_is_sent():
    d = run_verify(row(), OTHER_KEY, never)
    assert d["release"] is True and d["reason"] == "key_mismatch"
    assert d["blocked"] is False and d["pause"] is False and d["email"] is None and d["event"] == ""
    assert d["verify_state"] == "queued"


def test_a_damaged_row_is_released_too_never_a_wrong_password():
    bad = {**row(), "password_ct": "not base64 !!"}
    d = run_verify(bad, KEY, never)
    assert d["release"] is True and d["reason"] == "key_mismatch" and d["blocked"] is False


# ---- W-1: no login page ----

def test_not_login_page_is_released_without_a_try():
    d = run_verify(row(), KEY, lambda u, p: {"result": "not_login_page", "submitted": False})
    assert d["release"] is True and d["reason"] == "not_login_page"
    assert d["blocked"] is False and d["email"] is None and d["verify_state"] == "queued"


def test_a_logged_in_address_is_never_ok_when_nothing_was_submitted():
    url = "https://www.merimen.com.my/claims/index.cfm?CFID=1&RID=2"
    d = run_verify(row(), KEY, lambda u, p: {"result": "not_login_page", "submitted": False, "url": url, "has_password": False})
    assert d.get("release") is True and d["verify_state"] != "ok"
    # the same page without any word from the script about a submit: still no conclusion
    bare = run_verify(row(), KEY, lambda u, p: {"url": url, "has_password": False, "text": "Welcome"})
    assert bare.get("release") is True and bare["reason"] == "offline" and bare["verify_state"] != "ok"
    wrong = run_verify(row(), KEY, lambda u, p: {"url": url, "has_password": True, "text": "Invalid User ID or password"})
    assert wrong.get("release") is True and wrong["blocked"] is False


# ---- R1: a person is already logged in on the worker Chrome ----

LIVE = {"result": "session_live", "submitted": False}


def test_session_live_ends_ok_exactly_like_a_login_that_went_through_but_is_marked():
    d = run_verify(row(), KEY, lambda u, p: dict(LIVE))
    assert d == {**finish_verify("success"), "session_live": True}
    assert d["verify_state"] == "ok" and d["blocked"] is False and d["pause"] is False and d["resume"] is True and d["email"] is None
    assert not d.get("release")


@pytest.mark.parametrize("page", [
    {"result": "session_live", "submitted": True},  # contradicts itself
    {"result": "session_live"},  # no word about the submit
])
def test_session_live_is_believed_only_with_submitted_false(page):
    d = run_verify(row(), KEY, lambda u, p: page)
    assert d["verify_state"] != "ok" and not d.get("session_live")


def test_session_live_needs_the_saved_login_to_open_first():
    d = run_verify(row(), OTHER_KEY, lambda u, p: dict(LIVE))
    assert d["release"] is True and d["reason"] == "key_mismatch"


# ---- W-3: after the form was sent nothing is ever put back in the queue ----

@pytest.mark.parametrize("page", [
    {"result": "unknown", "submitted": True},
    {"offline": True, "submitted": True},
    {"result": "not_login_page", "submitted": True},  # contradicts itself: the safe reading is "sent"
    {"submitted": True},  # sent, nothing readable
])
def test_after_submit_a_failure_is_unknown_and_waits_for_the_user(page):
    d = run_verify(row(), KEY, lambda u, p: page)
    assert not d.get("release")
    assert d["verify_state"] == "unknown" and d["blocked"] is True and d["pause"] is True and d["resume"] is False


def test_a_fetch_that_throws_may_have_sent_the_form_so_it_is_unknown():
    def boom(u, p):
        raise RuntimeError("x")

    d = run_verify(row(), KEY, boom)
    assert not d.get("release") and d["verify_state"] == "unknown" and d["blocked"] is True


def test_offline_before_submit_is_released():
    d = run_verify(row(), KEY, lambda u, p: {"offline": True, "submitted": False})
    assert d["release"] is True and d["reason"] == "offline" and d["blocked"] is False


def test_a_read_page_after_submit_is_still_classified():
    bad = run_verify(row(), KEY, lambda u, p: {"submitted": True, "url": "https://www.merimen.com.my/claims/index.cfm", "text": "Invalid User ID or password", "has_password": True, "has_otp": False})
    assert bad["verify_state"] == "bad_credentials" and not bad.get("release")
    ok = run_verify(row(), KEY, lambda u, p: {"submitted": True, "url": "https://www.merimen.com.my/claims/index.cfm?CFID=1&RID=2", "text": "", "has_password": False, "has_otp": False})
    assert ok["verify_state"] == "ok"


def test_unknown_does_not_tell_the_user_the_password_is_wrong():
    d = finish_verify("unknown")
    assert d["event"] == EVENT_UNKNOWN and d["event"] != EVENT_BAD
    assert "rejected" not in d["event"].lower() and "拒绝" not in d["event"]
    assert d["email"] == "unknown"
    subject, html = login_email("unknown")
    assert "rejected" not in html.lower() and "拒绝" not in html and "not try again" in html.lower()
    assert finish_verify("bad_credentials")["event"] == EVENT_BAD and finish_verify("bad_credentials")["email"] == "bad_credentials"


# ---- what the script printed -> what Python believes ----

MARK = '{"submitted":true}\n'


def test_script_output_is_read_line_by_line():
    assert read_login_output('{"offline":true,"submitted":false}\n') == {"offline": True, "submitted": False}
    assert read_login_output('{"result":"not_login_page","submitted":false}\n') == {"result": "not_login_page", "submitted": False}
    # the page changed between the probe and the fill: the mark is there, but the page itself said nothing was typed
    assert read_login_output(MARK + '{"result":"not_login_page","submitted":false}\n') == {"result": "not_login_page", "submitted": False}
    assert read_login_output(MARK + '{"result":"unknown","submitted":true}\n') == {"result": "unknown", "submitted": True}
    page = read_login_output(MARK + '{"submitted":true,"url":"https://www.merimen.com.my/claims/x.cfm?CFID=1&RID=2","text":"hi","has_password":false,"has_otp":false}\n')
    assert page == {"submitted": True, "url": "https://www.merimen.com.my/claims/x.cfm?CFID=1&RID=2", "text": "hi", "has_password": False, "has_otp": False}


def test_session_live_output_is_passed_on_unless_the_mark_was_written():
    assert read_login_output('{"result":"session_live","submitted":false}\n') == {"result": "session_live", "submitted": False}
    assert read_login_output(MARK + '{"result":"session_live","submitted":false}\n') == {"result": "unknown", "submitted": True}
    assert read_login_output(MARK + '{"result":"session_live","submitted":true}\n') == {"result": "unknown", "submitted": True}


def test_a_script_that_stopped_is_offline_before_the_mark_and_unknown_after_it():
    assert read_login_output("") == {"offline": True, "submitted": False}
    assert read_login_output(None) == {"offline": True, "submitted": False}
    assert read_login_output("node: something broke\n") == {"offline": True, "submitted": False}
    assert read_login_output('{"ok":false,"error":"login_off"}\n') == {"offline": True, "submitted": False}
    assert read_login_output(MARK) == {"result": "unknown", "submitted": True}
    assert read_login_output(MARK.encode()) == {"result": "unknown", "submitted": True}  # a time-out hands back bytes
    assert read_login_output(MARK + '{"submitted":true,"url":"https://www.meri') == {"result": "unknown", "submitted": True}  # cut mid-line
    # sent, but the last line is not a page: unknown, never offline
    assert read_login_output(MARK + '{"offline":true}\n') == {"result": "unknown", "submitted": True}
    assert read_login_output(MARK + '{"ok":false,"error":"cdp"}\n') == {"result": "unknown", "submitted": True}


class FakeProc:
    """communicate() times out once; after kill() the second communicate() hands back everything that was written."""

    def __init__(self, out, unreadable=False):
        self.out, self.unreadable, self.killed, self.calls = out, unreadable, False, []

    def communicate(self, payload=None, timeout=None):
        self.calls.append((payload, timeout))
        if not self.killed:
            raise subprocess.TimeoutExpired("node", timeout)
        if self.unreadable:
            raise subprocess.TimeoutExpired("node", timeout)
        return self.out, None

    def kill(self):
        self.killed = True


def _popen(proc, seen):
    def popen(argv, **kw):
        seen.append((argv, kw))
        return proc
    return popen


def test_a_script_time_out_before_submit_is_offline_and_after_submit_is_unknown():
    seen = []
    before = script_fetch("cdp.mjs", popen=_popen(FakeProc(""), seen))("abuser", "s3cret", 9222)
    assert before == {"offline": True, "submitted": False}
    after = script_fetch("cdp.mjs", popen=_popen(FakeProc(MARK), seen))("abuser", "s3cret", 9333)
    assert after == {"result": "unknown", "submitted": True}
    argv, kw = seen[0]
    assert argv[-1] == "login" and "s3cret" not in " ".join(argv)  # the password goes in on stdin, never on the command line
    assert kw["env"]["CDP_PORT"] == "9222" and seen[1][1]["env"]["CDP_PORT"] == "9333"
    assert len(seen) == 2  # one run per check: a time-out is not followed by a second run


def test_the_mark_written_just_before_the_deadline_is_read_after_the_kill():
    proc = FakeProc(MARK)
    out, timed_out = run_script(["node", "cdp.mjs", "login"], "{}", {}, 5, popen=_popen(proc, []))
    assert (out, timed_out) == (MARK, True)
    assert proc.killed and len(proc.calls) == 2 and proc.calls[0] == ("{}", 5)


def test_a_timed_out_script_whose_output_cannot_be_read_is_unknown_never_released():
    proc = FakeProc("", unreadable=True)
    assert run_script(["node"], "{}", {}, 5, popen=_popen(proc, [])) == (None, True)
    page = script_fetch("cdp.mjs", popen=_popen(FakeProc("", unreadable=True), []))("abuser", "s3cret", 9222)
    assert page == {"result": "unknown", "submitted": True}
    d = run_verify(row(), KEY, lambda u, p: page)
    assert not d.get("release") and d["verify_state"] == "unknown"


def _script(tmp_path, body):
    path = tmp_path / "fake_login.py"
    path.write_text(textwrap.dedent(body))
    return str(path)


def test_a_real_process_that_hangs_after_the_mark_is_killed_and_its_mark_is_kept(tmp_path):
    script = _script(tmp_path, """
        import sys, time
        sys.stdin.read()
        sys.stdout.write('{"submitted": true}\\n'); sys.stdout.flush()
        time.sleep(60)
    """)
    page = script_fetch(script, timeout=1.5, node=sys.executable)("abuser", "s3cret", 9222)
    assert page == {"result": "unknown", "submitted": True}


def test_a_real_process_that_hangs_before_the_mark_is_offline(tmp_path):
    script = _script(tmp_path, """
        import sys, time
        sys.stdin.read()
        time.sleep(60)
    """)
    page = script_fetch(script, timeout=1.5, node=sys.executable)("abuser", "s3cret", 9222)
    assert page == {"offline": True, "submitted": False}


def test_a_real_process_that_ends_in_time_is_read_whole(tmp_path):
    script = _script(tmp_path, """
        import json, os, sys
        cred = json.loads(sys.stdin.read())
        assert cred == {"username": "abuser", "password": "s3cret"} and sys.argv[1] == "login"
        print(json.dumps({"result": "session_live", "submitted": False, "port": os.environ["CDP_PORT"]}))
    """)
    assert script_fetch(script, node=sys.executable)("abuser", "s3cret", 9444) == {"result": "session_live", "submitted": False}


def test_node_that_cannot_start_is_offline():
    def missing(argv, **kw):
        raise FileNotFoundError("node")

    assert script_fetch("cdp.mjs", popen=missing)("abuser", "s3cret", 9222) == {"offline": True, "submitted": False}


# ---- the loop: a released check is not asked again every 2 seconds, and its reason is written down once ----

class VerifyRepo:
    """Only what tick() needs up to the claim; no job is ever claimable."""

    def __init__(self, rows):
        self.rows, self.claims, self.finished = list(rows), [], []

    def heartbeat(self, *a, **k): pass
    def reclaim_stale(self, *a): return 0
    def wanted(self): return []
    def followup_cases(self): return []
    def claim(self, **k): return None
    def owner_email(self, org): return "owner@example.test"

    def claim_verify(self, skip=()):
        self.claims.append(tuple(skip))
        for r in self.rows:
            if r["org_id"] not in skip:
                return r
        return None

    def finish_verify(self, org, decision, email_to=None, poster=None):
        self.finished.append((org, decision, email_to))


def _tick(repo, fetch, master=KEY, clock=None, env=None):
    loop._last_cleanup[0] = 1e12
    cfg = Config.from_env({"MERIMEN_LOGIN": "on", **(env or {})})
    kw = {"now": clock} if clock else {}
    tick(cfg, repo, launch=lambda a: None, inspect=lambda p: None, namer=None, driver=None, download=lambda *a: None, fetch_page=fetch, master=master, **kw)


def test_a_released_check_waits_before_it_is_asked_again_and_other_orgs_are_not_held_up():
    loop._verify_wait.clear()
    t = [1000.0]
    seen = []

    def fetch(u, p, port):
        seen.append(u)
        return {"result": "not_login_page", "submitted": False}

    repo = VerifyRepo([row("org-1")])
    _tick(repo, fetch, clock=lambda: t[0])
    assert len(seen) == 1 and repo.finished[0][1]["release"] is True
    _tick(repo, fetch, clock=lambda: t[0])  # the next tick, same moment: org-1 is skipped, the script does not run
    assert len(seen) == 1 and repo.claims[-1] == ("org-1",)
    repo.rows.append(row("org-2"))
    _tick(repo, fetch, clock=lambda: t[0])  # another org's check is still taken
    assert len(seen) == 2 and repo.finished[-1][0] == "org-2"
    t[0] += 61  # the wait is never longer than a minute
    _tick(repo, fetch, clock=lambda: t[0])
    assert len(seen) == 3 and repo.finished[-1][0] == "org-1"


def test_the_wait_grows_and_stops_at_one_minute():
    loop._verify_wait.clear()
    t = [0.0]
    repo = VerifyRepo([row("org-1")])
    waits = []
    for _ in range(8):
        _tick(repo, lambda u, p, port: {"offline": True, "submitted": False}, clock=lambda: t[0])
        waits.append(loop._verify_wait["org-1"]["until"] - t[0])
        t[0] = loop._verify_wait["org-1"]["until"]
    assert waits == [2, 4, 8, 16, 32, 60, 60, 60]


def test_key_mismatch_is_written_to_the_audit_once_not_every_tick_and_no_mail_is_sent():
    loop._verify_wait.clear()
    t = [0.0]
    repo = VerifyRepo([row("org-1")])
    for _ in range(3):
        _tick(repo, never_port, master=OTHER_KEY, clock=lambda: t[0])
        t[0] += 120
    assert len(repo.finished) == 3
    assert [d.get("audit") for _, d, _ in repo.finished] == ["key_mismatch", None, None]
    assert all(d["release"] and d["reason"] == "key_mismatch" and mail is None for _, d, mail in repo.finished)


def test_an_unknown_result_is_not_released_and_the_wait_is_forgotten():
    loop._verify_wait.clear()
    repo = VerifyRepo([row("org-1")])
    _tick(repo, lambda u, p, port: {"offline": True, "submitted": False}, clock=lambda: 0.0)
    assert "org-1" in loop._verify_wait
    _tick(repo, lambda u, p, port: {"result": "unknown", "submitted": True}, clock=lambda: 500.0)
    org, d, mail = repo.finished[-1]
    assert not d.get("release") and d["verify_state"] == "unknown" and mail == "owner@example.test"
    assert "org-1" not in loop._verify_wait


# ---- the statements ----

class Rec:
    def __init__(self, rows=None):
        self.calls, self.batches, self.rows = [], [], rows or []

    def execute(self, sql, params=()):
        self.calls.append((sql, params))
        return self.rows

    def batch(self, statements):
        self.batches.append(list(statements))
        return []


def test_a_release_is_its_own_statement_and_the_audit_row_comes_after_it():
    rec = Rec()
    PgRepo("", db=rec).finish_verify("o1", {"release": True, "reason": "key_mismatch", "audit": "key_mismatch"})
    assert rec.batches == [] and len(rec.calls) == 2
    assert "verify_state = 'queued'" in rec.calls[0][0] and "login_attempts = 0" in rec.calls[0][0] and rec.calls[0][1] == ("o1",)
    assert "merimen_cred_audit" in rec.calls[1][0] and rec.calls[1][1] == ("o1", "login_released_key_mismatch")
    plain = Rec()
    PgRepo("", db=plain).finish_verify("o1", {"release": True, "reason": "offline"})
    assert len(plain.calls) == 1 and plain.batches == []


class NoAuditGrant(Rec):
    """The worker role may not insert into merimen_cred_audit: every other statement works."""

    def execute(self, sql, params=()):
        if "merimen_cred_audit" in sql:
            from autopilot_worker.db import DbError
            raise DbError("permission denied for table merimen_cred_audit", "42501")
        return super().execute(sql, params)


def test_a_refused_audit_row_does_not_undo_the_release_or_the_session_live_state(capsys):
    rec = NoAuditGrant()
    repo = PgRepo("", db=rec)
    repo.finish_verify("o1", {"release": True, "reason": "offline", "audit": "offline"})
    assert len(rec.calls) == 1 and "verify_state = 'queued'" in rec.calls[0][0]  # the release went out, alone, before the audit
    repo.finish_verify("o1", {**finish_verify("success"), "session_live": True})
    assert len(rec.batches) == 1
    err = capsys.readouterr().err
    assert err.count("login audit row skipped: DbError") == 2 and "permission denied" not in err and "o1" not in err


def test_session_live_gives_the_try_back_and_its_audit_row_is_not_part_of_the_state_change():
    rec = Rec()
    PgRepo("", db=rec).finish_verify("o1", {**finish_verify("success"), "session_live": True})
    batch = rec.batches[0]
    assert "login_attempts = 0" in batch[0][0] and batch[0][1] == ("ok", False, "o1")
    assert not any("merimen_cred_audit" in sql for sql, _ in batch)  # no login_ok row: the password was not tested
    assert any("state = 'queued'" in sql and "'paused'" in sql for sql, _ in batch)  # paused work goes on, as after a real login
    assert [c[1] for c in rec.calls] == [("o1", "login_session_live")]
    # a login that really went through is unchanged: the try stays counted and login_ok is written with the state
    real = Rec()
    PgRepo("", db=real).finish_verify("o1", finish_verify("success"))
    assert "login_attempts" not in real.batches[0][0][0] and real.batches[0][1][1] == ("o1", "login_ok") and real.calls == []


CRED = ("INSERT INTO merimen_credentials (org_id, username_hint, wrapped_dek, dek_nonce, username_ct, username_nonce, password_ct, password_nonce, verify_state, login_attempts, updated_at) "
        "VALUES ('o1','u','a','b','c','d','e','f','queued',0, now() - interval '2 minutes'), ('o2','u','a','b','c','d','e','f','queued',0, now() - interval '1 minute')")


@needs_pg
def test_claim_verify_skips_the_waiting_orgs_and_a_release_runs_on_postgres():
    rec = Rec()
    repo = PgRepo("", db=rec)
    repo.claim_verify()
    repo.claim_verify(skip=["o1"])
    repo.claim_verify(skip=["o1", "o2"])
    repo.finish_verify("o1", {"release": True, "reason": "key_mismatch", "audit": "key_mismatch"})
    calls = [dict(zip(("sql", "params"), to_numbered(*c))) for c in rec.calls]
    claims, release = calls[:3], calls[3:]
    assert len(release) == 2
    r = run([claims[1], claims[2], claims[0], *release,
             {"sql": "SELECT org_id, verify_state, login_attempts, blocked FROM merimen_credentials ORDER BY org_id"},
             {"sql": "SELECT org_id, action FROM merimen_cred_audit"}], seed=SEED[:1] + [CRED])
    assert [x[0] for x in r[0]] == ["o2"]  # o1 is older but waiting: o2 is taken
    assert r[1] == []  # both waiting: nothing
    assert [x[0] for x in r[2]] == ["o1"]  # nobody waiting: the oldest
    assert r[-2] == [["o1", "queued", 0, False], ["o2", "checking", 1, False]]
    assert r[-1] == [["o1", "login_released_key_mismatch"]]


@needs_pg
def test_session_live_on_postgres_ends_ok_with_no_try_counted_and_resumes_paused_work():
    rec = Rec()
    PgRepo("", db=rec).finish_verify("o1", {**finish_verify("success"), "session_live": True})
    steps = [dict(zip(("sql", "params"), to_numbered(*st))) for st in rec.batches[0]] + [dict(zip(("sql", "params"), to_numbered(*c))) for c in rec.calls]
    seed = SEED[:2] + [
        "INSERT INTO merimen_credentials (org_id, username_hint, wrapped_dek, dek_nonce, username_ct, username_nonce, password_ct, password_nonce, verify_state, login_attempts) "
        "VALUES ('o1','u','a','b','c','d','e','f','checking',1)",
        "INSERT INTO jobs (id, case_id, step, state) VALUES (101,'c2','phase_a','paused')",
    ]
    r = run([*steps,
             {"sql": "SELECT verify_state, login_attempts, blocked FROM merimen_credentials WHERE org_id = 'o1'"},
             {"sql": "SELECT action FROM merimen_cred_audit WHERE org_id = 'o1'"},
             {"sql": "SELECT state FROM jobs WHERE id = 101"}], seed=seed)
    assert r[-3] == [["ok", 0, False]]
    assert r[-2] == [["login_session_live"]]
    assert r[-1] == [["queued"]]


# ---- R3: the check runs on the Chrome of the org's own account ----

def test_the_org_s_own_port_is_used_and_one_account_behaves_as_before():
    loop._verify_wait.clear()
    ports = []

    def fetch(u, p, port):
        ports.append(port)
        return {"result": "session_live", "submitted": False}

    _tick(VerifyRepo([row("org-1")]), fetch)  # nothing configured: the one default profile on 9222
    two = {"WORKER_ACCOUNTS": "a:9222,b:9333", "WORKER_ORG_ACCOUNTS": "org-1:b,org-2:a"}
    _tick(VerifyRepo([row("org-1")]), fetch, env=two)
    _tick(VerifyRepo([row("org-2")]), fetch, env=two)
    assert ports == [9222, 9333, 9222]


def test_an_org_with_no_account_is_put_back_and_nothing_is_typed_anywhere():
    loop._verify_wait.clear()
    repo = VerifyRepo([row("org-9")])
    _tick(repo, never_port, env={"WORKER_ACCOUNTS": "a:9222,b:9333", "WORKER_ORG_ACCOUNTS": "org-1:b"}, clock=lambda: 0.0)
    org, d, mail = repo.finished[0]
    assert d["release"] is True and d["reason"] == "no_account" and d["audit"] == "no_account" and d["blocked"] is False and mail is None
    assert "org-9" in loop._verify_wait


def test_session_live_in_the_loop_is_finished_as_ok_without_mail_and_without_a_wait():
    loop._verify_wait.clear()
    repo = VerifyRepo([row("org-1")])
    _tick(repo, lambda u, p, port: {"result": "session_live", "submitted": False})
    org, d, mail = repo.finished[0]
    assert d["verify_state"] == "ok" and d["session_live"] is True and not d.get("release") and mail is None
    assert "org-1" not in loop._verify_wait
