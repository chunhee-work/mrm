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


class CaseMismatch(BaseException):
    """A BaseException on purpose: the steps' own `except Exception` handlers (a retry later) never swallow it. run_job ends the job
    for a person (failed, waiting_user, case_mismatch)."""


class _Mine(threading.local):
    """One state dict per job thread. It is changed in place, so a page guarded in this thread (and the Playwright event handlers
    of that page, whichever thread runs them) always sees this thread's current job."""

    def __init__(self):
        self.st = {"on": False, "ids": frozenset(), "job": "", "bad": False}


_MINE = _Mine()


def start(merimen_caseid, job_id="") -> None:
    """A job starts in this thread: its own case id (None before the create)."""
    _MINE.st.update(on=True, job=str(job_id or ""), bad=False,
                    ids=frozenset({str(merimen_caseid)}) if merimen_caseid else frozenset())


def add(merimen_caseid) -> None:
    """The create recorded the new case's id: from now on only that case may be opened."""
    if merimen_caseid:
        _MINE.st["ids"] = _MINE.st["ids"] | {str(merimen_caseid)}


def stop() -> None:
    _MINE.st.update(on=False, ids=frozenset())


def mismatched() -> bool:
    """A tab of this job (a click, a redirect, a popup) landed on another Merimen case during the job."""
    return bool(_MINE.st.get("bad"))


def _other(st: dict, url: str) -> bool:
    if not st.get("on") or not st.get("ids"):
        return False
    m = _CASEID.search(url or "")
    return bool(m and m.group(1) not in st["ids"])


def _flag(st: dict) -> None:
    if not st.get("bad"):
        st["bad"] = True
        print(f"{threading.current_thread().name} job {st.get('job')} case_mismatch: a step tab was sent to another Merimen case, stopped",
              file=sys.stderr, flush=True)


def check(url: str, st: dict | None = None) -> None:
    """Raises CaseMismatch when the address opens another Merimen case than this job's own (or a tab of the job already did)."""
    st = _MINE.st if st is None else st
    if _other(st, url):
        _flag(st)
    if st.get("on") and st.get("bad"):
        raise CaseMismatch("case_mismatch")


_FREE = frozenset({"url", "is_closed", "close"})  # reading the address, closing the tab: never stopped


class _Guarded:
    """A step tab as the step sees it (GPR-150-4 G3). Before every use of the tab (goto, click, a locator, a popup wait...) its
    current address is checked, so a click, a form post or a redirect that landed on another case stops the next action; a goto is
    also checked before it opens. Navigations of the tab and of its popups are watched as they happen and mark the job, so run_job
    ends it as case_mismatch even when the step had nothing left to do."""

    def __init__(self, real, st):
        object.__setattr__(self, "_real", real)
        object.__setattr__(self, "_st", st)

    def __getattr__(self, name):
        real, st = self._real, self._st
        if name not in _FREE:
            check(getattr(real, "url", "") or "", st)
        if name == "goto":
            def goto(url, *a, **k):
                check(url, st)
                r = real.goto(url, *a, **k)
                check(getattr(real, "url", "") or "", st)
                return r

            return goto
        return getattr(real, name)

    def __setattr__(self, name, value):
        setattr(self._real, name, value)


def _watch(pg, st) -> None:
    """Mark the job when this tab, or a popup it opens, lands on another case (no exception in an event handler: it is marked)."""
    on = getattr(pg, "on", None)
    if on is None:
        return

    def nav(frame):
        try:
            if getattr(frame, "parent_frame", None) is None and _other(st, getattr(frame, "url", "")):
                _flag(st)
        except Exception:  # noqa: BLE001
            pass

    def popup(p):
        try:
            if _other(st, getattr(p, "url", "")):
                _flag(st)
            _watch(p, st)
        except Exception:  # noqa: BLE001
            pass

    try:
        on("framenavigated", nav)
        on("popup", popup)
    except Exception:  # noqa: BLE001
        pass


def guard_page(pg):
    """The step tab, checked on every use (see _Guarded). An object without goto is returned as it is."""
    if getattr(pg, "goto", None) is None:
        return pg
    st = _MINE.st
    _watch(pg, st)
    return _Guarded(pg, st)
