"""Item 8 (2026-11-27): the worker started Chrome on every pass, and each start on a profile that is already open adds one claims tab."""
import os
import tempfile

from autopilot_worker import loop
from autopilot_worker.chrome import chrome_running
from autopilot_worker.config import Config
from autopilot_worker.loop import sync_sessions

LOGGED = {"urls": ["https://www.merimen.com.my/claims/index.cfm?fusebox=MTRroot&fuseaction=dsp_home&CFID=1&CFTOKEN=2&USID=3&RID=4"], "has_password": False}


class Repo:
    def __init__(self):
        self.sessions = []

    def ensure_sessions(self):
        return []

    def wanted(self):
        return [{"org_id": "o1", "account_key": "default", "status": "idle", "wanted": "start", "port": None}]

    def gate(self, org, env_on):
        return "ready"

    def set_session(self, org, **k):
        self.sessions.append(k)


def run(passes, answers, *, running=lambda _p: False, clock=None):
    loop._launched.clear()
    cfg = Config.from_env({"EXT_CONNECT": "on", "WORKER_STATE": tempfile.mkdtemp(prefix="wstate-")})  # writable without root (CI)
    launches, repo = [], Repo()
    t = {"now": 0.0}
    for i in range(passes):
        sync_sessions(cfg, repo, launch=launches.append, inspect=lambda _port: answers(i), keep=lambda _p: None,
                      now=lambda: t["now"], running=running)
        t["now"] += clock or 2.0
    return launches, repo


def test_a_chrome_that_answers_is_never_started_again():
    launches, repo = run(50, lambda _i: LOGGED)
    assert launches == []
    assert repo.sessions[-1]["status"] == "connected"


def test_a_silent_port_starts_chrome_once_then_waits_for_it():
    launches, _ = run(10, lambda i: None if i < 5 else LOGGED)  # 10 s before the port answers: one start, not five
    assert len(launches) == 1


def test_a_chrome_that_holds_the_profile_is_not_started_even_if_the_port_is_slow():
    launches, _ = run(20, lambda _i: None, running=lambda _p: True)
    assert launches == []


def test_a_port_that_never_answers_is_retried_only_every_30_seconds():
    launches, _ = run(60, lambda _i: None)  # 2 min of 2 s passes
    assert len(launches) == 4


def test_chrome_running_reads_the_profile_lock(tmp_path):
    p = str(tmp_path)
    assert not chrome_running(p)
    os.symlink(f"box-{os.getpid()}", os.path.join(p, "SingletonLock"))
    assert chrome_running(p)
    os.remove(os.path.join(p, "SingletonLock"))
    os.symlink("box-999999999", os.path.join(p, "SingletonLock"))  # a crashed Chrome's lock does not count
    assert not chrome_running(p)
