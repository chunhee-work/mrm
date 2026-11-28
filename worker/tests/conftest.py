import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest  # noqa: E402


@pytest.fixture(autouse=True)
def _own_lock_dir(tmp_path, monkeypatch):
    """The per-Chrome lock files of a test go to its own folder, never the machine's temp folder (a test run on the worker machine
    must not hold or leave the live worker's lock file, egm r12)."""
    (tmp_path / "_worker_locks").mkdir(exist_ok=True)
    monkeypatch.setenv("WORKER_LOCK_DIR", str(tmp_path / "_worker_locks"))


@pytest.fixture(autouse=True)
def _fresh_login_seen():
    """The "a step met the login form" mark is per job (loop.tick resets it): every test starts without it. The slots module state
    (#150) is reset too, so a test that fails half way never leaks it into the next one (egm r11)."""
    from autopilot_worker import __main__ as main_mod
    from autopilot_worker import case_guard, login_seen, loop, pool, relogin

    def _slots_state():
        loop._busy_since.clear()
        loop._verify_wait.clear()
        loop.RELOGIN_OK.clear()
        main_mod.STEP_TABS.clear()
        main_mod._step_tabs_dir[0] = ""
        case_guard._MINE.st.update(on=False, ids=frozenset(), job="", bad=False)
        case_guard.FUSE.clear()
        case_guard._ON_USE[0] = None
        main_mod._job_tabs.pages = []
        pool._CURRENT.job = None

    _slots_state()
    login_seen.reset()
    relogin.reset()
    loop.RELOGIN_HELD.clear()
    loop.FORCE_RELOGIN.clear()
    loop.HELD_PAUSED.clear()
    loop.ORG_PUTBACKS.clear()
    loop.HOLD_KIND.clear()
    loop._noted.clear()
    yield
    login_seen.reset()
    loop.RELOGIN_HELD.clear()
    loop.FORCE_RELOGIN.clear()
    loop.HELD_PAUSED.clear()
    loop.ORG_PUTBACKS.clear()
    loop.HOLD_KIND.clear()
    loop._noted.clear()
    relogin.reset()
    _slots_state()
