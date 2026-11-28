"""Which Merimen case a job thread may open (WORKER_SLOTS > 1, plan #150 GPR-150-3 G1).

Several jobs run side by side, each in its own tab. Every address a job's step tab is sent to is checked here: an address with a
Merimen `caseid=` that is not this job's own case stops the step before anything is done on that page (CaseMismatch, a job
error). The job's own case = the case's saved Merimen case id, plus the one its create records. A case without one yet (the create
itself) is not checked: it has no case id to mix up."""

from __future__ import annotations

import re
import sys
import threading

_CASEID = re.compile(r"[?&]caseid=(\d+)", re.I)


class CaseMismatch(RuntimeError):
    pass


class _Mine(threading.local):
    ids: frozenset = frozenset()
    on: bool = False


_MINE = _Mine()


def start(merimen_caseid) -> None:
    """A job starts in this thread: its own case id (None before the create)."""
    _MINE.on = True
    _MINE.ids = frozenset({str(merimen_caseid)}) if merimen_caseid else frozenset()


def add(merimen_caseid) -> None:
    """The create recorded the new case's id: from now on only that case may be opened."""
    if merimen_caseid:
        _MINE.ids = _MINE.ids | {str(merimen_caseid)}


def stop() -> None:
    _MINE.on, _MINE.ids = False, frozenset()


def check(url: str) -> None:
    """Raises CaseMismatch when the address opens another Merimen case than this job's own."""
    if not _MINE.on or not _MINE.ids:
        return
    m = _CASEID.search(url or "")
    if m and m.group(1) not in _MINE.ids:
        print(f"{threading.current_thread().name} case_mismatch: a step tab was sent to another Merimen case, stopped", file=sys.stderr, flush=True)
        raise CaseMismatch("case_mismatch")


def guard_page(pg):
    """Every goto of this step tab is checked first, and the address it lands on after it."""
    real = getattr(pg, "goto", None)
    if real is None:
        return pg

    def goto(url, *a, **k):
        check(url)
        r = real(url, *a, **k)
        check(getattr(pg, "url", "") or "")
        return r

    try:
        pg.goto = goto
    except Exception:  # noqa: BLE001  (an object that takes no attribute: unchecked, as before)
        pass
    return pg
