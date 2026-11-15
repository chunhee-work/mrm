"""Core of the photo-model service (plan: chunhee-work/mrm#26, Revision 6).

The trained model is NOT edited: predict_case.py and zones.py are copied byte for byte (see SOURCE.sha256) and run as a
subprocess, one job at a time. This file only holds what is around it: signing, the job queue, the subprocess call and
the check of what comes back. It imports no web framework and no torch, so it is unit-tested without the model.
"""
import hashlib
import hmac
import json
import os
import shutil
import subprocess
import sys
import threading
import time
from dataclasses import dataclass, field
from typing import Dict, List, Optional

SIG_WINDOW_S = 300  # +- 5 minutes


# ───────────── signing (must stay identical to web/src/lib/photo-model/sign.ts) ─────────────
def sha256_hex(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def canonical_post(ts: str, case_id: str, job_id: str, order_hash: str, vehicle: str, photo_hashes: List[str]) -> str:
    """UTF-8, no normalisation, fields joined by \\n. The vehicle is signed as its sha256, so a newline in it cannot
    shift fields."""
    return "\n".join(["POST", "/jobs", ts, case_id, job_id, order_hash, sha256_hex(vehicle.encode("utf-8")), ",".join(photo_hashes)])


def canonical_get(ts: str, job_id: str) -> str:
    return "\n".join(["GET", "/jobs/" + job_id, ts, job_id])


def sign(secret: str, canonical: str) -> str:
    return hmac.new(secret.encode("utf-8"), canonical.encode("utf-8"), hashlib.sha256).hexdigest()


def secrets_from_env() -> List[str]:
    """PHOTO_MODEL_SECRET, plus PHOTO_MODEL_SECRET_NEXT during a rotation. Empty or missing = nobody can call."""
    return [s for s in (os.environ.get("PHOTO_MODEL_SECRET", ""), os.environ.get("PHOTO_MODEL_SECRET_NEXT", "")) if s]


def check_signature(secrets: List[str], canonical: str, sig: str, ts: str, now: Optional[float] = None) -> bool:
    if not secrets or not sig or not ts:
        return False
    try:
        t = int(ts)
    except ValueError:
        return False
    if abs((now if now is not None else time.time()) - t) > SIG_WINDOW_S:
        return False
    ok = False
    for s in secrets:  # no early exit: constant work per secret
        ok = hmac.compare_digest(sign(s, canonical), sig) or ok
    return ok


# ───────────── check of what the script prints ─────────────
class ResultError(Exception):
    pass


def parse_output(stdout: str, files: List[str]) -> List[dict]:
    """One JSON line per photo, in input order. ANY malformed line, wrong count, unknown file, or jev=true fails the whole
    job (never a partial result). The temp `file` path is dropped; unknown fields are dropped."""
    lines = [ln for ln in stdout.splitlines() if ln.strip().startswith("{")]
    if len(lines) != len(files):
        raise ResultError("line count %d != photo count %d" % (len(lines), len(files)))
    out = []
    for i, ln in enumerate(lines):
        try:
            o = json.loads(ln)
        except ValueError:
            raise ResultError("line %d is not JSON" % i)
        if not isinstance(o, dict) or o.get("file") != files[i]:
            raise ResultError("line %d is not for photo %d" % (i, i))
        if o.get("jev") is True:
            raise ResultError("jev must never run")  # owner rule: TypeSafe never reads car damage photos
        top = o.get("top")
        if not isinstance(top, list) or not top or len(top) > 3:
            raise ResultError("line %d has no top-3" % i)
        clean_top = []
        for t in top:
            if not (isinstance(t, list) and len(t) == 2 and isinstance(t[0], str) and isinstance(t[1], (int, float))):
                raise ResultError("line %d has a bad top entry" % i)
            clean_top.append([t[0], float(t[1])])
        if not isinstance(o.get("conf"), (int, float)) or not isinstance(o.get("sure"), bool):
            raise ResultError("line %d has no conf/sure" % i)
        out.append({
            "top": clean_top, "conf": float(o["conf"]), "sure": o["sure"],
            "area": o.get("area") if isinstance(o.get("area"), str) else None,
            "area_conf": float(o["area_conf"]) if isinstance(o.get("area_conf"), (int, float)) else None,
        })
    return out


def photo_ext(content_type: str, name: str) -> Optional[str]:
    """Real extension kept (PIL decides). Only formats the original runtime's PIL reads are accepted."""
    ct = (content_type or "").lower()
    table = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}
    return table.get(ct)


# ───────────── jobs ─────────────
@dataclass
class Job:
    job_id: str
    canonical: str
    vehicle: str
    dir: str
    files: List[str]
    status: str = "queued"  # queued | running | done | failed
    error: Optional[str] = None
    results: Optional[List[dict]] = None
    created: float = field(default_factory=time.time)
    started: Optional[float] = None


class Full(Exception):
    pass


class Mismatch(Exception):
    pass


class Queue:
    """Single worker, in-memory (the Space is a stateless worker: Vercel holds the durable state; whatever is kept here
    is a best-effort cache for RESULT_TTL_S)."""

    def __init__(self, max_waiting: int, run_limit_s: int, work_dir: str, run=None):
        self.max_waiting = max_waiting
        self.run_limit_s = run_limit_s
        self.work_dir = work_dir
        self.jobs: Dict[str, Job] = {}
        self.order: List[str] = []
        self.lock = threading.Lock()
        self.wake = threading.Condition(self.lock)
        self._run = run or run_predict
        self.result_ttl_s = int(os.environ.get("RESULT_TTL_S", "86400"))
        self.thread = threading.Thread(target=self._loop, daemon=True)
        self.stop = False

    def start(self):
        self.thread.start()

    def seen(self, job_id: str) -> Optional[Job]:
        with self.lock:
            return self.jobs.get(job_id)

    def waiting(self) -> int:
        return sum(1 for j in self.jobs.values() if j.status in ("queued", "running"))

    def submit(self, job_id: str, canonical: str, vehicle: str, photos: List[tuple]) -> Job:
        """photos = [(ext, bytes)] in shooting order. Same job_id + same payload returns the existing job (idempotent);
        same job_id with a different payload is refused."""
        with self.lock:
            old = self.jobs.get(job_id)
            if old:
                if old.canonical != canonical:
                    raise Mismatch()
                return old
            if self.waiting() >= self.max_waiting:
                raise Full()
            d = os.path.join(self.work_dir, job_id)
            os.makedirs(d, exist_ok=True)
            files = []
            for i, (ext, data) in enumerate(photos):
                p = os.path.join(d, "%03d.%s" % (i, ext))  # names are made here, never taken from the client
                with open(p, "wb") as f:
                    f.write(data)
                files.append(p)
            job = Job(job_id, canonical, vehicle, d, files)
            self.jobs[job_id] = job
            self.order.append(job_id)
            self.wake.notify()
            return job

    def _next(self) -> Optional[Job]:
        for jid in self.order:
            j = self.jobs[jid]
            if j.status == "queued":
                return j
        return None

    def _loop(self):
        while not self.stop:
            with self.lock:
                job = self._next()
                if job is None:
                    self.wake.wait(timeout=30)
                    self._expire()
                    continue
                job.status, job.started = "running", time.time()
            try:
                job.results = self._run(job.files, job.vehicle, self.run_limit_s)
                job.status = "done"
            except Exception as e:  # short, content-free message
                job.status, job.error = "failed", (str(e) or e.__class__.__name__)[:200]
            finally:
                shutil.rmtree(job.dir, ignore_errors=True)  # temp photos are deleted after every job

    def _expire(self):
        cut = time.time() - self.result_ttl_s
        for jid in [j for j in self.order if self.jobs[j].created < cut and self.jobs[j].status in ("done", "failed")]:
            self.order.remove(jid)
            self.jobs.pop(jid, None)


def run_predict(files: List[str], vehicle: str, limit_s: int) -> List[dict]:
    """The unchanged script, as an argv list (shell=False) with an env dict. VEHICLE is one env value, never part of a
    command line. JEV=0 is set here: if the variable were missing the script would send unsure photos to TypeSafe."""
    here = os.path.dirname(os.path.abspath(__file__))
    script = os.environ.get("PREDICT_SCRIPT", os.path.join(here, "predict_case.py"))
    env = {
        "PATH": os.environ.get("PATH", "/usr/bin:/bin"),
        "HOME": os.environ.get("HOME", "/home/user"),
        "TORCH_HOME": os.environ.get("TORCH_HOME", "/app/torch_home"),
        "PROD": "1",
        "PROD_FILE": os.environ.get("PROD_FILE", os.path.join(here, "models", "production.json")),
        "VEHICLE": vehicle,
        "JEV": "0",
        "PYTHONHASHSEED": "0",
    }
    if os.environ.get("PYTHONPATH", "").endswith("nonet"):  # only check_build.py smoke sets this
        env["PYTHONPATH"] = os.environ["PYTHONPATH"]
    argv = [sys.executable, script, "auto"] + files
    p = subprocess.run(argv, env=env, cwd=os.path.dirname(script), shell=False, capture_output=True, text=True, timeout=limit_s)
    if p.returncode != 0:
        raise ResultError("predict exited with %d" % p.returncode)  # stderr is not forwarded: it may name files
    return parse_output(p.stdout, files)
