import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest  # noqa: E402


@pytest.fixture(autouse=True)
def _fresh_login_seen():
    """The "a step met the login form" mark is per job (loop.tick resets it): every test starts without it."""
    from autopilot_worker import login_seen, loop

    login_seen.reset()
    loop.RELOGIN_HELD.clear()
    yield
    login_seen.reset()
    loop.RELOGIN_HELD.clear()
