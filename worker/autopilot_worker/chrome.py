"""Linux Chrome for one Merimen login per profile. No Keychain, no AppleScript, no password typing."""

from __future__ import annotations

import os
import re
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


# What Chrome gets from the worker's environment. Everything else (DATABASE_URL, MERIMEN_CRED_KEY, the Blob, Hugging Face and
# mail keys, ...) stays in the worker: a browser that opens web pages has no use for them.
# - PATH, HOME, USER, LOGNAME, SHELL, TMPDIR: to start at all.
# - DISPLAY, XAUTHORITY, WAYLAND_DISPLAY: the screen.
# - XDG_RUNTIME_DIR, DBUS_SESSION_BUS_ADDRESS and the desktop names: the Wayland socket lives in the runtime folder, and Chrome
#   reaches the desktop key store over the session bus. It picks the store from the desktop names; with them gone it would fall
#   back to another store and could no longer read the cookies of the profile that is logged in.
# - LANG, LANGUAGE, LC_*, TZ: language and time. FONTCONFIG_*: fonts.
# - the proxy variables: on a box that reaches the internet through a proxy Chrome needs them too (auto_proxy = a PAC file,
#   SOCKS_SERVER / SOCKS_VERSION = a SOCKS proxy).
# - CHROMIUM_FLAGS: some distro start scripts for Chromium read their extra flags from it.
_CHROME_ENV = (
    "PATH", "HOME", "USER", "LOGNAME", "SHELL", "TMPDIR",
    "DISPLAY", "XAUTHORITY", "WAYLAND_DISPLAY",
    "DBUS_SESSION_BUS_ADDRESS", "DESKTOP_SESSION", "GNOME_DESKTOP_SESSION_ID", "KDE_FULL_SESSION", "KDE_SESSION_VERSION",
    "LANG", "LANGUAGE", "TZ", "FONTCONFIG_FILE", "FONTCONFIG_PATH",
    "http_proxy", "https_proxy", "no_proxy", "all_proxy", "HTTP_PROXY", "HTTPS_PROXY", "NO_PROXY", "ALL_PROXY",
    "auto_proxy", "AUTO_PROXY", "SOCKS_SERVER", "SOCKS_VERSION", "CHROMIUM_FLAGS",
)
_CHROME_ENV_PREFIX = ("XDG_", "LC_")
_ENV_NAME = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")
_ENV_SECRET = re.compile(r"KEY|TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIAL|COOKIE|DATABASE_URL", re.I)


def chrome_env(environ) -> dict[str, str]:
    """The environment Chrome is started with: the short list above, plus the names in CHROME_ENV_PASS (comma separated; for a box
    whose Chrome needs one more, e.g. LD_LIBRARY_PATH). A name that looks like a secret is never passed, listed or not."""
    extra = [n.strip() for n in (environ.get("CHROME_ENV_PASS") or "").split(",")]
    env: dict[str, str] = {}
    for name in _CHROME_ENV:
        if name in environ:
            env[name] = environ[name]
    for name, value in environ.items():
        if name in env or not _ENV_NAME.match(name) or _ENV_SECRET.search(name):
            continue
        if name.startswith(_CHROME_ENV_PREFIX) or name in extra:
            env[name] = value
    return env


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


def clear_login_notice(state_dir: str) -> None:
    """Remove an old hand-login notice: with re-login active nobody is asked to log in by hand."""
    try:
        os.remove(os.path.join(state_dir, "NEED_LOGIN"))
    except FileNotFoundError:
        pass


def login_notice(state_dir: str, run=shutil.which) -> str:
    """Tell a person at the machine. Never asks them to put a password in a file."""
    path = os.path.join(state_dir, "NEED_LOGIN")
    os.makedirs(state_dir, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write("log in yourself in the worker Chrome\n")
    if run("notify-send"):
        return "notify-send"
    return path
