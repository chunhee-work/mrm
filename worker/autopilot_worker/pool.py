"""WORKER_SLOTS > 1 (plan #150, owner 2026-11-28 "the bot can do few case at the same time, like what our playbook are"):
the main thread keeps the housekeeping and the claim, each claimed job runs in one of `slots` long-lived threads.

Each slot thread has its own copy of the driver (per-job attributes such as `case` and `progress` are never shared) and, through
the page provider, its own Playwright connection; every Merimen step already opens its own tab from the logged-in home tab, the
same "one tab per case" the playbook runs by hand. With WORKER_SLOTS=1 none of this is used: the old one-job tick runs."""

from __future__ import annotations

import copy
import queue
import sys
import threading
import time

MERIMEN_STEPS = ("phase_a", "checks", "phase_b")


class JobPool:
    def __init__(self, slots: int, run, *, make_driver, name: str = "slot", max_seconds: float = 3 * 3600.0, now=time.monotonic):
        """run(job, driver, extra) runs one job to its end (loop.run_job). make_driver() -> a driver for one slot thread.
        A job still running after max_seconds (a hung browser call) frees its slot: a new slot thread takes its place, and the
        hung thread ends when its call returns (its lease already stopped, so the queue has the job back; loop.run_job)."""
        self.slots = max(1, int(slots))
        self._run = run
        self._make_driver = make_driver
        self._name = name
        self._max = float(max_seconds)
        self._now = now
        self._q: queue.Queue = queue.Queue()
        self._lock = threading.Lock()
        self._running: dict[int, dict] = {}  # job id -> job, from submit until its thread is done with it (or gives it up)
        self._started: dict[int, float] = {}
        self._given_up: set[threading.Thread] = set()
        self._thread_of: dict[int, threading.Thread] = {}
        self._n = 0
        for _ in range(self.slots):
            self._spawn()

    def _spawn(self) -> None:
        self._n += 1
        threading.Thread(target=self._loop, name=f"{self._name}-{self._n}", daemon=True).start()

    def _give_up_late(self) -> None:
        late = [jid for jid, t in self._started.items() if self._now() - t > self._max]
        for jid in late:
            job = self._running.pop(jid, None)
            self._started.pop(jid, None)
            th = self._thread_of.pop(jid, None)
            if th is not None:
                self._given_up.add(th)
            print(f"slot job {jid} still running after {int(self._max)} s: its slot is freed", file=sys.stderr, flush=True)
            self._spawn()

    def free(self) -> int:
        with self._lock:
            self._give_up_late()
            return self.slots - len(self._running)

    def running(self) -> list[dict]:
        with self._lock:
            return list(self._running.values())

    def busy_orgs(self) -> set[str]:
        """Orgs with a Merimen step running in this process: their re-login waits for it (loop.sync_sessions)."""
        return {str(j.get("org_id")) for j in self.running() if j.get("step") in MERIMEN_STEPS and j.get("org_id")}

    def submit(self, job: dict, **extra) -> None:
        with self._lock:
            if len(self._running) >= self.slots:
                raise RuntimeError("no free slot")
            self._running[int(job["id"])] = job
            self._started[int(job["id"])] = self._now()
        self._q.put((job, extra))

    def _loop(self) -> None:
        driver = None
        me = threading.current_thread()
        while True:
            job, extra = self._q.get()
            with self._lock:
                if int(job["id"]) in self._running:
                    self._thread_of[int(job["id"])] = me
            try:
                if driver is None:
                    driver = self._make_driver()
                self._run(job, driver, extra)
            except BaseException as e:  # noqa: BLE001  (run_job writes its own outcome; anything that escapes it must not end the slot)
                print(f"slot job {job.get('id')} {job.get('step')} {type(e).__name__}", file=sys.stderr, flush=True)
            finally:
                with self._lock:
                    if self._running.get(int(job["id"])) is job:
                        self._running.pop(int(job["id"]), None)
                        self._started.pop(int(job["id"]), None)
                        self._thread_of.pop(int(job["id"]), None)
                    given_up = me in self._given_up
                    self._given_up.discard(me)
                self._q.task_done()
            if given_up:
                return  # a new slot thread already took this one's place

    def wait_idle(self, timeout: float | None = None) -> bool:
        """Tests: wait until every submitted job is done."""
        end = None if timeout is None else time.monotonic() + timeout
        while self.free() < self.slots:
            if end is not None and time.monotonic() > end:
                return False
            time.sleep(0.01)
        return True


def slot_driver(base):
    """A shallow copy of the main driver for one slot thread. The shared parts (page provider, Jev, the Step 2 reviewer, fetch_bytes)
    are thread-safe; per-job attributes are set on the copy by run_job / handle_job, so two jobs never see each other's case."""
    d = copy.copy(base)
    for attr in ("case", "progress", "profile", "marks", "record", "workshop", "guard"):
        if attr in d.__dict__:
            d.__dict__.pop(attr)
    d.profile = lambda: None
    d.workshop = lambda _lock: None
    d.record = None
    d.marks = None
    return d
