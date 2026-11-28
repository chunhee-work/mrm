"""A step that opens a Merimen page and finds the login form there says so here (owner 2026-11-28, DCD4004): that tab is closed
again by the step, so a look at Chrome after the job may see only the old tab, still on its old page. loop.tick clears the mark
before each job and reads it after. One worker process runs one job at a time."""

from __future__ import annotations

_SEEN: list[bool] = [False]


class LoggedOut(RuntimeError):
    """A step learnt only afterwards that its writes were cut off by the logout (e.g. the photo check read the login form)."""

    code = "not_logged_in"


def mark() -> None:
    _SEEN[0] = True


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
    _SEEN[0] = False


def seen() -> bool:
    return _SEEN[0]
