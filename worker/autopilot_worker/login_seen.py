"""A step that opens a Merimen page and finds the login form there says so here (owner 2026-11-28, DCD4004): that tab is closed
again by the step, so a look at Chrome after the job may see only the old tab, still on its old page. loop.tick clears the mark
before each job and reads it after. One worker process runs one job at a time."""

from __future__ import annotations

_SEEN: list[bool] = [False]


def mark() -> None:
    _SEEN[0] = True


def reset() -> None:
    _SEEN[0] = False


def seen() -> bool:
    return _SEEN[0]
