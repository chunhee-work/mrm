"""One Merimen login check. The password is handed to `fetch_page` and nowhere else.

ONE try means: once the login form may have been sent, the check is never put back in the queue by the worker. Only three things put
it back, and in all three nothing was typed into Merimen: the saved login could not be opened (key_mismatch), no Merimen login page
was open (not_login_page), Chrome or the script could not be reached before the form was sent (offline)."""

from __future__ import annotations

import json
import os
import subprocess

from .crypto import open_secret
from .login_page import RESULT_NOT_LOGIN_PAGE, RESULT_UNKNOWN, classify_login, finish_verify, release_verify

_OFFLINE = {"offline": True, "submitted": False}
_SENT_UNREAD = {"result": RESULT_UNKNOWN, "submitted": True}


def run_verify(row: dict, master: bytes, fetch_page) -> dict:
    """fetch_page(username, password) is called once. A thrown fetch is an unknown page, not a second try."""
    try:
        user = open_secret(master, row["org_id"], row, "user")
        password = open_secret(master, row["org_id"], row, "pass")
    except Exception:  # noqa: BLE001  (wrong key or a damaged row: Merimen was never asked, so this is not a rejected password)
        return release_verify("key_mismatch")
    try:
        page = fetch_page(user, password)
        if page.get("submitted") is not True:
            # nothing was typed, so nothing is concluded from the page: never "ok" (a tab that is already logged in), never "bad password"
            return release_verify(RESULT_NOT_LOGIN_PAGE if page.get("result") == RESULT_NOT_LOGIN_PAGE else "offline")
        if page.get("offline") or page.get("result"):  # sent, and the answer was not read
            result = RESULT_UNKNOWN
        else:
            result = classify_login(
                url=page.get("url") or "",
                text=page.get("text") or "",
                has_password=bool(page.get("has_password")),
                has_otp=bool(page.get("has_otp")),
            )
    except Exception:  # noqa: BLE001
        result = RESULT_UNKNOWN
    return finish_verify(result)


def read_login_output(stdout) -> dict:
    """What `cdp.mjs login` printed -> one page dict for run_verify. The script prints {"submitted": true} on its own line BEFORE it
    types, then one last line with the result. A script that stopped (time-out, crash) is "offline" before that mark and "unknown,
    submitted" after it. Nothing here is logged; the lines never hold the password."""
    if isinstance(stdout, bytes):
        stdout = stdout.decode("utf-8", "replace")
    lines = []
    for raw in (stdout or "").splitlines():
        try:
            obj = json.loads(raw)
        except ValueError:
            continue
        if isinstance(obj, dict):
            lines.append(obj)
    marked = any(o.get("submitted") is True for o in lines)
    final = next((o for o in reversed(lines) if set(o) - {"submitted"}), None)
    if final is None:
        return dict(_SENT_UNREAD) if marked else dict(_OFFLINE)
    submitted = (final["submitted"] is True) if "submitted" in final else marked
    if not submitted:
        if final.get("result") == RESULT_NOT_LOGIN_PAGE:
            return {"result": RESULT_NOT_LOGIN_PAGE, "submitted": False}
        return dict(_OFFLINE)
    if final.get("result") or final.get("offline") or final.get("error") or not isinstance(final.get("url"), str):
        return dict(_SENT_UNREAD)
    return {"submitted": True, "url": final["url"], "text": str(final.get("text") or ""), "has_password": bool(final.get("has_password")), "has_otp": bool(final.get("has_otp"))}


def script_fetch(script: str, port: int, *, run=subprocess.run, timeout: int = 60):
    """fetch_page for run_verify: ONE run of `node cdp.mjs login`, the login on stdin. A time-out or a script that cannot start is
    never followed by a second run; what was printed before it stopped decides offline (nothing typed) or unknown (maybe sent)."""

    def fetch_page(user: str, password: str) -> dict:
        try:
            proc = run(
                ["node", script, "login"],
                input=json.dumps({"username": user, "password": password}),
                text=True, capture_output=True, timeout=timeout,
                env={**os.environ, "CDP_PORT": str(port)},
            )
        except subprocess.TimeoutExpired as e:
            return read_login_output(e.stdout)
        except OSError:  # node is not installed or cannot start: nothing ran
            return dict(_OFFLINE)
        return read_login_output(proc.stdout)

    return fetch_page
