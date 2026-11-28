"""Log in again by itself (MERIMEN_RELOGIN, plan #133): who may try, how often, and what each answer writes."""
import io
import json
import subprocess

import pytest

from autopilot_worker import loop, relogin
from autopilot_worker.config import Config
from autopilot_worker.db import to_numbered
from autopilot_worker.login_flow import read_login_output, relogin_env, relogin_fetch, relogin_target
from autopilot_worker.loop import sync_sessions
from test_claim import needs_pg, run

LOGGED_IN = "https://www.merimen.com.my/claims/index.cfm?CFID=1&RID=2"
LOGIN_PAGE = {"urls": ["https://www.merimen.com.my/claims/index.cfm"], "has_password": False}


@pytest.fixture(autouse=True)
def _fresh():
    relogin.reset()
    loop._launched.clear()
    yield
    relogin.reset()
    loop._launched.clear()


def cfg(tmp_path, **extra):
    env = {"EXT_CONNECT": "on", "WORKER_STATE": str(tmp_path), "CHROME_BIN": "/usr/bin/true", "MERIMEN_LOGIN": "on", "MERIMEN_RELOGIN": "on", **extra}
    return Config.from_env(env)


# ---------- the switch ----------

def test_the_switch_needs_merimen_login_too(tmp_path):
    assert cfg(tmp_path).merimen_relogin is True
    assert cfg(tmp_path, MERIMEN_LOGIN="off").merimen_relogin is False
    assert Config.from_env({"WORKER_STATE": str(tmp_path), "MERIMEN_LOGIN": "on"}).merimen_relogin is False  # default off


# ---------- sync_sessions: when a re-login is asked for ----------

class SessRepo:
    def __init__(self, rows, gate="ready"):
        self.rows, self.sessions, self.seen, self._gate = rows, [], [], gate

    def ensure_sessions(self):
        pass

    def wanted(self):
        return self.rows

    def gate(self, org, env_on):
        return self._gate

    def set_session(self, org, **k):
        self.sessions.append((org, k))

    def seen_connected(self, org):
        self.seen.append(org)

    def relogin_order(self, orgs):
        return list(reversed(orgs))  # the repo decides the order


def row(org="o1", status="waiting_login"):
    return {"org_id": org, "account_key": "default", "status": status, "wanted": "start", "port": 9222}


def sync(tmp_path, repo, info, asked):
    sync_sessions(cfg(tmp_path), repo, launch=lambda a: None, inspect=lambda p: info, relogin=lambda org, port: asked.append((org, port)))


@pytest.mark.parametrize("urls,want", [
    ([], True),                                  # 0 session tabs: may log in again
    (["https://www.merimen.com.my/claims/index.cfm"], True),
    ([LOGGED_IN], False),                        # 1 session tab: logged in
    ([LOGGED_IN, LOGGED_IN + "&x=2"], False),    # 2 session tabs: logged in by the same rule, never typed into
])
def test_tab_gate_zero_one_two(tmp_path, urls, want):
    asked = []
    sync(tmp_path, SessRepo([row()]), {"urls": urls, "has_password": False}, asked)
    assert bool(asked) is want


def test_no_relogin_when_chrome_is_down_or_the_gate_is_not_ready(tmp_path):
    asked = []
    sync(tmp_path, SessRepo([row()]), None, asked)  # Chrome does not answer: the launch path starts it; nothing is typed
    sync(tmp_path, SessRepo([row()], gate="blocked"), LOGIN_PAGE, asked)  # the gate (settings + consent) is not ready; the login itself is checked in the booking
    assert asked == []


def test_no_relogin_without_the_hook(tmp_path):
    repo = SessRepo([row()])
    sync_sessions(cfg(tmp_path), repo, launch=lambda a: None, inspect=lambda p: LOGIN_PAGE)
    assert repo.sessions[-1][1]["detail"] == "not_logged_in"


def test_at_most_one_org_per_tick_in_the_repos_order(tmp_path):
    asked = []

    def hook(org, port):
        asked.append(org)
        return "ok"

    sync_sessions(cfg(tmp_path), SessRepo([row("o1"), row("o2")]), launch=lambda a: None, inspect=lambda p: LOGIN_PAGE, relogin=hook)
    assert asked == ["o2"]  # the repo's order; one real try per tick


@pytest.mark.parametrize("refused", ["cooldown", "cap", "streak", "orphan", "unclear_block", "cred", "db_error", "key_mismatch", None])
def test_a_refused_org_hands_the_turn_to_the_next(tmp_path, refused):
    # loop review round 1: an org that is refused (nothing typed) must not take the tick's only try from the others
    asked = []

    def hook(org, port):
        asked.append(org)
        return refused if org == "o2" else "ok"

    sync_sessions(cfg(tmp_path), SessRepo([row("o1"), row("o2")]), launch=lambda a: None, inspect=lambda p: LOGIN_PAGE, relogin=hook)
    assert asked == ["o2", "o1"]


def test_seen_connected_is_written_when_the_org_turns_connected(tmp_path):
    repo = SessRepo([row(status="waiting_login")])
    sync(tmp_path, repo, {"urls": [LOGGED_IN], "has_password": False}, [])
    assert repo.seen == ["o1"]
    repo2 = SessRepo([row(status="connected")])
    sync(tmp_path, repo2, {"urls": [LOGGED_IN], "has_password": False}, [])
    assert repo2.seen == []  # already connected: no extra row every tick


def test_tick_without_the_switch_never_builds_a_relogin(tmp_path, monkeypatch):
    seen = {}

    def fake_sync(*a, **k):
        seen["relogin"] = k.get("relogin")

    monkeypatch.setattr(loop, "sync_sessions", fake_sync)

    class R:
        def __getattr__(self, name):
            return lambda *a, **k: [] if name == "followup_cases" else None

    c = cfg(tmp_path, MERIMEN_RELOGIN="off")
    loop.tick(c, R(), launch=None, inspect=None, namer=None, driver=None, download=None, fetch_page=None, master=b"k", relogin_fetch=lambda *a: {})
    assert seen["relogin"] is None
    loop.tick(cfg(tmp_path), R(), launch=None, inspect=None, namer=None, driver=None, download=None, fetch_page=None, master=b"k", relogin_fetch=lambda *a: {})
    assert callable(seen["relogin"])


# ---------- try_once with a recording repo ----------

class TryRepo:
    def __init__(self, booking=None, unclear=0, changed=1, mailed=1):
        self.booking = booking or {"booked": True, "reason": None, "streak_first": False, "try_id": 1}
        self.unclear, self.changed, self.mailed = unclear, changed, mailed
        self.batches, self.audits, self.mails, self.beats = [], [], [], 0

    def book_relogin(self, org):
        return self.booking

    def relogin_cred(self, org):
        return {"org_id": org, "password_nonce": "N0"}

    def heartbeat(self, *a, **k):
        self.beats += 1

    def owner_email(self, org):
        return "owner@example.test"

    def relogin_unclear_in_a_row(self, org):
        return self.unclear

    def outcome_written(self, org, try_id):
        return False  # like production: the replay always asks first

    def book_mail(self, org, kind):
        self.mails.append(("booked", kind))
        return bool(self.mailed)

    def audit(self, org, action):
        self.audits.append(action)

    def finish_relogin(self, org, statements):
        self.batches.append(statements)
        out = []
        for sql, _ in statements:
            if "WITH upd AS" in sql:
                out.append([(self.changed, self.mailed)])
            elif "relogin_mailed_" in sql or "%(mailed)s" in sql:
                out.append([(1,)] if self.mailed else [])
            else:
                out.append([])
        return out


def actions(repo):
    """The fixed audit strings written, in order."""
    acts = []
    for b in repo.batches:
        for sql, params in b:
            if sql.startswith("INSERT INTO merimen_cred_audit (org_id, action) VALUES"):
                acts.append(params[1])
            elif "WITH upd AS" in sql:
                acts.append(("block", params["state"], params["action"]))
            elif "%(mailed)s" in sql:
                acts.append(("mail", params["mailed"]))
    return acts


def go(tmp_path, repo, page, *, mailer=None, now=lambda: 0.0, closed=None):
    sent = []
    c = cfg(tmp_path)
    object.__setattr__(c, "mailer", mailer or (lambda to, subject, html: sent.append((to, subject, html))))
    fetched = []

    def fetch(user, password, port):
        fetched.append((user, password, port))
        return page

    import autopilot_worker.crypto as crypto
    orig = crypto.open_secret
    crypto.open_secret = lambda master, org, row, which: "abuser" if which == "user" else "s3cret-pass"
    try:
        out = relogin.try_once(c, repo, "o1", 9222, fetch_page=fetch, master=b"k", now=now,
                               close_target=lambda port, t: (closed if closed is not None else []).append(t),
                               close_kept=lambda port, t: (closed if closed is not None else []).append(t))
    finally:
        crypto.open_secret = orig
    return out, fetched, sent


OK_PAGE = {"submitted": True, "url": LOGGED_IN, "text": "", "has_password": False, "has_otp": False}
BAD_PAGE = {"submitted": True, "url": "https://www.merimen.com.my/claims/index.cfm", "text": "Invalid User ID or password", "has_password": True, "has_otp": False}
LOCK_PAGE = {**BAD_PAGE, "text": "Your account has been locked"}
OTP_PAGE = {**BAD_PAGE, "text": "", "has_otp": True}
UNREAD = {"result": "unknown", "submitted": True}


def test_refused_booking_never_types(tmp_path, capsys):
    for reason in ("cooldown", "cap", "unclear_block", "streak", "cred", "db_error", "orphan"):
        relogin.reset()
        repo = TryRepo(booking={"booked": False, "reason": reason, "streak_first": False})
        out, fetched, sent = go(tmp_path, repo, OK_PAGE)
        assert out == reason and fetched == [] and repo.batches == []
    assert "relogin: cooldown" in capsys.readouterr().err


def test_ok_writes_typed_and_ok_and_a_heartbeat_after(tmp_path):
    repo = TryRepo()
    out, fetched, sent = go(tmp_path, repo, OK_PAGE)
    assert out == "ok" and len(fetched) == 1 and fetched[0][2] == 9222
    assert actions(repo) == ["relogin_typed", "relogin_ok"]
    assert repo.beats == 1 and sent == []


def test_put_back_and_session_live_type_nothing_and_do_not_count_as_typed(tmp_path):
    repo = TryRepo()
    assert go(tmp_path, repo, {"result": "not_login_page", "submitted": False})[0] == "put_back"
    relogin.reset()
    assert go(tmp_path, repo, {"offline": True, "submitted": False})[0] == "put_back"
    relogin.reset()
    assert go(tmp_path, repo, {"result": "session_live", "submitted": False})[0] == "session_live"
    assert actions(repo) == ["relogin_put_back", "relogin_put_back", "login_session_live"]


def test_unknown_is_never_credited_from_another_tab(tmp_path):
    # cdp.mjs looks at its OWN tab before saying unknown; the worker never probes other tabs (a person may be logged in there)
    repo = TryRepo()
    out, _, _ = go(tmp_path, repo, UNREAD)
    assert out == "unclear" and "relogin_ok" not in actions(repo)


def test_a_try_that_is_not_ok_closes_its_own_tab_by_id(tmp_path):
    closed = []
    go(tmp_path, TryRepo(), {**BAD_PAGE, "relogin_target": "T9"}, closed=closed)
    assert closed == ["T9"]
    relogin.reset()
    closed2 = []
    go(tmp_path, TryRepo(), {**OK_PAGE, "relogin_target": "T9"}, closed=closed2)
    assert closed2 == []  # logged in: the tab stays, it holds the session


def test_a_lost_outcome_write_blocks_new_tries_until_it_is_written(tmp_path):
    class Flaky(TryRepo):
        fail = True

        def finish_relogin(self, org, statements):
            if self.fail:
                raise RuntimeError("db away")
            return super().finish_relogin(org, statements)

    repo = Flaky()
    out, fetched, _ = go(tmp_path, repo, BAD_PAGE, now=lambda: 0.0)
    assert out == "pending" and len(fetched) == 1
    out, fetched, _ = go(tmp_path, repo, BAD_PAGE, now=lambda: 100.0)
    assert out == "pending" and fetched == []  # still not written: nothing is booked or typed
    repo.fail = False
    out, fetched, sent = go(tmp_path, repo, OK_PAGE, now=lambda: 200.0)
    assert ("block", "bad_credentials", "login_bad_credentials") in actions(repo)  # the old outcome was written first
    assert len(fetched) == 1  # and only then a new booking (the fake repo books again)


def test_a_replayed_outcome_that_already_committed_is_not_written_twice(tmp_path):
    # loop review round 1: the first write committed and only its answer was lost; the replay must see that and write nothing
    class LostAnswer(TryRepo):
        lose = True
        written = False

        def finish_relogin(self, org, statements):
            out = super().finish_relogin(org, statements)
            if self.lose:
                self.lose, self.written = False, True
                raise RuntimeError("answer lost")
            return out

        def outcome_written(self, org, try_id):
            assert try_id == 41
            return self.written

    repo = LostAnswer(booking={"booked": True, "reason": None, "streak_first": False, "try_id": 41})
    out, fetched, _ = go(tmp_path, repo, BAD_PAGE, now=lambda: 0.0)
    assert out == "pending" and len(repo.batches) == 1
    out, fetched, _ = go(tmp_path, repo, OK_PAGE, now=lambda: 100.0)
    assert out == "ok" and len(fetched) == 1
    assert len(repo.batches) == 2 and actions(repo)[-2:] == ["relogin_typed", "relogin_ok"]  # no second block for the old try


def test_the_block_is_tied_to_the_password_that_was_typed(tmp_path):
    class Nonce(TryRepo):
        def relogin_cred(self, org):
            return {"org_id": org, "password_nonce": "N1"}

    repo = Nonce()
    go(tmp_path, repo, BAD_PAGE)
    blocks = [p for b in repo.batches for s, p in b if "WITH upd AS" in s]
    assert blocks and all(p["seen"] == "N1" for p in blocks)
    assert all("password_nonce = %(seen)s" in s for b in repo.batches for s, _ in b if "WITH upd AS" in s)


def test_a_key_mismatch_types_nothing_and_writes_its_own_row(tmp_path):
    repo = TryRepo()
    c = cfg(tmp_path)
    object.__setattr__(c, "mailer", lambda *a: None)
    fetched = []
    import autopilot_worker.crypto as crypto
    orig = crypto.open_secret

    def boom(*a):
        raise ValueError("wrong key")

    crypto.open_secret = boom
    try:
        out = relogin.try_once(c, repo, "o1", 9222, fetch_page=lambda *a: fetched.append(a), master=b"k", now=lambda: 0.0, close_target=lambda *a: None)
    finally:
        crypto.open_secret = orig
    assert out == "key_mismatch" and fetched == [] and actions(repo) == ["relogin_key_mismatch"]
    assert relogin.detail_for("o1") == "relogin_stopped"


def test_a_saved_login_without_its_nonce_is_never_typed(tmp_path):
    class NoNonce(TryRepo):
        def relogin_cred(self, org):
            return {"org_id": org}

    repo = NoNonce()
    out, fetched, _ = go(tmp_path, repo, BAD_PAGE)
    assert out == "key_mismatch" and fetched == [] and actions(repo) == ["relogin_key_mismatch"]


def test_a_login_that_stopped_being_ok_after_the_booking_is_not_a_put_back(tmp_path):
    class Gone(TryRepo):
        def relogin_cred(self, org):
            return None

    repo = Gone()
    out, fetched, _ = go(tmp_path, repo, OK_PAGE)
    assert out == "cred" and fetched == [] and actions(repo) == ["relogin_cred_gone"]  # not counted in the put-back streak


def test_the_tab_a_success_kept_is_closed_before_the_next_try(tmp_path):
    closed = []
    go(tmp_path, TryRepo(), {**OK_PAGE, "relogin_target": "T1"}, closed=closed, now=lambda: 0.0)
    assert closed == []
    go(tmp_path, TryRepo(), {**BAD_PAGE, "relogin_target": "T2"}, closed=closed, now=lambda: 1000.0)
    assert closed == ["T1", "T2"]


def test_an_orphan_refusal_sets_the_detail_and_mails_once(tmp_path):
    repo = TryRepo(booking={"booked": False, "reason": "orphan", "streak_first": False})
    out, fetched, sent = go(tmp_path, repo, OK_PAGE)
    assert out == "orphan" and fetched == [] and relogin.detail_for("o1") == "relogin_stopped"
    assert repo.mails == [("booked", "orphan")] and len(sent) == 1
    relogin.reset()
    repo2 = TryRepo(booking={"booked": False, "reason": "orphan", "streak_first": False}, mailed=0)
    assert go(tmp_path, repo2, OK_PAGE)[2] == []  # mail already booked in this episode


def test_a_db_error_after_booking_still_writes_the_outcome_row_before_any_new_try(tmp_path):
    class Down(TryRepo):
        down = True

        def relogin_cred(self, org):
            if self.down:
                raise RuntimeError("db away")
            return super().relogin_cred(org)

        def finish_relogin(self, org, statements):
            if self.down:
                raise RuntimeError("db away")
            return super().finish_relogin(org, statements)

        def outcome_written(self, org, try_id):
            return False

    repo = Down(booking={"booked": True, "reason": None, "streak_first": False, "try_id": 7})
    out, fetched, _ = go(tmp_path, repo, OK_PAGE, now=lambda: 0.0)
    assert out == "cred" and fetched == []
    out, fetched, _ = go(tmp_path, repo, OK_PAGE, now=lambda: 100.0)
    assert out == "pending" and fetched == []  # kept: no new booking
    repo.down = False
    out, fetched, _ = go(tmp_path, repo, OK_PAGE, now=lambda: 200.0)
    assert actions(repo)[0] == "relogin_cred_unread" and out == "ok" and len(fetched) == 1


def test_a_mail_booking_error_on_a_refusal_does_not_break_the_tick(tmp_path):
    class NoMail(TryRepo):
        def book_mail(self, org, kind):
            raise RuntimeError("db away")

    out, fetched, sent = go(tmp_path, NoMail(booking={"booked": False, "reason": "orphan", "streak_first": False}), OK_PAGE)
    assert out == "orphan" and sent == []


def test_a_logged_in_tab_is_kept_while_its_write_is_pending(tmp_path):
    class Flaky(TryRepo):
        def finish_relogin(self, org, statements):
            raise RuntimeError("db away")

    closed = []
    out, _, _ = go(tmp_path, Flaky(), {**OK_PAGE, "relogin_target": "T5"}, closed=closed)
    assert out == "pending" and closed == []
    assert relogin._own_tab["o1"] == "T5"  # remembered, so the next try's close_kept_tab looks at it


def test_the_booking_takes_the_advisory_lock_first():
    first, _ = relogin.booking_statements("o1")[0]
    assert "pg_advisory_xact_lock" in first


class _Resp:
    def __init__(self, body):
        self.body = body

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    def read(self):
        return self.body


@pytest.mark.parametrize("url,closes", [
    ("https://www.merimen.com.my/claims/index.cfm", True),          # the session ended: a logged-out Merimen page
    ("https://www.merimen.com.my/claims/index.cfm?x=1", True),
    (LOGGED_IN, False),                                             # logged in again (a person or Merimen): left open
    ("https://mail.example.test/inbox", False),                     # a person took the tab elsewhere: left open
])
def test_a_kept_tab_is_closed_only_while_it_is_a_logged_out_merimen_page(monkeypatch, url, closes):
    import autopilot_worker.login_flow as lf

    closed = []
    monkeypatch.setattr(lf, "close_target", lambda port, t: closed.append(t))
    body = json.dumps([{"id": "OTHER", "url": "https://www.merimen.com.my/claims/index.cfm"}, {"id": "K1", "url": url}]).encode()
    assert lf.close_kept_tab(9222, "K1", opener=lambda *a, **k: _Resp(body)) is closes
    assert closed == (["K1"] if closes else [])
    assert lf.close_kept_tab(9222, "GONE", opener=lambda *a, **k: _Resp(body)) is False


def test_close_target_never_closes_the_last_page_tab():
    import autopilot_worker.login_flow as lf

    calls = []

    def opener(body):
        def o(url, timeout=5):
            calls.append("close" if "/close/" in url else "list")
            return _Resp(body)
        return o

    lf.close_target(9222, "T", opener=opener(json.dumps([{"id": "T", "type": "page"}]).encode()))
    assert calls == ["list"]  # the only page tab: left open, the window stays
    calls.clear()
    lf.close_target(9222, "T", opener=opener(json.dumps([{"id": "T", "type": "page"}, {"id": "P", "type": "page"}]).encode()))
    assert calls == ["list", "close"]


@pytest.mark.parametrize("flags,reason", [
    ([True, True, True, True, True, False, True], "cred"),
    ([False, True, True, True, True, False, True], "orphan"),
    ([False, True, True, True, True, False, False], "cap"),
    ([False, True, False, True, True, False, False], "streak"),
    ([False, True, False, True, False, False, False], "unclear_block"),
    ([False, True, False, False, False, False, False], "cooldown"),
    ([False] * 7, "db_error"),
])
def test_read_refusal_full_order(flags, reason):
    assert relogin.read_refusal([[], [], [flags]])["reason"] == reason


def test_a_db_error_in_the_org_order_does_not_abort_the_tick(tmp_path):
    class Broken(SessRepo):
        def relogin_order(self, orgs):
            raise RuntimeError("db away")

    asked = []

    def hook(org, port):
        asked.append(org)
        return "ok"

    sync_sessions(cfg(tmp_path), Broken([row("o1"), row("o2")]), launch=lambda a: None, inspect=lambda p: LOGIN_PAGE, relogin=hook)
    assert asked == ["o1"]


def test_first_unclear_changes_nothing_and_mails_once(tmp_path):
    repo = TryRepo(unclear=0)
    out, _, sent = go(tmp_path, repo, UNREAD)
    assert out == "unclear"
    assert actions(repo) == ["relogin_typed", "relogin_unclear", ("mail", "relogin_mailed_relogin_unclear")]
    assert not any("UPDATE merimen_credentials" in s for b in repo.batches for s, _ in b)
    assert len(sent) == 1 and "24" in sent[0][2]
    relogin.reset()
    repo2 = TryRepo(unclear=0, mailed=0)  # already mailed in this episode
    assert go(tmp_path, repo2, UNREAD)[2] == []


def test_second_unclear_in_a_row_stops_like_the_save_time_unknown(tmp_path):
    repo = TryRepo(unclear=1)
    out, _, sent = go(tmp_path, repo, UNREAD)
    assert out == "unclear_stop"
    assert ("block", "unknown", "relogin_unclear_stop") in actions(repo)
    assert len(sent) == 1 and "Merimen did not give a clear answer" in sent[0][2]


@pytest.mark.parametrize("page,state", [(BAD_PAGE, "bad_credentials"), (LOCK_PAGE, "locked")])
def test_rejected_or_locked_blocks_pauses_and_mails_once(tmp_path, page, state):
    repo = TryRepo()
    out, _, sent = go(tmp_path, repo, page)
    assert out == state
    assert actions(repo)[:2] == ["relogin_typed", ("block", state, "login_" + state)]
    assert any("UPDATE jobs SET state = 'paused'" in s for b in repo.batches for s, _ in b)
    assert len(sent) == 1


def test_a_concurrent_re_save_means_no_mail(tmp_path):
    repo = TryRepo(changed=0)
    out, _, sent = go(tmp_path, repo, BAD_PAGE)
    assert out == "bad_credentials" and sent == []


def test_otp_never_writes_otp_and_mails_once(tmp_path):
    repo = TryRepo()
    out, _, sent = go(tmp_path, repo, OTP_PAGE)
    assert out == "otp"
    assert ("block", "unknown", "relogin_otp") in actions(repo)
    assert not any(isinstance(p, dict) and p.get("state") == "otp" for b in repo.batches for _, p in b)
    assert len(sent) == 1 and "code" in sent[0][2]


def test_streak_first_mails_once_and_sets_the_detail(tmp_path):
    repo = TryRepo(booking={"booked": False, "reason": "streak", "streak_first": True})
    _, _, sent = go(tmp_path, repo, OK_PAGE)
    assert relogin.detail_for("o1") == "relogin_failed" and len(sent) == 1
    relogin.reset()
    repo2 = TryRepo(booking={"booked": False, "reason": "streak", "streak_first": False})
    assert go(tmp_path, repo2, OK_PAGE)[2] == []  # later ticks: the detail stays, no second mail
    assert relogin.detail_for("o1") == "relogin_failed"


def test_cap_sets_the_detail_and_one_audit_row(tmp_path):
    repo = TryRepo(booking={"booked": False, "reason": "cap", "streak_first": False})
    go(tmp_path, repo, OK_PAGE, now=lambda: 0.0)
    go(tmp_path, repo, OK_PAGE, now=lambda: 1000.0)
    assert relogin.detail_for("o1") == "relogin_capped" and repo.audits == ["relogin_capped"]


def test_a_booked_try_clears_the_detail(tmp_path):
    go(tmp_path, TryRepo(booking={"booked": False, "reason": "cap", "streak_first": False}), OK_PAGE, now=lambda: 0.0)
    go(tmp_path, TryRepo(), OK_PAGE, now=lambda: 1000.0)
    assert relogin.detail_for("o1") is None


def test_booking_is_not_asked_more_than_once_a_minute(tmp_path):
    repo = TryRepo(booking={"booked": False, "reason": "cooldown", "streak_first": False})
    assert go(tmp_path, repo, OK_PAGE, now=lambda: 0.0)[0] == "cooldown"
    assert go(tmp_path, repo, OK_PAGE, now=lambda: 30.0)[0] is None


def test_the_password_never_reaches_a_log_line(tmp_path, capsys):
    for page in (OK_PAGE, BAD_PAGE, UNREAD, OTP_PAGE, {"result": "not_login_page", "submitted": False}):
        relogin.reset()
        go(tmp_path, TryRepo(), page)
    err = capsys.readouterr()
    assert "s3cret-pass" not in err.err + err.out and "abuser" not in err.err + err.out and "CFID" not in err.err + err.out


def test_new_mail_texts_have_no_secrets_and_both_languages():
    for kind in relogin.MAIL_KINDS:
        subject, html = relogin.relogin_email(kind)
        assert "/" in html and "@" not in html and "password=" not in html


# ---------- the child: env, output, time-out ----------

def test_relogin_child_env_has_no_secrets():
    env = relogin_env({"PATH": "/bin", "HOME": "/h", "MERIMEN_CRED_KEY": "k", "DATABASE_URL": "postgres://x", "NODE_OPTIONS": "--require=/evil.js", "NODE_EXTRA_CA_CERTS": "/ca"}, 9333)
    assert env == {"PATH": "/bin", "HOME": "/h", "NODE_EXTRA_CA_CERTS": "/ca", "CDP_PORT": "9333", "MERIMEN_LOGIN": "on"}


def test_the_target_line_is_not_a_result():
    out = json.dumps({"relogin_target": "T1"}) + "\n"
    assert relogin_target(out) == "T1"
    assert read_login_output(out) == {"offline": True, "submitted": False}
    assert read_login_output(out + json.dumps({"submitted": True}) + "\n") == {"result": "unknown", "submitted": True}


class FakeProc:
    def __init__(self, out, hang):
        self.out, self.hang, self.killed, self.calls, self.args = out, hang, False, 0, None

    def communicate(self, payload=None, timeout=None):
        self.calls += 1
        if self.hang and self.calls == 1:
            raise subprocess.TimeoutExpired("node", timeout)
        return self.out, ""

    def kill(self):
        self.killed = True


def test_a_timed_out_relogin_closes_only_its_own_tab():
    closed, procs = [], []

    def popen(argv, **k):
        procs.append(FakeProc(json.dumps({"relogin_target": "T7"}) + "\n" + json.dumps({"submitted": True}) + "\n", hang=True))
        procs[-1].args = (argv, k)
        return procs[-1]

    fetch = relogin_fetch("cdp.mjs", popen=popen, environ={"PATH": "/bin", "MERIMEN_CRED_KEY": "k"}, closer=lambda port, t: closed.append((port, t)))
    page = fetch("abuser", "s3cret", 9222)
    assert page == {"result": "unknown", "submitted": True, "relogin_target": "T7"} and closed == [(9222, "T7")]
    argv, k = procs[0].args
    assert argv[-2:] == ["login", "--relogin"] and "MERIMEN_CRED_KEY" not in k["env"]
    assert "s3cret" not in " ".join(argv)


def test_a_relogin_that_ends_in_time_closes_nothing_from_python():
    closed = []
    fetch = relogin_fetch("cdp.mjs", popen=lambda argv, **k: FakeProc(json.dumps({"relogin_target": "T7"}) + "\n" + json.dumps({"result": "not_login_page", "submitted": False}) + "\n", hang=False),
                          environ={}, closer=lambda port, t: closed.append(t))
    assert fetch("a", "b", 9222) == {"result": "not_login_page", "submitted": False, "relogin_target": "T7"} and closed == []


# ---------- the SQL on a real Postgres ----------

CRED = ("INSERT INTO merimen_credentials (org_id, username_hint, wrapped_dek, dek_nonce, username_ct, username_nonce, password_ct, password_nonce, verify_state) "
        "VALUES ('o1','u','a','b','c','d','e','f','ok')")
SEED = ["INSERT INTO organizations (id, name) VALUES ('o1', 'One'), ('o2', 'Two')", CRED]


def audit(action, ago="1 minute", org="o1"):
    return f"INSERT INTO merimen_cred_audit (org_id, action, at) VALUES ('{org}', '{action}', now() - interval '{ago}')"


def steps(statements):
    return [{"sql": to_numbered(s, p)[0], "params": to_numbered(s, p)[1]} for s, p in statements]


def book(seed_extra=(), n=1):
    r = run(steps(relogin.booking_statements("o1")) * n + [{"sql": "SELECT count(*) FROM merimen_cred_audit WHERE action = 'relogin_try' AND at > now() - interval '5 seconds'"}],
            seed=SEED + list(seed_extra))
    return [relogin.read_refusal(r[i * 3:(i + 1) * 3]) for i in range(n)], r[-1][0][0]


@needs_pg
def test_pg_first_booking_goes_and_a_second_is_the_cooldown():
    (first, second), rows = book(n=2)
    assert first["booked"] and second == {"booked": False, "reason": "cooldown", "streak_first": False} and rows == 1


@needs_pg
def test_pg_cap_counts_typed_tries_only():
    (b,), _ = book([audit("relogin_try", f"{i * 30 + 21} minutes") for i in range(20)] + [audit("relogin_put_back", f"{i * 30 + 20} minutes") for i in range(20)]
                   + [audit("session_seen_connected", f"{i * 30 + 19} minutes") for i in range(20)])
    assert b["booked"]  # 20 tries but nothing typed: put-backs never use up the cap
    (b,), _ = book([audit("relogin_typed", f"{i + 20} minutes") for i in range(12)])
    assert b["reason"] == "cap"


@needs_pg
def test_pg_unclear_blocks_24h_unless_a_success_came_after():
    (b,), _ = book([audit("relogin_unclear", "2 hours")])
    assert b["reason"] == "unclear_block"
    (b,), _ = book([audit("relogin_unclear", "2 hours"), audit("login_ok", "1 hour")])
    assert b["booked"]  # the user saved again and it worked: re-login is back (G1)
    (b,), _ = book([audit("relogin_unclear", "25 hours")])
    assert b["booked"]


@needs_pg
def test_pg_streak_first_reaching_six_and_its_end():
    six = [audit("relogin_put_back", f"{20 + i} minutes") for i in range(6)]
    (b,), _ = book(six)
    assert b == {"booked": False, "reason": "streak", "streak_first": True}
    (b,), _ = book(six + [audit("relogin_mailed_relogin_failed", "15 minutes")])
    assert b["reason"] == "streak" and b["streak_first"] is False  # already mailed this episode
    (b,), _ = book(six + [audit("session_seen_connected", "11 minutes")])
    assert b["booked"]  # Chrome was fixed some other way: the streak ended by itself
    (b,), _ = book([audit("relogin_put_back", f"{7 * 60 + i} minutes") for i in range(6)] + [audit("relogin_put_back", "20 minutes")])
    assert b["booked"]  # most of them fell out of the 6 h window


@needs_pg
def test_pg_refusal_reason_order():
    (b,), _ = book([audit("relogin_typed", f"{i + 1} minutes") for i in range(12)] + [audit("relogin_try", "1 minute"), audit("relogin_unclear", "1 minute")])
    assert b["reason"] == "cap"  # cap before unclear before cooldown
    (b,), _ = book([audit("relogin_try", "1 minute"), audit("relogin_unclear", "1 minute")])
    assert b["reason"] == "unclear_block"


@needs_pg
def test_pg_blocked_or_otp_login_is_never_booked():
    r = run(steps(relogin.booking_statements("o1")), seed=SEED + ["UPDATE merimen_credentials SET verify_state = 'otp'"])
    assert relogin.read_refusal(r)["reason"] == "cred"
    r = run(steps(relogin.booking_statements("o1")), seed=SEED + ["UPDATE merimen_credentials SET blocked = true"])
    assert relogin.read_refusal(r)["reason"] == "cred"


@needs_pg
def test_pg_block_statement_is_guarded_and_mails_once_per_episode():
    st = relogin.block_statement("o1", "unknown", "relogin_otp", "otp")
    r = run(steps([st, st]) + [{"sql": "SELECT verify_state, blocked FROM merimen_credentials"},
                               {"sql": "SELECT action FROM merimen_cred_audit ORDER BY id"}], seed=SEED)
    assert r[0] == [[1, 1]] and r[1] == [[0, 0]]  # second run: the row is no longer ok, nothing changes, no second mail
    assert r[2] == [["unknown", True]]
    assert sorted(r[3]) == [["relogin_mailed_otp"], ["relogin_otp"]]
    r = run(steps([st]) + [{"sql": "SELECT verify_state, blocked FROM merimen_credentials"}], seed=SEED + ["UPDATE merimen_credentials SET verify_state = 'queued'"])
    assert r[0] == [[0, 0]] and r[1] == [["queued", False]]  # the user saved again during the run: left alone


@needs_pg
def test_pg_pause_runs_only_after_this_runs_block():
    org_seed = SEED + [
        "INSERT INTO cases (id, org_id, plate, status) VALUES ('c1','o1','A1','phase_a')",
        "INSERT INTO jobs (id, case_id, step, state) VALUES (1,'c1','phase_a','queued')",
    ]
    pause = relogin._pause("o1", "bad_credentials", "bad")
    block = relogin.block_statement("o1", "bad_credentials", "login_bad_credentials", None)
    tx = lambda sts: [{"sql": "BEGIN"}] + steps(sts) + [{"sql": "COMMIT"}]  # noqa: E731  (db.batch: one transaction)
    look = [{"sql": "SELECT state FROM jobs"}, {"sql": "SELECT status FROM cases"}]
    r = run(tx(pause) + look, seed=org_seed)
    assert r[-2] == [["queued"]]  # the row is still ok: no pause
    r = run(tx([block] + pause) + look, seed=org_seed)
    assert r[-2] == [["paused"]] and r[-1] == [["waiting_user"]]
    # blocked by an EARLIER transaction (an old check): this run did not block it, so it pauses nothing (loop review round 1)
    r = run(tx([block]) + tx(pause) + look, seed=org_seed)
    assert r[-2] == [["queued"]] and r[-1] == [["phase_a"]]


@needs_pg
def test_pg_block_skips_a_password_saved_again_since_the_try():
    look = {"sql": "SELECT verify_state, blocked FROM merimen_credentials"}
    r = run(steps([relogin.block_statement("o1", "bad_credentials", "login_bad_credentials", None, "OLD")]) + [look], seed=SEED)
    assert r[-1] == [["ok", False]]  # the row now holds another password (nonce 'f'): left alone
    r = run(steps([relogin.block_statement("o1", "bad_credentials", "login_bad_credentials", None, "f")]) + [look], seed=SEED)
    assert r[-1] == [["bad_credentials", True]]


@needs_pg
def test_pg_outcome_written_looks_only_after_the_try():
    seed = SEED + [audit("relogin_typed", "30 minutes"), audit("relogin_try", "20 minutes")]
    r = run([{"sql": "SELECT max(id) FROM merimen_cred_audit"}], seed=seed)
    tid = r[0][0][0]
    assert run(steps([relogin.outcome_written_statement("o1", tid)]), seed=seed)[0] == []  # the older typed row does not count
    assert run(steps([relogin.outcome_written_statement("o1", tid)]), seed=seed + [audit("relogin_typed", "19 minutes")])[0] == [[1]]
    # a save-time login_session_live after the try is not this try's outcome
    assert run(steps([relogin.outcome_written_statement("o1", tid)]), seed=seed + [audit("login_session_live", "19 minutes")])[0] == []


@needs_pg
def test_pg_mail_booking_once_per_episode_and_again_after_a_success():
    st = relogin.mail_booking_statement("o1", "relogin_unclear")
    r = run(steps([st, st]), seed=SEED)
    assert r == [[[1]], []]
    r = run(steps([st]), seed=SEED + [audit("relogin_mailed_relogin_unclear", "2 hours"), audit("relogin_ok", "1 hour")])
    assert r == [[[1]]]


@needs_pg
def test_pg_orphan_mail_episode_ends_when_the_orphan_block_ends():
    st = relogin.mail_booking_statement("o1", "orphan")
    # the same orphan, refused again: mailed once already, nothing ended it -> no second mail
    assert run(steps([st]), seed=SEED + [audit("relogin_try", "20 minutes"), audit("relogin_mailed_orphan", "10 minutes")]) == [[]]
    # a proven success ends the episode
    assert run(steps([st]), seed=SEED + [audit("relogin_mailed_orphan", "2 hours"), audit("login_ok", "1 hour")]) == [[[1]]]
    # any outcome row ends the orphan block (login_session_live too), so a later new orphan is mailed again (loop review 20)
    assert run(steps([st]), seed=SEED + [audit("relogin_mailed_orphan", "2 hours"), audit("login_session_live", "1 hour"),
                                          audit("relogin_try", "20 minutes")]) == [[[1]]]


@needs_pg
def test_pg_a_cred_gone_row_ends_the_orphan():
    (b,), _ = book([audit("relogin_try", "20 minutes"), audit("relogin_cred_gone", "19 minutes")])
    assert b["booked"]


@needs_pg
def test_pg_seen_connected_only_while_an_episode_is_open():
    st = relogin.seen_connected_statement("o1")
    count = {"sql": "SELECT count(*) FROM merimen_cred_audit WHERE action = 'session_seen_connected'"}
    assert run(steps([st]) + [count], seed=SEED)[-1] == [[0]]
    assert run(steps([st, st]) + [count], seed=SEED + [audit("relogin_put_back")])[-1] == [[1]]


@needs_pg
def test_pg_unclear_count_and_order():
    from autopilot_worker.store import PgRepo

    r = run(steps([relogin.unclear_count_statement("o1")]), seed=SEED + [audit("relogin_unclear", "3 hours"), audit("relogin_ok", "2 hours"), audit("relogin_unclear", "1 hour")])
    assert r == [[[1]]]

    class Db:
        def execute(self, sql, params=()):
            text, args = to_numbered(sql, params)
            return [tuple(x) for x in run([{"sql": text, "params": args}], seed=SEED + [audit("relogin_try", "2 hours", "o1"), audit("relogin_try", "1 hour", "o2")])[0]]

    assert PgRepo("", db=Db()).relogin_order(["o1", "o2", "o3"]) == ["o3", "o1", "o2"]


# ---------- end to end over ticks: Chrome restarted on the login page -> one re-login -> connected next tick ----------

def test_end_to_end_restart_relogin_connected(tmp_path):
    tabs = {"urls": ["https://www.merimen.com.my/claims/index.cfm"], "has_password": False}
    repo = SessRepo([row(status="waiting_login")])
    trepo = TryRepo()
    c = cfg(tmp_path)
    object.__setattr__(c, "mailer", lambda *a: None)
    fetched = []

    def fetch(user, password, port):
        fetched.append(port)
        tabs["urls"] = tabs["urls"] + [LOGGED_IN]  # the own tab ended logged in
        return OK_PAGE

    import autopilot_worker.crypto as crypto
    orig = crypto.open_secret
    crypto.open_secret = lambda *a: "x"
    try:
        def hook(org, port):
            relogin.try_once(c, trepo, org, port, fetch_page=fetch, master=b"k", now=lambda: 0.0, close_target=lambda *a: None)

        sync_sessions(c, repo, launch=lambda a: None, inspect=lambda p: tabs, relogin=hook)
        assert fetched == [9222] and repo.sessions[-1][1]["status"] == "waiting_login"
        repo.rows = [row(status="waiting_login")]
        sync_sessions(c, repo, launch=lambda a: None, inspect=lambda p: tabs, relogin=hook)
    finally:
        crypto.open_secret = orig
    assert fetched == [9222]  # typed once, no manual step
    assert repo.sessions[-1][1]["status"] == "connected" and repo.sessions[-1][1]["detail"] is None


@needs_pg
def test_pg_a_try_without_an_outcome_blocks_like_unclear():
    (b,), _ = book([audit("relogin_try", "20 minutes")])
    assert b["reason"] == "orphan"  # typed or not, nobody wrote what happened: never type again until a proven success
    (b,), _ = book([audit("relogin_try", "30 hours")])
    assert b["reason"] == "orphan"  # no 24 h end: the lost answer may have been a rejection (loop review round 1)
    (b,), _ = book([audit("relogin_try", "30 hours"), audit("login_session_live", "1 hour"), audit("session_seen_connected", "1 hour")])
    assert b["booked"]  # an outcome row after the try: it is no orphan
    (b,), _ = book([audit("relogin_try", "30 hours"), audit("login_ok", "1 hour")])
    assert b["booked"]  # the user saved again and the save-time check proved the password
    (b,), _ = book([audit("relogin_try", "20 minutes"), audit("relogin_key_mismatch", "19 minutes")])
    assert b["booked"]
    (b,), _ = book([audit("relogin_try", "20 minutes"), audit("relogin_put_back", "19 minutes")])
    assert b["booked"]
    (b,), _ = book([audit("relogin_try", "20 minutes"), audit("relogin_typed", "19 minutes"), audit("relogin_ok", "19 minutes")])
    assert b["booked"]


@needs_pg
def test_pg_a_hand_login_does_not_lift_the_unclear_block():
    (b,), _ = book([audit("relogin_unclear", "2 hours"), audit("login_session_live", "1 hour"), audit("session_seen_connected", "1 hour")])
    assert b["reason"] == "unclear_block"  # neither tested the saved password


# --- round 10: shared stop texts and the screenshot tab ---------------------------------------------------------------------

def test_the_shared_stop_texts_say_check_on_merimen_first():
    from autopilot_worker import login_page as lp

    assert "Check that the user name and password work on Merimen" in lp.EVENT_BAD
    assert "Check that the user name and password work on Merimen" in lp.login_email("bad_credentials")[1]
    assert "Wait until Merimen unlocks it" in lp.EVENT_LOCKED
    assert "Wait until Merimen unlocks it" in lp.login_email("locked")[1]
    assert "Saving before it is unlocked tries the password again" in lp.login_email("locked")[1]


class _Pg:
    def __init__(self, url):
        self.url = url


def test_the_screenshot_page_prefers_a_logged_in_merimen_tab():
    from autopilot_worker.__main__ import pick_merimen_page

    login = _Pg("https://www.merimen.com.my/claims/index.cfm?fusebox=login")
    live = _Pg("https://www.merimen.com.my/claims/index.cfm?CFID=1&CFTOKEN=2&RID=3")
    other = _Pg("https://example.com/")
    assert pick_merimen_page([other, login, live]) is live
    assert pick_merimen_page([other, login]) is login
    assert pick_merimen_page([other]) is None
    assert pick_merimen_page([]) is None


def test_the_sql_action_lists_come_from_the_tuples():
    # one source for each list (loop review round 21): the SQL is built from these tuples, so they cannot drift
    lst = relogin._sql_list
    assert lst(relogin.OUTCOME_ACTIONS) in relogin._ORPHAN
    assert lst(relogin.OUTCOME_ACTIONS) in relogin.mail_booking_statement("o1", "orphan")[0]
    assert lst(relogin.SUCCESS_ACTIONS) in relogin._LAST_OK
    assert lst(relogin.PROVEN_ACTIONS) in relogin._LAST_PROVEN
    assert lst(relogin.EPISODE_ACTIONS) in relogin.seen_connected_statement("o1")[0]
    written = relogin.outcome_written_statement("o1", 1)[0]
    assert lst(a for a in relogin.OUTCOME_ACTIONS if a != "login_session_live") in written and "login_session_live" not in written


@pytest.mark.parametrize("info", [LOGIN_PAGE, None])
def test_no_hand_login_notice_while_relogin_is_active(tmp_path, info):
    # loop review round 22: re-login active means nobody is asked to log in by hand
    import os

    c = cfg(tmp_path)
    notice = os.path.join(c.state_dir, "NEED_LOGIN")
    sync_sessions(c, SessRepo([row("o1")]), launch=lambda a: None, inspect=lambda p: info, relogin=None)
    assert os.path.exists(notice)  # switch off: the hand-login notice is written
    sync_sessions(c, SessRepo([row("o1")]), launch=lambda a: None, inspect=lambda p: info, relogin=lambda org, port: "ok")
    assert not os.path.exists(notice)  # round 24: switch on removes the old notice, so it never misleads
    sync_sessions(c, SessRepo([row("o1")]), launch=lambda a: None, inspect=lambda p: info, relogin=lambda org, port: "ok")
    assert not os.path.exists(notice)
