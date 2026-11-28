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
    classify_login,
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
MAIL_KINDS = ("relogin_failed", "relogin_unclear", "otp")

# the time of the last success for this org; every "since the last success" count uses it
_LAST_OK = (
    "coalesce((SELECT max(at) FROM merimen_cred_audit WHERE org_id = %(org)s AND action IN "
    "('relogin_ok','login_session_live','login_ok','session_seen_connected')), '-infinity'::timestamp)"
)
_COOLDOWN = f"EXISTS (SELECT 1 FROM merimen_cred_audit WHERE org_id = %(org)s AND action = 'relogin_try' AND at > now() - interval '{COOLDOWN}')"
_CAPPED = f"(SELECT count(*) FROM merimen_cred_audit WHERE org_id = %(org)s AND action = 'relogin_typed' AND at > now() - interval '24 hours') >= {CAP}"
_UNCLEAR = (
    f"EXISTS (SELECT 1 FROM merimen_cred_audit WHERE org_id = %(org)s AND action = 'relogin_unclear' AND at > now() - interval '{UNCLEAR_BLOCK}' "
    f"AND at > {_LAST_OK})"
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
            f"WHERE {_CRED_OK} AND NOT {_COOLDOWN} AND NOT {_CAPPED} AND NOT {_UNCLEAR} AND NOT {_STREAK} RETURNING 1",
            p,
        ),
        (
            f"SELECT NOT {_CRED_OK}, {_COOLDOWN}, {_CAPPED}, {_UNCLEAR}, {_STREAK}, "
            f"EXISTS (SELECT 1 FROM merimen_cred_audit WHERE org_id = %(org)s AND action = 'relogin_mailed_relogin_failed' AND at > {_LAST_OK})",
            p,
        ),
    ]


def read_refusal(res: list) -> dict:
    """What the booking batch answered. A booked row wins; otherwise the first true reason (cred, cooldown, cap, unclear, streak)."""
    booked = bool(res and len(res) > 1 and res[1])
    if booked:
        return {"booked": True, "reason": None, "streak_first": False}
    flags = list(res[2][0]) if res and len(res) > 2 and res[2] else [False] * 6
    names = ("cred", "cooldown", "cap", "unclear", "streak")
    # the cooldown hides the others most of the time; the cap and the streak are still reported, so their session detail stays on
    for name in ("cred", "cap", "streak", "unclear", "cooldown"):
        if flags[names.index(name)]:
            return {"booked": False, "reason": name, "streak_first": name == "streak" and not flags[5]}
    return {"booked": False, "reason": "db_error", "streak_first": False}


def seen_connected_statement(org_id: str) -> tuple[str, object]:
    p = {"org": org_id}
    return (
        "INSERT INTO merimen_cred_audit (org_id, action) SELECT %(org)s, 'session_seen_connected' "
        f"WHERE EXISTS (SELECT 1 FROM merimen_cred_audit WHERE org_id = %(org)s AND action IN ('relogin_put_back','relogin_unclear','relogin_capped') "
        f"AND at > {_LAST_OK})",
        p,
    )


def unclear_count_statement(org_id: str) -> tuple[str, object]:
    return (f"SELECT count(*) FROM merimen_cred_audit WHERE org_id = %(org)s AND action = 'relogin_unclear' AND at > {_LAST_OK}", {"org": org_id})


def mail_booking_statement(org_id: str, kind: str) -> tuple[str, object]:
    """Book one mail of this kind for this episode (an episode ends on a success). RETURNING 1 = send it (D2)."""
    if kind not in MAIL_KINDS:
        raise ValueError("mail kind")
    p = {"org": org_id, "mailed": "relogin_mailed_" + kind}
    return (
        "INSERT INTO merimen_cred_audit (org_id, action) SELECT %(org)s, %(mailed)s "
        f"WHERE NOT EXISTS (SELECT 1 FROM merimen_cred_audit WHERE org_id = %(org)s AND action = %(mailed)s AND at > {_LAST_OK}) RETURNING 1",
        p,
    )


def _audit(org_id: str, *actions: str) -> list[tuple[str, object]]:
    return [("INSERT INTO merimen_cred_audit (org_id, action) VALUES (%s, %s)", (org_id, a)) for a in actions]


def _pause(org_id: str, state: str, event: str) -> list[tuple[str, object]]:
    """The same pause as a rejected save-time check, but only if THIS run's guarded update left the row in `state` + blocked."""
    p = {"org": org_id, "state": state, "event": event[:400]}
    still = "EXISTS (SELECT 1 FROM merimen_credentials WHERE org_id = %(org)s AND verify_state = %(state)s AND blocked)"
    return [
        (
            f"""UPDATE jobs SET state = 'paused', locked_by = NULL, locked_at = NULL
            WHERE state IN ('queued', 'running') AND step IN ('phase_a', 'phase_b', 'checks')
              AND case_id IN (SELECT id FROM cases WHERE org_id = %(org)s) AND {still}""",
            p,
        ),
        (
            f"""WITH moved AS (
              UPDATE cases SET status = 'waiting_user'
              WHERE org_id = %(org)s AND deleted_at IS NULL AND status IN ('phase_a', 'phase_b', 'checking') AND {still}
              RETURNING id
            )
            INSERT INTO case_events (case_id, step, message) SELECT id, 'login', %(event)s FROM moved""",
            p,
        ),
    ]


def block_statement(org_id: str, state: str, action: str, mail_kind: str | None) -> tuple[str, object]:
    """Guarded stop (G5): only a row that is still 'ok' and not blocked changes. One statement answers (changed, mailed).
    A user who saved the login again during the run is left alone: no pause, no mail."""
    p = {"org": org_id, "state": state, "action": action, "mailed": "relogin_mailed_" + (mail_kind or "none")}
    mail = (
        "m AS (INSERT INTO merimen_cred_audit (org_id, action) SELECT org_id, %(mailed)s FROM upd "
        f"WHERE NOT EXISTS (SELECT 1 FROM merimen_cred_audit WHERE org_id = %(org)s AND action = %(mailed)s AND at > {_LAST_OK}) RETURNING 1)"
        if mail_kind
        else "m AS (SELECT 1 WHERE false)"
    )
    return (
        f"""WITH upd AS (
              UPDATE merimen_credentials SET verify_state = %(state)s, blocked = true, updated_at = now()
              WHERE org_id = %(org)s AND verify_state = 'ok' AND NOT blocked RETURNING org_id
            ),
            a AS (INSERT INTO merimen_cred_audit (org_id, action) SELECT org_id, %(action)s FROM upd RETURNING 1),
            {mail}
            SELECT (SELECT count(*) FROM upd), (SELECT count(*) FROM m)""",
        p,
    )


EVENT_RELOGIN_OTP = "Merimen 需要验证码。请在「连接」页重新保存登录。 / Merimen asked for a code. Save the login again on the Connection page."
EVENT_RELOGIN_UNKNOWN = "Merimen 两次都没有明确回复自动登录。请在「连接」页重新保存登录；我们不会自动再试。 / Merimen twice gave no clear answer to the automatic login. Save the login again on the Connection page. We will not try again automatically."


def relogin_email(kind: str) -> tuple[str, str]:
    """Subject and HTML for the three new kinds. No user name, no password, no address."""
    subject = "Merimen 自动登录 / Merimen automatic login"
    if kind == "relogin_failed":
        body = "已经连续 6 次没有找到 Merimen 登录页，什么都没有输入。请检查工作电脑上的 Chrome。 / 6 tries in a row found no Merimen login page; nothing was typed. Please check the Chrome on the worker computer."
    elif kind == "relogin_unclear":
        body = "Merimen 没有明确回复这次自动登录。24 小时内我们不会再试。如果密码改过，请在「连接」页重新保存。 / Merimen gave no clear answer to the automatic login. We will not try again for 24 hours. If the password changed, save it again on the Connection page."
    elif kind == "otp":
        body = "Merimen 要求输入验证码，自动登录已停止，没有再输入任何东西。请打开「连接」页重新保存登录。 / Merimen asked for a code. The automatic login stopped and nothing more was typed. Open the Connection page and save the login again."
    else:
        raise ValueError("mail kind")
    return subject, f"<p>{body}</p>"


def _send(poster, to: str | None, subject_html: tuple[str, str]) -> None:
    if not (poster and to):
        return
    try:
        poster(to, *subject_html)
    except Exception:  # noqa: BLE001
        return


def _logged_in(info) -> bool:
    from .chrome import is_logged_in_url

    return bool(info) and any(is_logged_in_url(u) for u in (info.get("urls") or []))


def outcome_of(page: dict) -> str:
    """put_back | session_live | ok | unknown | bad_credentials | locked | otp, from what `cdp.mjs login --relogin` printed."""
    if page.get("submitted") is not True:
        if page.get("result") == RESULT_SESSION_LIVE:
            return "session_live"
        return "put_back"  # not_login_page or offline: nothing was typed
    if page.get("offline") or page.get("result"):
        return RESULT_UNKNOWN
    try:
        result = classify_login(url=page.get("url") or "", text=page.get("text") or "",
                                has_password=bool(page.get("has_password")), has_otp=bool(page.get("has_otp")))
    except Exception:  # noqa: BLE001
        return RESULT_UNKNOWN
    return "ok" if result == RESULT_OK else result


def finish(repo, org_id: str, page: dict, *, inspect, port: int, email_to=None, poster=None) -> str:
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
        try:
            probe = inspect(port)  # read only: maybe it did log in and the read-back just missed it
        except Exception:  # noqa: BLE001
            probe = None
        if _logged_in(probe):
            repo.finish_relogin(org_id, _audit(org_id, "relogin_typed", "relogin_ok"))
            return "ok"
        if repo.relogin_unclear_in_a_row(org_id) + 1 >= UNCLEAR_IN_A_ROW:
            # the second unclear answer with no success between: stop like the save-time "unknown" (blocked, paused, existing mail)
            res = repo.finish_relogin(org_id, _audit(org_id, "relogin_typed") + [block_statement(org_id, RESULT_UNKNOWN, "relogin_unclear_stop", None)]
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
        res = repo.finish_relogin(org_id, _audit(org_id, "relogin_typed") + [block_statement(org_id, out, "login_" + out, None)] + _pause(org_id, out, event))
        if _changed(res, 1):
            _send(poster, email_to, login_email(out))
        return out
    if out == RESULT_OTP:
        # never 'otp': the web would show a code box for a tab that is already closed (G3). unknown + blocked, audit relogin_otp.
        res = repo.finish_relogin(org_id, _audit(org_id, "relogin_typed") + [block_statement(org_id, RESULT_UNKNOWN, "relogin_otp", "otp")]
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


def detail_for(org_id: str) -> str | None:
    """relogin_failed (streak) or relogin_capped while that refusal lasts; None otherwise. Shown as the session detail."""
    return _detail.get(org_id)


def log_line(org_id: str, reason: str, *, now=time.monotonic) -> None:
    t = now()
    key = (org_id, reason)
    if key in _logged and t - _logged[key] < LOG_EVERY:
        return
    _logged[key] = t
    print(f"relogin: {reason}", file=sys.stderr, flush=True)


def try_once(cfg, repo, org_id: str, port: int, *, fetch_page, master: bytes, inspect, now=time.monotonic) -> str | None:
    """Book, then (only if booked) type once. None = not asked this time (asked too recently)."""
    from .crypto import open_secret

    t = now()
    if org_id in _asked and t - _asked[org_id] < ATTEMPT_EVERY:
        return None
    _asked[org_id] = t
    try:
        booking = repo.book_relogin(org_id)
    except Exception:  # noqa: BLE001
        log_line(org_id, "db_error", now=now)
        return "db_error"
    if not booking["booked"]:
        reason = booking["reason"]
        if reason == "streak":
            _detail[org_id] = "relogin_failed"
            if booking.get("streak_first") and repo.book_mail(org_id, "relogin_failed"):
                _send(cfg.mailer, repo.owner_email(org_id), relogin_email("relogin_failed"))
        elif reason == "cap":
            if _detail.get(org_id) != "relogin_capped":
                repo._audit(org_id, "relogin_capped")
            _detail[org_id] = "relogin_capped"
        log_line(org_id, reason, now=now)
        return reason
    _detail.pop(org_id, None)
    row = repo.relogin_cred(org_id)
    if not row:
        repo.finish_relogin(org_id, _audit(org_id, "relogin_put_back"))
        return "put_back"
    try:
        user = open_secret(master, org_id, row, "user")
        password = open_secret(master, org_id, row, "pass")
    except Exception:  # noqa: BLE001  (wrong key: Merimen was never asked)
        repo.finish_relogin(org_id, _audit(org_id, "relogin_put_back"))
        log_line(org_id, "key_mismatch", now=now)
        return "put_back"
    try:
        page = fetch_page(user, password, port)
    except Exception:  # noqa: BLE001  (a thrown fetch may have typed: unknown, never put back)
        page = {"result": RESULT_UNKNOWN, "submitted": True}
    del user, password
    try:
        repo.heartbeat(cfg.worker_id, cfg.hf_repo, chrome_ok=True)  # the try can take 90 s; the web must not call the worker gone (G6)
    except Exception:  # noqa: BLE001
        pass
    email = repo.owner_email(org_id)
    out = finish(repo, org_id, page, inspect=inspect, port=port, email_to=email, poster=cfg.mailer)
    print(f"relogin: done_{out}", file=sys.stderr, flush=True)  # one line per real try, fixed words only
    return out


def reset() -> None:
    """For tests: forget the in-process timers."""
    _asked.clear()
    _logged.clear()
    _detail.clear()


__all__ = ["try_once", "finish", "booking_statements", "read_refusal", "relogin_email", "detail_for", "reset", "RESULT_NOT_LOGIN_PAGE"]
