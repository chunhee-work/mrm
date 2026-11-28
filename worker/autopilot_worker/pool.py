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

MERIMEN_STEPS = ("phase_a", "phase_b")  # the jobs that drive Merimen tabs; the `checks` job only waits (loop.PHASE_STEPS)
_CURRENT = threading.local()  # the job this slot thread runs


def create_done() -> None:
    """Called by the create step once it let the create lock go: this slot's Phase A goes on with the report, documents and
    photos, and the claim may take the next create beside it (no `no_create` for the whole Phase A)."""
    job = getattr(_CURRENT, "job", None)
    if job is not None:
        job["create_done"] = True


class JobPool:
    def __init__(self, slots: int, run, *, make_driver, name: str = "slot", warn_seconds: float = 3 * 3600.0, now=time.monotonic):
        """run(job, driver, extra) runs one job to its end (loop.run_job). make_driver() -> a driver for one slot thread.
        A job still running after warn_seconds keeps its slot and its lease (a hung call is never cut off or run a second time: a
        step in Merimen could then be done twice); one stderr line per such job says so. The other slots go on."""
        self.slots = max(1, int(slots))
        self._run = run
        self._make_driver = make_driver
        self._name = name
        self._max = float(warn_seconds)
        self._now = now
        self._q: queue.Queue = queue.Queue()
        self._lock = threading.Lock()
        self._running: dict[int, dict] = {}  # job id -> job, from submit until its thread is done with it (or gives it up)
        self._started: dict[int, float] = {}
        self._warned: set[int] = set()
        self._n = 0
        for _ in range(self.slots):
            self._spawn()

    def _spawn(self) -> None:
        self._n += 1
        threading.Thread(target=self._loop, name=f"{self._name}-{self._n}", daemon=True).start()

    def _warn_late(self) -> None:
        for jid, t in self._started.items():
            if jid not in self._warned and self._now() - t > self._max:
                self._warned.add(jid)
                job = self._running.get(jid) or {}
                print(f"slot job {jid} {job.get('step')} still running after {int(self._max)} s (it keeps its slot)", file=sys.stderr, flush=True)

    def free(self) -> int:
        with self._lock:
            self._warn_late()
            return self.slots - len(self._running)

    def running(self) -> list[dict]:
        with self._lock:
            return list(self._running.values())

    def has(self, job_id) -> bool:
        """This job is still running in a slot of this process (a claim after a lost lease must not start it a second time)."""
        with self._lock:
            return int(job_id) in self._running

    def create_running(self) -> bool:
        """A claimed create (Phase A of a case with no Merimen case yet) is in a slot: no second one is claimed (plan #150)."""
        return any(j.get("step") == "phase_a" and j.get("create") and not j.get("create_done") for j in self.running())

    def running_ids(self) -> list[int]:
        """Jobs this process still runs: their lease is never taken back while they run (I2, a DB outage longer than the lease)."""
        with self._lock:
            return list(self._running)

    def busy_orgs(self) -> set[str]:
        """Orgs with a Merimen step running in this process: their re-login waits for it (loop.sync_sessions)."""
        return {str(j.get("org_id")) for j in self.running() if j.get("step") in MERIMEN_STEPS and j.get("org_id")}

    def submit(self, job: dict, **extra) -> None:
        with self._lock:
            if len(self._running) >= self.slots:
                raise RuntimeError("no free slot")
            if int(job["id"]) in self._running:
                raise RuntimeError("job already running")
            self._running[int(job["id"])] = job
            self._started[int(job["id"])] = self._now()
        self._q.put((job, extra))

    def _loop(self) -> None:
        driver = None
        while True:
            job, extra = self._q.get()
            me = threading.current_thread().name
            t0 = self._now()
            # one line at the start and the end of every job (job id and step only, no case or org): the rollout trial reads the
            # overlap of two jobs from these times
            print(f"{me} job {job.get('id')} {job.get('step')} start {time.strftime('%Y-%m-%dT%H:%M:%S')}", flush=True)
            _CURRENT.job = job
            try:
                if driver is None:
                    driver = self._make_driver()
                self._run(job, driver, extra)
            except BaseException as e:  # noqa: BLE001  (run_job writes its own outcome; anything that escapes it must not end the slot)
                print(f"{me} slot job {job.get('id')} {job.get('step')} {type(e).__name__}", file=sys.stderr, flush=True)
            finally:
                print(f"{me} job {job.get('id')} {job.get('step')} end {time.strftime('%Y-%m-%dT%H:%M:%S')} "
                      f"after {int(self._now() - t0)} s", flush=True)
                with self._lock:
                    self._running.pop(int(job["id"]), None)
                    self._started.pop(int(job["id"]), None)
                    self._warned.discard(int(job["id"]))
                _CURRENT.job = None
                self._q.task_done()

    def wait_idle(self, timeout: float | None = None) -> bool:
        """Tests: wait until every submitted job is done."""
        end = None if timeout is None else time.monotonic() + timeout
        while self.free() < self.slots:
            if end is not None and time.monotonic() > end:
                return False
            time.sleep(0.01)
        return True


# The threading model of every driver attribute (DPR-150-4 D5). A test fails when the driver or run_job gets an attribute that is in
# neither list, so a new one is always classified. SHARED: thread-safe, one for all slots. PER_JOB: set again by run_job /
# handle_job for every job on the slot's own copy, so two jobs never see each other's.
SHARED = frozenset({"script", "page_for", "jev", "step2_reviewer", "fetch_bytes", "strict_tabs"})
PER_JOB = frozenset({"case", "progress", "profile", "marks", "record", "workshop", "guard", "relogin_ready"})


def slot_driver(base):
    """A shallow copy of the main driver for one slot thread. The shared parts (page provider, Jev, the Step 2 reviewer, fetch_bytes)
    are thread-safe; per-job attributes are set on the copy by run_job / handle_job, so two jobs never see each other's case."""
    d = copy.copy(base)
    for attr in PER_JOB:
        if attr in d.__dict__:
            d.__dict__.pop(attr)
    d.profile = lambda: None
    d.workshop = lambda _lock: None
    d.record = None
    d.marks = None
    return d
