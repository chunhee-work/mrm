"""Linux Chrome for one Merimen login per profile. No Keychain, no AppleScript, no password typing."""

from __future__ import annotations

import os
import shutil
from urllib.parse import parse_qs, urlparse


MERIMEN_START = "https://www.merimen.com.my/claims/index.cfm"


def is_logged_in_url(raw: str) -> bool:
    """Same rule as web `isLoggedInUrl`: /claims/ address with CFID and RID. The address is a secret; callers must not log it."""
    try:
        u = urlparse(raw)
    except ValueError:
        return False
    if u.scheme != "https" or u.netloc != "www.merimen.com.my" or not u.path.startswith("/claims/"):
        return False
    q = parse_qs(u.query)
    return bool(q.get("CFID")) and bool(q.get("RID"))


def next_status(prev: str, logged_in: bool) -> str:
    if logged_in:
        return "connected"
    return "expired" if prev == "connected" else "waiting_login"


def redact_url(raw: str) -> str:
    """Drop the query string. Session marks live there and must not be stored or logged."""
    base = (raw or "").split("?", 1)[0]
    return base[:200]


def chrome_argv(binary: str, port: int, profile: str) -> list[str]:
    if not binary or binary.startswith("/Users/"):
        raise ValueError("chrome binary")
    if not 1024 <= port <= 65535:
        raise ValueError("port")
    if not profile.startswith("/") or profile.startswith("/Users/") or ".." in profile.split("/"):
        raise ValueError("profile")
    return [
        binary,
        f"--remote-debugging-port={port}",
        "--remote-debugging-address=127.0.0.1",
        f"--user-data-dir={profile}",
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-gpu",
        "--disable-dev-shm-usage",
        *(["--no-sandbox"] if os.environ.get("CHROME_NO_SANDBOX") == "on" else []),
        MERIMEN_START,
    ]


def chrome_running(profile: str) -> bool:
    """True while a Chrome process holds this profile. Chrome keeps a `SingletonLock` link in the profile folder pointing at
    "<host>-<pid>"; a lock whose process is gone (a crash) does not count. Starting Chrome again on a profile that is in use only
    opens one more tab in the running Chrome (item 8, 2026-11-27: 21 claims tabs and climbing)."""
    lock = os.path.join(profile, "SingletonLock")
    try:
        target = os.readlink(lock)
    except OSError:
        return False
    pid = target.rsplit("-", 1)[-1]
    if not pid.isdigit():
        return True  # a lock we cannot read: assume Chrome is there rather than open another tab
    try:
        os.kill(int(pid), 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    return True


def profile_dir(state_dir: str, account: str) -> str:
    if state_dir.startswith("/Users/") or not account or "/" in account or ".." in account:
        raise ValueError("profile")
    return os.path.join(state_dir, "chrome", account)


def login_notice(state_dir: str, run=shutil.which) -> str:
    """Tell a person at the machine. Never asks them to put a password in a file."""
    path = os.path.join(state_dir, "NEED_LOGIN")
    os.makedirs(state_dir, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write("log in yourself in the worker Chrome\n")
    if run("notify-send"):
        return "notify-send"
    return path
