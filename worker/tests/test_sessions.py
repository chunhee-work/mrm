"""sync_sessions: Chrome is started only when its debugging port does not answer (it used to be started again on every tick)."""
from autopilot_worker import loop
from autopilot_worker.config import Config
from autopilot_worker.loop import sync_sessions

LOGGED_IN = {"urls": ["https://www.merimen.com.my/claims/index.cfm?CFID=1&RID=2"], "has_password": False}


class Repo:
    def __init__(self, rows):
        self.rows, self.sessions = rows, []

    def ensure_sessions(self):
        self.ensured = True

    def wanted(self):
        return self.rows

    def gate(self, org, env_on):
        return "ready"

    def set_session(self, org, **k):
        self.sessions.append((org, k))


def start(org="o1"):
    return {"org_id": org, "account_key": "default", "status": "idle", "wanted": "start", "port": None}


def cfg(tmp_path):
    return Config.from_env({"EXT_CONNECT": "on", "WORKER_STATE": str(tmp_path), "CHROME_BIN": "/usr/bin/true"})


def test_chrome_that_answers_is_not_started_again(tmp_path):
    loop._launched.clear()
    launched, kept = [], []
    repo = Repo([start()])
    for _ in range(5):
        sync_sessions(cfg(tmp_path), repo, launch=launched.append, inspect=lambda port: LOGGED_IN, keep=kept.append)
    assert launched == []
    assert len(kept) == 5 and repo.sessions[-1][1]["status"] == "connected"


def test_chrome_is_started_when_the_port_is_silent_and_not_again_while_it_starts(tmp_path):
    loop._launched.clear()
    t = [100.0]
    launched = []
    repo = Repo([start()])
    for _ in range(5):  # five ticks, 2 s apart: Chrome is still starting
        sync_sessions(cfg(tmp_path), repo, launch=launched.append, inspect=lambda port: None, now=lambda: t[0])
        t[0] += 2
    assert len(launched) == 1
    assert any(a.startswith("--remote-debugging-port=9222") for a in launched[0]) and "--remote-debugging-address=127.0.0.1" in launched[0]
    assert repo.sessions[-1][1]["status"] == "waiting_login" and repo.sessions[-1][1]["detail"] == "not_logged_in"
    t[0] += loop.LAUNCH_WAIT  # still silent after the wait: it did not come up, try once more
    sync_sessions(cfg(tmp_path), repo, launch=launched.append, inspect=lambda port: None, now=lambda: t[0])
    assert len(launched) == 2


def test_two_orgs_on_one_chrome_start_it_once(tmp_path):
    loop._launched.clear()
    launched = []
    sync_sessions(cfg(tmp_path), Repo([start("o1"), start("o2")]), launch=launched.append, inspect=lambda port: None, now=lambda: 5.0)
    assert len(launched) == 1


def test_chrome_that_went_away_is_started_again(tmp_path):
    loop._launched.clear()
    t = [0.0]
    up = [False]
    launched = []
    repo = Repo([start()])

    def tick_():
        sync_sessions(cfg(tmp_path), repo, launch=launched.append, inspect=lambda port: LOGGED_IN if up[0] else None, now=lambda: t[0])
        t[0] += 2

    tick_()
    up[0] = True
    for _ in range(3):
        tick_()
    assert len(launched) == 1
    up[0] = False  # closed or crashed, minutes later
    t[0] += 600
    tick_()
    assert len(launched) == 2
