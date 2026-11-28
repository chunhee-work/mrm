"""A step that opens a Merimen page and finds the login form there says so here (owner 2026-11-28, DCD4004): that tab is closed
again by the step, so a look at Chrome after the job may see only the old tab, still on its old page. loop.tick clears the mark
before each job and reads it after. With WORKER_SLOTS > 1 each job runs in its own thread, so the mark is per thread (plan #150)."""

from __future__ import annotations

import threading


class _Seen(threading.local):
    def __init__(self):
        self.on = False


_SEEN = _Seen()


class LoggedOut(RuntimeError):
    """A step learnt only afterwards that its writes were cut off by the logout (e.g. the photo check read the login form)."""

    code = "not_logged_in"


def mark() -> None:
    _SEEN.on = True


def shown(page) -> bool:
    """The page shows a VISIBLE password box (Merimen's login form). A hidden password field on a logged-in page is no logout. A
    page that cannot be asked here (it was already found to hold a password field) counts as shown: the step stops either way."""
    try:
        return bool(page.locator("input[type=password]").first.is_visible())
    except Exception:  # noqa: BLE001
        return True


def mark_if_shown(page) -> bool:
    """Mark when `shown`; says whether it did."""
    got = shown(page)
    if got:
        mark()
    return got


def reset() -> None:
    _SEEN.on = False


def seen() -> bool:
    return _SEEN.on
