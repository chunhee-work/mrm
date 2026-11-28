"""One Merimen login check. The password is handed to `fetch_page` and nowhere else.

ONE try means: once the login form may have been sent, the check is never put back in the queue by the worker. It is put back only
when nothing was typed into Merimen: the saved login could not be opened (key_mismatch), no Merimen login page was open
(not_login_page), Chrome or the script could not be reached before the form was sent (offline), or the org has no Chrome (no_account).

A tab where a person is already logged in (session_live) is not a try either: nothing is typed, the check ends "ok" like a login
that went through, and the audit says the saved password was NOT tested."""

from __future__ import annotations

import json
import os
import subprocess

from .crypto import open_secret
from .login_page import RESULT_NOT_LOGIN_PAGE, RESULT_OK, RESULT_SESSION_LIVE, RESULT_UNKNOWN, classify_login, finish_verify, release_verify

_OFFLINE = {"offline": True, "submitted": False}
_SENT_UNREAD = {"result": RESULT_UNKNOWN, "submitted": True}


def page_result(page: dict) -> str:
    """One reading of what `cdp.mjs login` printed, shared by the save-time check and the re-login:
    session_live / not_login_page / offline (nothing typed), or a classify_login result (the form was sent)."""
    if page.get("submitted") is not True:
        if page.get("result") == RESULT_SESSION_LIVE and page.get("submitted") is False:
            return RESULT_SESSION_LIVE
        return RESULT_NOT_LOGIN_PAGE if page.get("result") == RESULT_NOT_LOGIN_PAGE else "offline"
    if page.get("offline") or page.get("result"):  # sent, and the answer was not read
        return RESULT_UNKNOWN
    try:
        return classify_login(
            url=page.get("url") or "",
            text=page.get("text") or "",
            has_password=bool(page.get("has_password")),
            has_otp=bool(page.get("has_otp")),
        )
    except Exception:  # noqa: BLE001
        return RESULT_UNKNOWN


def run_verify(row: dict, master: bytes, fetch_page) -> dict:
    """fetch_page(username, password) is called once. A thrown fetch is an unknown page, not a second try."""
    try:
        user = open_secret(master, row["org_id"], row, "user")
        password = open_secret(master, row["org_id"], row, "pass")
    except Exception:  # noqa: BLE001  (wrong key or a damaged row: Merimen was never asked, so this is not a rejected password)
        return release_verify("key_mismatch")
    try:
        result = page_result(fetch_page(user, password))
    except Exception:  # noqa: BLE001
        result = RESULT_UNKNOWN
    if result == RESULT_SESSION_LIVE:
        # a person is logged in on the worker Chrome: the same outcome a successful login had (ok, no block, no mail, paused
        # work goes on), but no password try was made; store.finish_verify gives the try back and audits login_session_live
        return {**finish_verify(RESULT_OK), "session_live": True}
    if result in (RESULT_NOT_LOGIN_PAGE, "offline"):
        # nothing was typed, and nothing else is concluded from a page that was only looked at: never "bad password"
        return release_verify(result)
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
        if isinstance(obj, dict) and set(obj) != {"relogin_target"}:  # the re-login tab id is not a result
            lines.append(obj)
    marked = any(o.get("submitted") is True for o in lines)
    final = next((o for o in reversed(lines) if set(o) - {"submitted"}), None)
    if final is None:
        return dict(_SENT_UNREAD) if marked else dict(_OFFLINE)
    submitted = (final["submitted"] is True) if "submitted" in final else marked
    if not submitted:
        if final.get("result") == RESULT_NOT_LOGIN_PAGE:
            return {"result": RESULT_NOT_LOGIN_PAGE, "submitted": False}
        if final.get("result") == RESULT_SESSION_LIVE:
            # only believed when the script never wrote its mark; with the mark it contradicts itself and the safe reading is "sent"
            return dict(_SENT_UNREAD) if marked else {"result": RESULT_SESSION_LIVE, "submitted": False}
        return dict(_OFFLINE)
    if final.get("result") or final.get("offline") or final.get("error") or not isinstance(final.get("url"), str):
        return dict(_SENT_UNREAD)
    return {"submitted": True, "url": final["url"], "text": str(final.get("text") or ""), "has_password": bool(final.get("has_password")), "has_otp": bool(final.get("has_otp"))}


def run_script(argv: list[str], payload: str, env: dict, timeout: float, popen=subprocess.Popen) -> tuple[str | None, bool]:
    """(everything the script wrote to stdout, timed_out). On a time-out the script is killed and the pipe is then read to its end,
    so a line written just before the deadline is not lost (subprocess.run does not read again after the kill on Linux).
    None = it timed out and its output could not be read at all."""
    proc = popen(argv, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True, env=env)
    try:
        out, _ = proc.communicate(payload, timeout=timeout)
        return out, False
    except subprocess.TimeoutExpired:
        proc.kill()
        try:
            out, _ = proc.communicate(timeout=15)
        except Exception:  # noqa: BLE001
            return None, True
        return out, True


def script_fetch(script: str, *, popen=subprocess.Popen, timeout: float = 90, node: str = "node", args=("login",), env_for=None, on_timeout=None):
    """fetch_page(user, password, port) for the loop: ONE run of `node cdp.mjs login` against the Chrome on `port`, the login on
    stdin. A time-out or a script that cannot start is never followed by a second run. What it printed before it stopped decides:
    no "submitted" mark = offline (nothing typed), mark = unknown (maybe sent). A timed-out script whose output cannot be read is
    unknown too, never put back."""

    def fetch_page(user: str, password: str, port: int) -> dict:
        env = env_for(port) if env_for else {**os.environ, "CDP_PORT": str(int(port))}
        try:
            out, timed_out = run_script([node, script, *args], json.dumps({"username": user, "password": password}), env, timeout, popen)
        except OSError:  # node is not installed or cannot start: nothing ran
            return dict(_OFFLINE)
        if timed_out and on_timeout:
            on_timeout(port, out)
        if out is None:
            return dict(_SENT_UNREAD)
        return read_login_output(out)

    return fetch_page


# ---- re-login (MERIMEN_RELOGIN, plan #133) ----
_CHILD_ENV = ("PATH", "HOME", "LANG", "TZ", "NODE_EXTRA_CA_CERTS")  # an exact list, no wildcard (D6)


def relogin_env(environ, port: int) -> dict:
    """The small env the re-login child gets: never MERIMEN_CRED_KEY, DATABASE_URL or any other worker key (G8)."""
    env = {k: environ[k] for k in _CHILD_ENV if k in environ}
    env["CDP_PORT"] = str(int(port))
    env["MERIMEN_LOGIN"] = "on"  # cdp.mjs refuses `login` without it; the caller only runs this with MERIMEN_LOGIN=on
    return env


def relogin_target(stdout) -> str | None:
    """The id of the tab cdp.mjs opened for this try (its first line), so a killed script's tab can still be closed."""
    if isinstance(stdout, bytes):
        stdout = stdout.decode("utf-8", "replace")
    for raw in (stdout or "").splitlines():
        try:
            obj = json.loads(raw)
        except ValueError:
            continue
        if isinstance(obj, dict) and isinstance(obj.get("relogin_target"), str):
            return obj["relogin_target"][:80]
    return None


def close_target(port: int, target: str) -> None:
    """Close ONE tab by its id (the re-login's own). Never any other tab."""
    from urllib.parse import quote
    from urllib.request import urlopen

    try:
        with urlopen(f"http://127.0.0.1:{int(port)}/json/close/{quote(target, safe='')}", timeout=5):
            pass
    except Exception:  # noqa: BLE001
        pass


def close_kept_tab(port: int, target: str, *, opener=None) -> bool:
    """Close the tab a past successful re-login kept, but only while it is still a Merimen claims page that is not logged in
    (its session ended). A logged-in tab, any other site, or a tab that is gone is left alone. The address is never logged."""
    from urllib.request import urlopen

    from .chrome import is_logged_in_url

    opener = opener or urlopen
    try:
        with opener(f"http://127.0.0.1:{int(port)}/json/list", timeout=5) as r:
            tabs = json.loads(r.read() or b"[]")
    except Exception:  # noqa: BLE001
        return False
    for t in tabs if isinstance(tabs, list) else []:
        if isinstance(t, dict) and str(t.get("id")) == str(target):
            url = str(t.get("url") or "")
            if url.startswith("https://www.merimen.com.my/claims/") and not is_logged_in_url(url):
                close_target(port, str(target))
                return True
            return False
    return False


def relogin_fetch(script: str, *, popen=subprocess.Popen, timeout: float = 90, node: str = "node", environ=None, closer=close_target):
    """fetch_page(user, password, port) for a re-login: ONE run of `node cdp.mjs login --relogin`, login on stdin, a small env.
    A time-out kills the script; its own tab is then closed by id (D5). Same reading of the output as the save-time check."""

    seen: dict = {}

    def capture(popen_):
        # keeps the raw output so the tab id can be read; nothing here is logged
        def run(*a, **k):
            proc = popen_(*a, **k)
            real = proc.communicate

            def communicate(*ca, **ck):
                out, err = real(*ca, **ck)
                seen["out"] = (seen.get("out") or "") + (out or "")
                return out, err

            proc.communicate = communicate
            return proc
        return run

    def timed_out(port, out):
        target = relogin_target(out) or relogin_target(seen.get("out"))
        if target:
            closer(port, target)

    inner = script_fetch(script, popen=capture(popen), timeout=timeout, node=node, args=("login", "--relogin"),
                         env_for=lambda port: relogin_env(os.environ if environ is None else environ, port), on_timeout=timed_out)

    def fetch_page(user: str, password: str, port: int) -> dict:
        seen.clear()
        page = inner(user, password, port)
        target = relogin_target(seen.get("out"))
        return {**page, "relogin_target": target} if target else page

    return fetch_page
