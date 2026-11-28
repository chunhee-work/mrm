"""Log in again by itself (MERIMEN_RELOGIN, plan #133, owner 2026-11-28: "fully automation").

When the worker's Chrome answers but no tab is logged in to Merimen, the worker types the login the user saved on the website ONCE,
into its own fresh tab. Hard rules: the account is never put at risk of locking; a rejected password is never typed again until the
user saves the login again; an unclear answer is not retried for 24 h, and a second unclear answer in a row stops it like a rejection.
verify_state stays 'ok' while a re-login runs; this module never calls repo.finish_verify.

Every audit action is a fixed string. No address, page text, user name or password is logged or stored.
"""

from __future__ import annotations

import sys
import time

from .login_page import (
    EVENT_BAD,
    EVENT_LOCKED,
    RESULT_BAD,
    RESULT_LOCKED,
    RESULT_NOT_LOGIN_PAGE,
    RESULT_OK,
    RESULT_OTP,
    RESULT_SESSION_LIVE,
    RESULT_UNKNOWN,
    login_email,
)

COOLDOWN = "10 minutes"
CAP = 12  # typed tries in 24 h
STREAK = 6  # put-backs in a row (nothing typed) before one mail
STREAK_WINDOW = "6 hours"
UNCLEAR_BLOCK = "24 hours"
UNCLEAR_IN_A_ROW = 2  # the second one stops like a rejection (G2)

SUCCESS_ACTIONS = ("relogin_ok", "login_session_live", "login_ok", "session_seen_connected")
EPISODE_ACTIONS = ("relogin_put_back", "relogin_unclear", "relogin_capped")
MAIL_KINDS = ("relogin_failed", "relogin_unclear", "otp", "orphan")

# the time of the last success for this org; every "since the last success" count uses it
_LAST_OK = (
    "coalesce((SELECT max(at) FROM merimen_cred_audit WHERE org_id = %(org)s AND action IN "
    "('relogin_ok','login_session_live','login_ok','session_seen_connected')), '-infinity'::timestamp)"
)
# only a login that TESTED the saved password lifts an unclear block (G1 + critic): a person logged in by hand (login_session_live)
# or a tab seen connected says nothing about whether the saved password works
_LAST_PROVEN = (
    "coalesce((SELECT max(at) FROM merimen_cred_audit WHERE org_id = %(org)s AND action IN "
    "('relogin_ok','login_ok')), '-infinity'::timestamp)"
)
_COOLDOWN = f"EXISTS (SELECT 1 FROM merimen_cred_audit WHERE org_id = %(org)s AND action = 'relogin_try' AND at > now() - interval '{COOLDOWN}')"
_CAPPED = f"(SELECT count(*) FROM merimen_cred_audit WHERE org_id = %(org)s AND action = 'relogin_typed' AND at > now() - interval '24 hours') >= {CAP}"
_UNCLEAR = (
    f"EXISTS (SELECT 1 FROM merimen_cred_audit WHERE org_id = %(org)s AND action = 'relogin_unclear' AND at > now() - interval '{UNCLEAR_BLOCK}' "
    f"AND at > {_LAST_PROVEN})"
)
# a try whose outcome was never written (the DB call after the typing failed, or the worker died): it may have been a rejected
# password, so it blocks like an unclear answer (code review: a lost outcome write must never lead to the same password again)
# It does NOT end after 24 h: only a password-proving success (relogin_ok, or the save-time login_ok after the user saves again) ends
# it, because the lost answer may have been a rejection (loop review round 1).
OUTCOME_ACTIONS = ("relogin_put_back", "relogin_typed", "login_session_live", "relogin_key_mismatch", "relogin_cred_gone")
_ORPHAN = (
    "EXISTS (SELECT 1 FROM merimen_cred_audit t WHERE t.org_id = %(org)s AND t.action = 'relogin_try' "
    "AND t.at < now() - interval '3 minutes' "
    f"AND t.at > {_LAST_PROVEN} "
    "AND NOT EXISTS (SELECT 1 FROM merimen_cred_audit o WHERE o.org_id = t.org_id "
    "AND o.action IN ('relogin_put_back','relogin_typed','login_session_live','relogin_key_mismatch','relogin_cred_gone') AND o.id > t.id))"
)
_STREAK = (
    f"(SELECT count(*) FROM merimen_cred_audit WHERE org_id = %(org)s AND action = 'relogin_put_back' AND at > now() - interval '{STREAK_WINDOW}' "
    f"AND at > {_LAST_OK}) >= {STREAK}"
)
_CRED_OK = "EXISTS (SELECT 1 FROM merimen_credentials WHERE org_id = %(org)s AND verify_state = 'ok' AND NOT blocked)"


def booking_statements(org_id: str) -> list[tuple[str, object]]:
    """Lock, book, and (read only) every reason a booking can be refused, in one transaction (G6, G7, D4)."""
    p = {"org": org_id, "key": "relogin:" + org_id}
    return [
        ("SELECT pg_advisory_xact_lock(hashtext(%(key)s))", p),
        (
            f"INSERT INTO merimen_cred_audit (org_id, action) SELECT %(org)s, 'relogin_try' "
            f"WHERE {_CRED_OK} AND NOT {_COOLDOWN} AND NOT {_CAPPED} AND NOT {_UNCLEAR} AND NOT {_ORPHAN} AND NOT {_STREAK} RETURNING id",
            p,
        ),
        (
            f"SELECT NOT {_CRED_OK}, {_COOLDOWN}, {_CAPPED}, {_UNCLEAR}, {_STREAK}, "
            f"EXISTS (SELECT 1 FROM merimen_cred_audit WHERE org_id = %(org)s AND action = 'relogin_mailed_relogin_failed' AND at > {_LAST_OK}), "
            f"{_ORPHAN}",
            p,
        ),
    ]


def read_refusal(res: list) -> dict:
    """What the booking batch answered. A booked row wins (with its id); otherwise the first true reason in this order:
    cred, orphan, cap, streak, unclear, cooldown."""
    booked = bool(res and len(res) > 1 and res[1])
    if booked:
        return {"booked": True, "reason": None, "streak_first": False, "try_id": res[1][0][0]}
    flags = list(res[2][0]) if res and len(res) > 2 and res[2] else [False] * 7
    flags += [False] * (7 - len(flags))
    names = ("cred", "cooldown", "cap", "unclear", "streak", "_mailed", "orphan")
    # the cooldown hides the others most of the time; the cap and the streak are still reported, so their session detail stays on
    for name in ("cred", "orphan", "cap", "streak", "unclear", "cooldown"):
        if flags[names.index(name)]:
            # the unclear REFUSAL gets its own word: "unclear" is the outcome of a typed try (loop.TRIED), this typed nothing
            return {"booked": False, "reason": "unclear_block" if name == "unclear" else name, "streak_first": name == "streak" and not flags[5]}
    return {"booked": False, "reason": "db_error", "streak_first": False}


def seen_connected_statement(org_id: str) -> tuple[str, object]:
    p = {"org": org_id}
    return (
        "INSERT INTO merimen_cred_audit (org_id, action) SELECT %(org)s, 'session_seen_connected' "
        f"WHERE EXISTS (SELECT 1 FROM merimen_cred_audit WHERE org_id = %(org)s AND action IN ('relogin_put_back','relogin_unclear','relogin_capped') "
        f"AND at > {_LAST_OK})",
        p,
    )


def outcome_written_statement(org_id: str, try_id) -> tuple[str, object]:
    return (
        "SELECT 1 FROM merimen_cred_audit WHERE org_id = %(org)s AND id > %(tid)s::int AND action IN "
        "('relogin_put_back','relogin_typed','login_session_live','relogin_key_mismatch','relogin_cred_gone') LIMIT 1",
        {"org": org_id, "tid": str(int(try_id))},
    )


def unclear_count_statement(org_id: str) -> tuple[str, object]:
    return (f"SELECT count(*) FROM merimen_cred_audit WHERE org_id = %(org)s AND action = 'relogin_unclear' AND at > {_LAST_PROVEN}", {"org": org_id})


def mail_booking_statement(org_id: str, kind: str) -> tuple[str, object]:
    """Book one mail of this kind for this episode (an episode ends on a success). RETURNING 1 = send it (D2)."""
    if kind not in MAIL_KINDS:
        raise ValueError("mail kind")
    p = {"org": org_id, "mailed": "relogin_mailed_" + kind}
    # the orphan block ends only on a proven success, so its mail episode does too (a hand login must not send it again)
    since = _LAST_PROVEN if kind == "orphan" else _LAST_OK
    return (
        "INSERT INTO merimen_cred_audit (org_id, action) SELECT %(org)s, %(mailed)s "
        f"WHERE NOT EXISTS (SELECT 1 FROM merimen_cred_audit WHERE org_id = %(org)s AND action = %(mailed)s AND at > {since}) RETURNING 1",
        p,
    )


def _audit(org_id: str, *actions: str) -> list[tuple[str, object]]:
    return [("INSERT INTO merimen_cred_audit (org_id, action) VALUES (%s, %s)", (org_id, a)) for a in actions]


def _pause(org_id: str, state: str, event: str) -> list[tuple[str, object]]:
    """The save-time pause (store.pause_statements), run only if THIS run's guarded update left the row in `state` + blocked."""
    from .store import pause_statements

    return pause_statements(org_id, event, only_if_state=state)


def block_statement(org_id: str, state: str, action: str, mail_kind: str | None, seen_nonce: str | None = None) -> tuple[str, object]:
    """Guarded stop (G5): only a row that is still 'ok' and not blocked changes. One statement answers (changed, mailed).
    A user who saved the login again during the run is left alone: no pause, no mail."""
    # seen_nonce: the password this try typed. A row whose password was saved again since then is never blocked for it (loop review).
    p = {"org": org_id, "state": state, "action": action, "mailed": "relogin_mailed_" + (mail_kind or "none"), "seen": seen_nonce}
    same_password = " AND password_nonce = %(seen)s" if seen_nonce else ""
    mail = (
        "m AS (INSERT INTO merimen_cred_audit (org_id, action) SELECT org_id, %(mailed)s FROM upd "
        f"WHERE NOT EXISTS (SELECT 1 FROM merimen_cred_audit WHERE org_id = %(org)s AND action = %(mailed)s AND at > {_LAST_OK}) RETURNING 1)"
        if mail_kind
        else "m AS (SELECT 1 WHERE false)"
    )
    return (
        f"""WITH upd AS (
              UPDATE merimen_credentials SET verify_state = %(state)s, blocked = true, updated_at = now()
              WHERE org_id = %(org)s AND verify_state = 'ok' AND NOT blocked{same_password} RETURNING org_id
            ),
            a AS (INSERT INTO merimen_cred_audit (org_id, action) SELECT org_id, %(action)s FROM upd RETURNING 1),
            {mail}
            SELECT (SELECT count(*) FROM upd), (SELECT count(*) FROM m)""",
        p,
    )


EVENT_RELOGIN_OTP = "Merimen 需要验证码。请在「连接」页重新保存登录。 / Merimen asked for a code. Save the login again on the Connection page."
EVENT_RELOGIN_UNKNOWN = "Merimen 两次都没有明确回复自动登录。请在「连接」页重新保存登录；我们不会自动再试。 / Merimen twice gave no clear answer to the automatic login. Save the login again on the Connection page. We will not try again automatically."


def relogin_email(kind: str) -> tuple[str, str]:
    """Subject and HTML for the four new kinds (orphan reuses the save-time "unknown" text). No user name, no password, no address."""
    subject = "Merimen 自动登录 / Merimen automatic login"
    if kind == "relogin_failed":
        body = "已经连续 6 次没有找到 Merimen 登录页，什么都没有输入。请检查工作电脑上的 Chrome。 / 6 tries in a row found no Merimen login page; nothing was typed. Please check the Chrome on the worker computer."
    elif kind == "relogin_unclear":
        body = "Merimen 没有明确回复这次自动登录。24 小时内我们不会再试。如果密码改过，请在「连接」页重新保存。 / Merimen gave no clear answer to the automatic login. We will not try again for 24 hours. If the password changed, save it again on the Connection page."
    elif kind == "orphan":
        return login_email("unknown")
    elif kind == "otp":
        body = "Merimen 要求输入验证码，自动登录已停止，没有再输入任何东西。请打开「连接」页重新保存登录。 / Merimen asked for a code. The automatic login stopped and nothing more was typed. Open the Connection page and save the login again."
    else:
        raise ValueError("mail kind")
    return subject, f"<p>{body}</p>"


def _send(poster, to, subject_html: tuple[str, str]) -> None:
    """to: an address, or a function that reads it (called only when a mail really goes out; a failure there sends nothing)."""
    if not poster or not to:
        return
    try:
        addr = to() if callable(to) else to
        if addr:
            poster(addr, *subject_html)
    except Exception:  # noqa: BLE001
        return


def outcome_of(page: dict) -> str:
    """put_back | session_live | ok | unknown | bad_credentials | locked | otp: the same reading as the save-time check
    (login_flow.page_result), with not_login_page and offline (nothing typed) both called a put-back."""
    from .login_flow import page_result

    result = page_result(page)
    if result == RESULT_SESSION_LIVE:
        return "session_live"
    if result in (RESULT_NOT_LOGIN_PAGE, "offline"):
        return "put_back"
    return "ok" if result == RESULT_OK else result


def finish(repo, org_id: str, page: dict, *, email_to=None, poster=None, seen_nonce: str | None = None) -> str:
    """Write what this one re-login did. Returns the outcome word (for the one log line)."""
    out = outcome_of(page)
    if out == "put_back":
        repo.finish_relogin(org_id, _audit(org_id, "relogin_put_back"))
        return out
    if out == "session_live":
        repo.finish_relogin(org_id, _audit(org_id, "login_session_live"))
        return out
    if out == "ok":
        repo.finish_relogin(org_id, _audit(org_id, "relogin_typed", "relogin_ok"))
        return out
    if out == RESULT_UNKNOWN:
        # cdp.mjs already looked once, read only, at ITS OWN tab before giving "unknown" (a logged-in own tab comes back as a read page).
        # Another tab is never taken as proof: a person may have logged in there while this password failed.
        if repo.relogin_unclear_in_a_row(org_id) + 1 >= UNCLEAR_IN_A_ROW:
            # the second unclear answer with no success between: stop like the save-time "unknown" (blocked, paused, existing mail)
            res = repo.finish_relogin(org_id, _audit(org_id, "relogin_typed") + [block_statement(org_id, RESULT_UNKNOWN, "relogin_unclear_stop", None, seen_nonce)]
                                      + _pause(org_id, RESULT_UNKNOWN, EVENT_RELOGIN_UNKNOWN))
            if _changed(res, 1):
                _send(poster, email_to, login_email("unknown"))
            return "unclear_stop"
        res = repo.finish_relogin(org_id, _audit(org_id, "relogin_typed", "relogin_unclear") + [mail_booking_statement(org_id, "relogin_unclear")])
        if res and len(res) > 2 and res[2]:
            _send(poster, email_to, relogin_email("relogin_unclear"))
        return "unclear"
    if out in (RESULT_BAD, RESULT_LOCKED):
        event = EVENT_BAD if out == RESULT_BAD else EVENT_LOCKED
        res = repo.finish_relogin(org_id, _audit(org_id, "relogin_typed") + [block_statement(org_id, out, "login_" + out, None, seen_nonce)] + _pause(org_id, out, event))
        if _changed(res, 1):
            _send(poster, email_to, login_email(out))
        return out
    if out == RESULT_OTP:
        # never 'otp': the web would show a code box for a tab that is already closed (G3). unknown + blocked, audit relogin_otp.
        res = repo.finish_relogin(org_id, _audit(org_id, "relogin_typed") + [block_statement(org_id, RESULT_UNKNOWN, "relogin_otp", "otp", seen_nonce)]
                                  + _pause(org_id, RESULT_UNKNOWN, EVENT_RELOGIN_OTP))
        if res and len(res) > 1 and res[1] and int(res[1][0][1] or 0) > 0:
            _send(poster, email_to, relogin_email("otp"))
        return out
    return out


def _changed(res, i: int) -> bool:
    try:
        return int(res[i][0][0] or 0) > 0
    except (IndexError, TypeError, ValueError):
        return False


# ---- the loop side: who may try now, and the fixed log lines ----
ATTEMPT_EVERY = 60.0  # seconds between booking asks for one org (the DB cooldown is 10 min; this only saves queries)
LOG_EVERY = 3600.0

_asked: dict[str, float] = {}
_logged: dict[tuple[str, str], float] = {}
_detail: dict[str, str | None] = {}


def clear_detail(org_id: str) -> None:
    """The org is connected again: no re-login refusal is shown any more."""
    _detail.pop(org_id, None)
    _capped_logged.discard(org_id)


def detail_for(org_id: str) -> str | None:
    """relogin_failed (streak), relogin_capped (cap) or relogin_stopped (orphan, key mismatch). Set when that refusal is seen; cleared
    only by an ok / session_live try or when the org turns connected, so it may stay on after the refusal itself has ended."""
    return _detail.get(org_id)


def log_line(org_id: str, reason: str, *, now=time.monotonic) -> None:
    t = now()
    key = (org_id, reason)
    if key in _logged and t - _logged[key] < LOG_EVERY:
        return
    _logged[key] = t
    print(f"relogin: {reason}", file=sys.stderr, flush=True)


def try_once(cfg, repo, org_id: str, port: int, *, fetch_page, master: bytes, now=time.monotonic, close_target=None) -> str | None:
    """Book, then (only if booked) type once. None = not asked this time (asked too recently)."""
    from .crypto import open_secret

    if close_target is None:
        from .login_flow import close_target

    t = now()
    if org_id in _asked and t - _asked[org_id] < ATTEMPT_EVERY:
        return None
    _asked[org_id] = t
    if org_id in _pending:  # the last try's outcome is not written yet: never book another one before it is
        retry_pending(cfg, repo)
        if org_id in _pending:
            log_line(org_id, "pending", now=now)
            return "pending"
    try:
        booking = repo.book_relogin(org_id)
    except Exception:  # noqa: BLE001
        log_line(org_id, "db_error", now=now)
        return "db_error"
    if not booking["booked"]:
        reason = booking["reason"]
        if reason == "streak":
            _detail[org_id] = "relogin_failed"
            if booking.get("streak_first") and _book_mail(repo, org_id, "relogin_failed"):
                _send(cfg.mailer, lambda: repo.owner_email(org_id), relogin_email("relogin_failed"))
        elif reason == "orphan":
            _detail[org_id] = "relogin_stopped"
            if _book_mail(repo, org_id, "orphan"):
                _send(cfg.mailer, lambda: repo.owner_email(org_id), relogin_email("orphan"))
        elif reason == "cap":
            if org_id not in _capped_logged:
                repo.audit(org_id, "relogin_capped")
                _capped_logged.add(org_id)
            _detail[org_id] = "relogin_capped"
        log_line(org_id, reason, now=now)
        return reason
    try_id = booking.get("try_id")
    try:
        row = repo.relogin_cred(org_id)
    except Exception:  # noqa: BLE001  (booked, nothing typed: the try still gets its outcome row, never a false orphan)
        row = None
    if not row:  # the login stopped being ok since the booking (or could not be read): nothing typed, not a put-back
        _write_or_keep(repo, org_id, "relogin_cred_gone", try_id)
        log_line(org_id, "cred", now=now)
        return "cred"
    nonce = row.get("password_nonce")
    try:
        if not nonce:  # the block must be tied to the typed password; without its nonce nothing is typed
            raise ValueError("no nonce")
        user = open_secret(master, org_id, row, "user")
        password = open_secret(master, org_id, row, "pass")
    except Exception:  # noqa: BLE001  (wrong key: Merimen was never asked; not a put-back, so no "no login page" mail)
        _write_or_keep(repo, org_id, "relogin_key_mismatch", try_id)
        _detail[org_id] = "relogin_stopped"
        log_line(org_id, "key_mismatch", now=now)
        return "key_mismatch"
    old_tab = _own_tab.pop(org_id, None)
    if old_tab:  # the tab a past success kept: the session there has ended (0 logged-in tabs), so it is closed, not left to pile up
        try:
            close_target(port, old_tab)
        except Exception:  # noqa: BLE001
            pass
    try:
        page = fetch_page(user, password, port)
    except Exception:  # noqa: BLE001  (a thrown fetch may have typed: unknown, never put back)
        page = {"result": RESULT_UNKNOWN, "submitted": True}
    del user, password
    try:
        repo.heartbeat(cfg.worker_id, cfg.hf_repo, chrome_ok=True)  # the try can take 90 s; the web must not call the worker gone (G6)
    except Exception:  # noqa: BLE001
        pass
    try:
        out = finish(repo, org_id, page, email_to=lambda: repo.owner_email(org_id), poster=cfg.mailer, seen_nonce=nonce)
    except Exception:  # noqa: BLE001  (the outcome must still be written: kept here and written again before any new try)
        _pending[org_id] = {"page": page, "try_id": try_id, "nonce": nonce}
        log_line(org_id, "outcome_pending", now=now)
        out = "pending"
    # the tab follows what the PAGE showed, also while its write is pending: a logged-in tab holds the session and is kept
    shown = outcome_of(page) if out == "pending" else out
    if out in ("ok", "session_live"):
        _detail.pop(org_id, None)  # the detail clears only on a success or when the org is seen connected (G7)
        _capped_logged.discard(org_id)
    if shown in ("ok", "session_live"):
        if page.get("relogin_target"):
            _own_tab[org_id] = str(page["relogin_target"])
    elif page.get("relogin_target"):
        close_target(port, str(page["relogin_target"]))  # the worker and cdp.mjs may disagree on "logged in": a try that is not ok never keeps its tab
    print(f"relogin: done_{out}", file=sys.stderr, flush=True)  # one line per real try, fixed words only
    return out


# org -> the page of a try whose outcome write failed. Written again every tick (retry_pending) until it commits. If the worker
# dies meanwhile, the DB still has the relogin_try row without an outcome, and the booking treats it as unclear (_ORPHAN).
_pending: dict[str, dict] = {}
# org -> the own tab a successful try kept (it holds the session). Closed before the next try; lost on a worker restart.
_own_tab: dict[str, str] = {}
# orgs whose relogin_capped row this process already wrote (one per worker-process episode, whatever detail came between)
_capped_logged: set[str] = set()


def _book_mail(repo, org_id: str, kind: str) -> bool:
    try:
        return bool(repo.book_mail(org_id, kind))
    except Exception:  # noqa: BLE001  (nothing booked: the next refusal asks again)
        return False


def _write_or_keep(repo, org_id: str, action: str, try_id) -> None:
    """The outcome row of a try that typed nothing. If the write fails it is kept and written before any new try (no false orphan)."""
    try:
        repo.finish_relogin(org_id, _audit(org_id, action))
    except Exception:  # noqa: BLE001
        _pending[org_id] = {"audit": action, "try_id": try_id}


def retry_pending(cfg, repo) -> None:
    """Write a kept outcome once. If the first write did commit (only its answer was lost), an outcome row after the try's id is
    already there and nothing is written twice. The block is guarded on the password this try typed, so a login saved again
    meanwhile is never blocked for the old one."""
    for org_id, kept in list(_pending.items()):
        try:
            if kept.get("try_id") is not None and repo.outcome_written(org_id, kept["try_id"]):
                _pending.pop(org_id, None)
                continue
            if "audit" in kept:
                repo.finish_relogin(org_id, _audit(org_id, kept["audit"]))
            else:
                finish(repo, org_id, kept["page"], email_to=lambda o=org_id: repo.owner_email(o), poster=cfg.mailer, seen_nonce=kept.get("nonce"))
        except Exception:  # noqa: BLE001
            continue
        _pending.pop(org_id, None)


def reset() -> None:
    """For tests: forget the in-process timers."""
    _pending.clear()
    _own_tab.clear()
    _capped_logged.clear()
    _asked.clear()
    _logged.clear()
    _detail.clear()


__all__ = ["try_once", "finish", "booking_statements", "read_refusal", "relogin_email", "detail_for", "reset", "RESULT_NOT_LOGIN_PAGE"]
