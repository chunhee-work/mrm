"""The login check is ONE try. What is put back in the queue (nothing was typed) and what waits for the user (the form may have been sent)."""
import base64
import subprocess

import pytest

from autopilot_worker import loop
from autopilot_worker.config import Config
from autopilot_worker.crypto import master_key, seal
from autopilot_worker.db import to_numbered
from autopilot_worker.login_flow import read_login_output, run_verify, script_fetch
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


def test_a_script_time_out_before_submit_is_offline_and_after_submit_is_unknown():
    calls = []

    def hang(out):
        def run_(argv, **kw):
            calls.append((argv, kw))
            raise subprocess.TimeoutExpired(argv, kw["timeout"], output=out)
        return run_

    before = script_fetch("cdp.mjs", 9222, run=hang(b""))("abuser", "s3cret")
    assert before == {"offline": True, "submitted": False}
    after = script_fetch("cdp.mjs", 9222, run=hang(MARK.encode()))("abuser", "s3cret")
    assert after == {"result": "unknown", "submitted": True}
    argv, kw = calls[0]
    assert argv[-1] == "login" and "s3cret" not in " ".join(argv)  # the password goes in on stdin, never on the command line
    assert kw["env"]["CDP_PORT"] == "9222" and "s3cret" in kw["input"]
    assert len(calls) == 2  # one run per check: a time-out is not followed by a second run


def test_node_that_cannot_start_is_offline():
    def missing(argv, **kw):
        raise FileNotFoundError("node")

    assert script_fetch("cdp.mjs", 9222, run=missing)("abuser", "s3cret") == {"offline": True, "submitted": False}


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


def _tick(repo, fetch, master=KEY, clock=None):
    loop._last_cleanup[0] = 1e12
    cfg = Config.from_env({"MERIMEN_LOGIN": "on"})
    kw = {"now": clock} if clock else {}
    tick(cfg, repo, launch=lambda a: None, inspect=lambda p: None, namer=None, driver=None, download=lambda *a: None, fetch_page=fetch, master=master, **kw)


def test_a_released_check_waits_before_it_is_asked_again_and_other_orgs_are_not_held_up():
    loop._verify_wait.clear()
    t = [1000.0]
    seen = []

    def fetch(u, p):
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
        _tick(repo, lambda u, p: {"offline": True, "submitted": False}, clock=lambda: t[0])
        waits.append(loop._verify_wait["org-1"]["until"] - t[0])
        t[0] = loop._verify_wait["org-1"]["until"]
    assert waits == [2, 4, 8, 16, 32, 60, 60, 60]


def test_key_mismatch_is_written_to_the_audit_once_not_every_tick_and_no_mail_is_sent():
    loop._verify_wait.clear()
    t = [0.0]
    repo = VerifyRepo([row("org-1")])
    for _ in range(3):
        _tick(repo, never, master=OTHER_KEY, clock=lambda: t[0])
        t[0] += 120
    assert len(repo.finished) == 3
    assert [d.get("audit") for _, d, _ in repo.finished] == ["key_mismatch", None, None]
    assert all(d["release"] and d["reason"] == "key_mismatch" and mail is None for _, d, mail in repo.finished)


def test_an_unknown_result_is_not_released_and_the_wait_is_forgotten():
    loop._verify_wait.clear()
    repo = VerifyRepo([row("org-1")])
    _tick(repo, lambda u, p: {"offline": True, "submitted": False}, clock=lambda: 0.0)
    assert "org-1" in loop._verify_wait
    _tick(repo, lambda u, p: {"result": "unknown", "submitted": True}, clock=lambda: 500.0)
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


def test_a_release_with_a_reason_writes_one_audit_row_in_the_same_transaction():
    rec = Rec()
    PgRepo("", db=rec).finish_verify("o1", {"release": True, "reason": "key_mismatch", "audit": "key_mismatch"})
    assert rec.calls == [] and len(rec.batches) == 1 and len(rec.batches[0]) == 2
    assert rec.batches[0][1][1] == ("o1", "login_released_key_mismatch")
    plain = Rec()
    PgRepo("", db=plain).finish_verify("o1", {"release": True, "reason": "offline"})
    assert len(plain.calls) == 1 and plain.batches == []


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
    claims = [dict(zip(("sql", "params"), to_numbered(*c))) for c in rec.calls]
    release = [dict(zip(("sql", "params"), to_numbered(*s))) for s in rec.batches[0]]
    r = run([claims[1], claims[2], claims[0], *release,
             {"sql": "SELECT org_id, verify_state, login_attempts, blocked FROM merimen_credentials ORDER BY org_id"},
             {"sql": "SELECT org_id, action FROM merimen_cred_audit"}], seed=SEED[:1] + [CRED])
    assert [x[0] for x in r[0]] == ["o2"]  # o1 is older but waiting: o2 is taken
    assert r[1] == []  # both waiting: nothing
    assert [x[0] for x in r[2]] == ["o1"]  # nobody waiting: the oldest
    assert r[-2] == [["o1", "queued", 0, False], ["o2", "checking", 1, False]]
    assert r[-1] == [["o1", "login_released_key_mismatch"]]
