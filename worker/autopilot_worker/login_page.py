"""What a Merimen login page means. The worker reads the page once; it does not try again.

Merimen locks an account after extra failures (locktime=15). A wrong password and a lock
are different results, and a locked page often also contains the word "password", so the
lock is decided first. The page text is never stored.
"""

from __future__ import annotations

import re
from urllib.parse import parse_qs, urlparse

RESULT_OK = "success"
RESULT_BAD = "bad_credentials"
RESULT_LOCKED = "locked"
RESULT_OTP = "otp"
RESULT_UNKNOWN = "unknown"
# Not a result of a try: no Merimen login page was open (for example the tab is already logged in), so nothing was typed.
RESULT_NOT_LOGIN_PAGE = "not_login_page"
# Not a try either: a person is logged in on the worker Chrome (logged-in address, no password box). Nothing was typed; the check
# ends "ok" like a login that went through, and the saved password stays untested (audit: login_session_live).
RESULT_SESSION_LIVE = "session_live"

_LOCKED = (
    "account has been locked",
    "account is locked",
    "account locked",
    "too many failed",
    "too many attempts",
    "locktime",
    "akaun telah dikunci",
    "akaun dikunci",
    "账号已锁定",
    "账户已锁定",
    "帐号已锁定",
)
_OTP = (
    "one-time password",
    "one time password",
    "verification code",
    "enter the code",
    "security code",
    "kod pengesahan",
    "验证码",
    "otp",
    "tac",
)
_BAD = (
    "invalid user",
    "invalid password",
    "wrong password",
    "incorrect password",
    "user id or password",
    "userid or password",
    "username or password",
    "login failed",
    "authentication failed",
    "tidak sah",
    "用户名或密码",
    "密码错误",
)


def _logged_in(url: str) -> bool:
    try:
        u = urlparse(url or "")
    except ValueError:
        return False
    if u.scheme != "https" or u.netloc != "www.merimen.com.my" or not u.path.startswith("/claims/"):
        return False
    q = parse_qs(u.query)
    return bool(q.get("CFID")) and bool(q.get("RID"))


def _has(blob: str, phrases: tuple[str, ...]) -> bool:
    for p in phrases:
        if p in ("otp", "tac"):
            if re.search(rf"\b{p}\b", blob):
                return True
        elif p in blob:
            return True
    return False


def classify_login(*, url: str = "", text: str = "", has_password: bool = False, has_otp: bool = False) -> str:
    """One of success, bad_credentials, locked, otp, unknown. Input text is not copied into the result."""
    blob = (text or "").lower()
    if _has(blob, _LOCKED):
        return RESULT_LOCKED
    if has_otp or _has(blob, _OTP):
        return RESULT_OTP
    if _has(blob, _BAD):
        return RESULT_BAD
    if _logged_in(url) and not has_password:
        return RESULT_OK
    return RESULT_UNKNOWN


# Shown in the case log in both languages. The banner uses the same codes via i18n.
EVENT_BAD = "Merimen 拒绝了登录（用户名或密码不对）。请在「连接」页重新填写。 / Merimen rejected the login (wrong user name or password). Enter it again on the Connection page."
EVENT_LOCKED = "Merimen 已锁定此账号。请先等 Merimen 解锁（或请 Merimen 解锁），确认能登录后再到「连接」页更新登录信息；我们不会再自动尝试。 / Merimen locked this account. Wait until Merimen unlocks it (or ask Merimen to), check that the login works, then update it on the Connection page. We will not try again automatically."
EVENT_OTP = "Merimen 需要验证码。请在连接页输入。 / Merimen needs a verification code. Enter it on the Connection page."
EVENT_OK = "Merimen 登录已通过，暂停的工作会继续。 / Merimen login succeeded. Paused work will continue."
# The form was sent once and the answer could not be read. Not "wrong password": we do not know. Same meaning as the site's own line (w.unknown).
EVENT_UNKNOWN = "Merimen 没有明确回复这次登录。请先确认用户名和密码在 Merimen 能用，再到「连接」页重新保存；我们不会自动再试。 / Merimen did not give a clear answer about this login. Check that the user name and password work on Merimen, then save the login again on the Connection page. We will not try again automatically."


def finish_verify(result: str) -> dict:
    """The one allowed attempt is already spent. Nothing here asks for another try."""
    if result == RESULT_OK:
        return {"verify_state": "ok", "blocked": False, "pause": False, "resume": True, "event": EVENT_OK, "email": None}
    if result == RESULT_OTP:
        return {"verify_state": "otp", "blocked": False, "pause": False, "resume": False, "event": EVENT_OTP, "email": None}
    if result == RESULT_LOCKED:
        return {"verify_state": "locked", "blocked": True, "pause": True, "resume": False, "event": EVENT_LOCKED, "email": "locked"}
    if result == RESULT_BAD:
        return {"verify_state": RESULT_BAD, "blocked": True, "pause": True, "resume": False, "event": EVENT_BAD, "email": "bad_credentials"}
    # anything we cannot read: stop the same way (a retry would feed Merimen's lockout), but do not tell the user the password is wrong.
    return {"verify_state": RESULT_UNKNOWN, "blocked": True, "pause": True, "resume": False, "event": EVENT_UNKNOWN, "email": "unknown"}


def release_verify(reason: str) -> dict:
    """Nothing was typed into Merimen, so the one try is NOT spent: the check goes back to queued. No block, no pause, no mail.
    reason: key_mismatch (the saved login cannot be opened with this worker's MERIMEN_CRED_KEY), not_login_page, offline,
    no_account (no Chrome is set up for this org: WORKER_ACCOUNTS / WORKER_ORG_ACCOUNTS)."""
    return {"verify_state": "queued", "blocked": False, "pause": False, "resume": False, "event": "", "email": None, "release": True, "reason": reason}


def should_login(*, verify_state: str, blocked: bool, session: str) -> bool:
    """Job-time login. False when the last password was rejected or a check is still in progress."""
    if blocked or verify_state != "ok":
        return False
    return session != "connected"


def can_claim_verify(state: str, attempts: int) -> bool:
    """A save queues one check. The conditional update spends it; a second worker sees attempts=1."""
    return state == "queued" and attempts == 0


MERIMEN_STEPS = ("phase_a", "phase_b", "checks")


def pause_ids(jobs: list[dict]) -> list[int]:
    return [j["id"] for j in jobs if j.get("step") in MERIMEN_STEPS and j.get("state") in ("queued", "running")]


def resume_ids(jobs: list[dict]) -> list[int]:
    return [j["id"] for j in jobs if j.get("state") == "paused" and j.get("step") in MERIMEN_STEPS]


def login_email(kind: str) -> tuple[str, str]:
    """Subject and HTML. No user name and no password."""
    subject = "Merimen 登录需要更新 / Merimen login needs an update"
    if kind == "locked":
        body = "Merimen 已锁定此账号。请先等 Merimen 解锁（或请 Merimen 解锁），确认能登录后再打开连接页更新登录信息。在解锁前保存会再试一次密码。我们不会再自动尝试。 / Merimen locked this account. Wait until Merimen unlocks it (or ask Merimen to) and check that the login works, then open the Connection page and update the login. Saving before it is unlocked tries the password again. We will not try again automatically."
    elif kind == "unknown":
        body = "Merimen 没有明确回复这次登录。请先确认用户名和密码在 Merimen 能用，再打开连接页重新保存。我们不会再自动尝试。 / Merimen did not give a clear answer about this login. Check that the user name and password work on Merimen, then open the Connection page and save the login again. We will not try again automatically."
    else:
        body = "Merimen 拒绝了保存的用户名或密码。请打开连接页重新填写。 / Merimen rejected the saved user name or password. Open the Connection page and enter it again."
    html = f"<p>{body}</p>"
    return subject, html


_BACKOFF = (30, 120, 600)


def backoff_seconds(attempts: int) -> int:
    """How long a job that was put back ("try again later") waits before it is claimed again: 30 s after its first try, 2 min after
    the second, 10 min after the third. Long enough for a Chrome restart or a second tab to be sorted out. Transient errors only;
    a rejected password does not use this."""
    return _BACKOFF[min(max(int(attempts), 1), len(_BACKOFF)) - 1]
