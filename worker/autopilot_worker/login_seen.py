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


def mark_if_shown(page) -> None:
    """Mark only when the password box is VISIBLE (the login form shows it): a hidden password field on a logged-in page is no
    logout. Same rule as the strict tab pick (__main__._login_box). A page that cannot be asked counts as shown (as before)."""
    try:
        shown = bool(page.locator("input[type=password]").first.is_visible())
    except Exception:  # noqa: BLE001
        shown = True
    if shown:
        mark()


def reset() -> None:
    _SEEN[0] = False


def seen() -> bool:
    return _SEEN[0]
