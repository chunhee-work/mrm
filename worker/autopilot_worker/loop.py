"""One pass: heartbeat, Chrome session the user asked for, follow-up jobs, one claimed job."""

from __future__ import annotations

import threading
import time

from .cdp_client import page_block
from .chrome import chrome_argv, login_notice, next_status, profile_dir
from .config import Config, account_for
from .pipeline import Driver, Outcome, followup_steps, handle_job
from .screens import CODE_TO_STEP, Screenshotter, cleanup, milestones_after
from .store import PgRepo


class LeaseKeeper:
    """Renews a running job's lease every third of the lease time, so a long job is not taken over while it still runs."""

    def __init__(self, repo: PgRepo, job_id: int, worker_id: str, lease_seconds: int):
        self.repo, self.job_id, self.worker_id = repo, job_id, worker_id
        self.every = max(5.0, lease_seconds / 3)
        self._stop = threading.Event()
        self._thread = threading.Thread(target=self._run, daemon=True)

    def _run(self) -> None:
        while not self._stop.wait(self.every):
            try:
                self.repo.touch_job(self.job_id, self.worker_id)
            except Exception:
                pass  # one missed renewal is fine; the lease is three times longer

    def __enter__(self):
        self._thread.start()
        return self

    def __exit__(self, *exc):
        self._stop.set()
        return False


_last_cleanup = [0.0]


def maybe_cleanup(cfg: Config, repo: PgRepo, delete, *, every: float = 3600.0, now=time.monotonic) -> int:
    if not (cfg.worker_ui and delete) or now() - _last_cleanup[0] < every:
        return 0
    _last_cleanup[0] = now()
    try:
        return cleanup(repo, delete, cfg.retention_days)
    except Exception:
        return 0


def sync_sessions(cfg: Config, repo: PgRepo, *, launch, inspect, keep=lambda _port: None) -> None:
    for row in repo.wanted():
        org = row["org_id"]
        if row["wanted"] == "stop":
            repo.set_session(org, status="stopped", wanted="none", account=row["account_key"], port=row["port"], detail=None)
            continue
        gate = repo.gate(org, env_on=cfg.ext_connect)
        account = account_for(org, cfg.accounts, cfg.org_accounts)
        if gate != "ready" or not account:
            repo.set_session(
                org, status="idle", wanted="start", account=account, port=None,
                detail="gate" if gate != "ready" else "no_account",
            )
            continue
        port = cfg.accounts[account]
        profile = profile_dir(cfg.state_dir, account)
        launch(chrome_argv(cfg.chrome_bin, port, profile))
        info = inspect(port)
        if not info:
            repo.set_session(org, status="waiting_login", wanted="start", account=account, port=port, detail="not_logged_in")
            login_notice(cfg.state_dir)
            continue
        reason = page_block(info)
        status = next_status(row["status"] or "idle", reason is None)
        if reason is None:
            keep(port)
        else:
            login_notice(cfg.state_dir)
        repo.set_session(org, status=status, wanted="start", account=account, port=port, detail=reason)


def tick(cfg: Config, repo: PgRepo, *, launch, inspect, namer, driver: Driver, download, keep=lambda _port: None, fetch_page=None, master: bytes = b"", page_for=None, put_blob=None, delete_blob=None, side_check=None) -> str | None:
    repo.heartbeat(cfg.worker_id, cfg.hf_repo, chrome_ok=True)
    if cfg.merimen_login and fetch_page and master:
        from .login_flow import run_verify
        claimed = repo.claim_verify()
        if claimed:
            decision = run_verify(claimed, master, fetch_page)
            email = repo.owner_email(claimed["org_id"]) if decision.get("email") else None
            repo.finish_verify(claimed["org_id"], decision, email_to=email, poster=cfg.mailer)
    repo.reclaim_stale(cfg.lease_seconds)
    maybe_cleanup(cfg, repo, delete_blob)
    sync_sessions(cfg, repo, launch=launch, inspect=inspect, keep=keep)
    for case, jobs in repo.followup_cases():
        if repo.gate(case["org_id"], env_on=cfg.ext_connect) != "ready":
            continue
        for step in followup_steps(case, jobs, writes=cfg.live_writes):
            repo.enqueue(case["id"], step)
    job = repo.claim(ext_connect=cfg.ext_connect, worker_id=cfg.worker_id, org_limit=cfg.org_limit)
    if not job:
        return None
    case = repo.load(job["case_id"])
    shooter = Screenshotter(repo, enabled=bool(cfg.worker_ui and page_for and put_blob), page_for=page_for or (lambda _o: None), put=put_blob or (lambda *_: None))
    emitted: set[str] = set()

    def shoot(step: str) -> None:
        if step not in emitted and shooter.shoot(job, case, step):
            emitted.add(step)

    try:
        if job["step"] == "intake":
            for f in case["files"]:
                download(f["url"], f["name"])
        if job["step"] == "photo_model":
            for p in case["photos"]:
                local = download(p.get("blob_path") or "", p.get("src_name") or "photo.jpg")
                if local:
                    p["local"] = local
        gate = repo.gate(job["org_id"], env_on=cfg.ext_connect)
        session = repo.session_status(job["org_id"])
        if job["step"] == "phase_a" and gate == "ready" and session == "connected":
            shoot("login_verified")
        driver.progress = lambda code: shoot(CODE_TO_STEP.get(code, ""))
        # asked before every photo write in Merimen: Done must still be pressed on the same version of the names
        driver.guard = lambda: repo.still_final(job["case_id"], case.get("photos_snapshot")) if job["step"] == "phase_b" else True
        with LeaseKeeper(repo, job["id"], cfg.worker_id, cfg.lease_seconds):
            outcome = handle_job(
                job, case, case["photos"], gate=gate, session=session,
                photo_worker=cfg.photo_worker, writes=cfg.live_writes, namer=namer, driver=driver,
            )
            if side_check and job["step"] == "phase_a" and outcome.job_state == "done":
                try:  # Jev page check (plan #103): after Phase A, warn only, never changes the outcome; the lease is kept alive meanwhile
                    outcome.extra_events = list(side_check(case))[:4]
                except Exception:  # noqa: BLE001
                    pass
        for step in milestones_after(job["step"], outcome, saved=cfg.live_writes):
            shoot(step)
    except Exception:
        outcome = Outcome("requeue" if job["attempts"] < 3 else "failed", error="worker error", event="Worker error")
        if job["step"] in ("phase_a", "phase_b", "checks"):
            shoot("failed")
    repo.apply(job, outcome)
    return job["step"]
