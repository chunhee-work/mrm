"""One pass: heartbeat, Chrome session the user asked for, follow-up jobs, one claimed job."""

from __future__ import annotations

import os
import re
import sys
import threading
import time

from .cdp_client import page_block
from .chrome import chrome_argv, chrome_running, login_notice, next_status, profile_dir
from .config import Config, account_for
from .db import DbError
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

# org -> {"until", "n", "reason"}: a login check that was put back without a try (nothing was typed) is not asked for again at once.
# Kept in this process only; the wait doubles from 2 s and is never longer than a minute.
_verify_wait: dict[str, dict] = {}
VERIFY_WAIT_MAX = 60


# Which part of tick() was running, for the one log line when a tick fails (2026-11-27: the box only logged "tick DbError").
STEP = {"name": "start"}


def _at(name: str) -> None:
    STEP["name"] = name


_QUOTED_SINGLE = re.compile(r"'[^']*'")
_QUOTED_DOUBLE = re.compile(r'"([^"]*)"')
_SECRETISH = re.compile(r"(postgres(?:ql)?://\S+|https?://\S+|\b[A-Za-z0-9_\-]{24,}\b)")


def _scrub(message: str) -> str:
    """Postgres can quote a value it was given ('invalid input syntax for type uuid: "abc"'). Keep names of tables and
    constraints, drop anything that could be a parameter, a link or a token."""
    m = _QUOTED_SINGLE.sub("'…'", message)
    m = _QUOTED_DOUBLE.sub(lambda q: q.group(0) if re.fullmatch(r"[a-z_][a-z0-9_.]*", q.group(1)) else '"…"', m)
    m = _SECRETISH.sub("…", m)
    return " ".join(m.split())[:200]


def tick_error_line(e: BaseException, step: str | None = None) -> str:
    """`tick DbError step=heartbeat code=08006 msg=...`. Only the error's own short message and SQLSTATE, never SQL
    parameters, connection strings or tokens. Other errors keep the old one-word form plus the step."""
    where = f" step={step or STEP['name']}"
    if isinstance(e, DbError):
        code = getattr(e, "code", None) or "-"
        return f"tick DbError{where} code={code} msg={_scrub(str(e))}"
    return f"tick {type(e).__name__}{where}"


def maybe_cleanup(cfg: Config, repo: PgRepo, delete, *, every: float = 3600.0, now=time.monotonic) -> int:
    if not (cfg.worker_ui and delete) or now() - _last_cleanup[0] < every:
        return 0
    _last_cleanup[0] = now()
    try:
        return cleanup(repo, delete, cfg.retention_days)
    except Exception:
        return 0


def verify_wait_seconds(n: int) -> int:
    """How long a login check that was put back waits before it is taken again: 2 s, doubling, never longer than a minute."""
    return min(VERIFY_WAIT_MAX, 2 ** max(n, 1))


def verify_once(cfg: Config, repo: PgRepo, fetch_page, master: bytes, *, now=time.monotonic) -> None:
    """At most one login check per tick, against the Chrome of the org's own account (fetch_page(user, password, port)).
    A check that is put back (key_mismatch, not_login_page, offline, no_account) waits before it is taken again, and its reason goes
    to stderr and to the audit table once, not every tick. Other orgs are not held up by it."""
    from .login_flow import run_verify
    from .login_page import release_verify

    t = now()
    skip = sorted(org for org, w in _verify_wait.items() if t < w["until"])
    claimed = repo.claim_verify(skip=skip) if skip else repo.claim_verify()
    if not claimed:
        return
    org = claimed["org_id"]
    account = account_for(org, cfg.accounts, cfg.org_accounts)
    if not account:  # several Chrome profiles and no mapping for this org: never guess whose Chrome to type into
        decision = release_verify("no_account")
    else:
        port = cfg.accounts[account]
        decision = run_verify(claimed, master, lambda user, password: fetch_page(user, password, port))
    if decision.get("release"):
        reason = str(decision.get("reason") or "offline")
        before = _verify_wait.get(org) or {"n": 0, "reason": None}
        n = before["n"] + 1
        _verify_wait[org] = {"until": t + verify_wait_seconds(n), "n": n, "reason": reason}
        if before["reason"] != reason:
            decision = {**decision, "audit": reason}
            print(f"login check put back, no try counted: reason={reason}", file=sys.stderr, flush=True)
    else:
        _verify_wait.pop(org, None)
    email = repo.owner_email(org) if decision.get("email") else None
    repo.finish_verify(org, decision, email_to=email, poster=cfg.mailer)


# port -> when this process last started Chrome on it. Chrome needs a few seconds before its debugging port answers; starting it a
# second time on the same profile only opens one more tab in the Chrome that is already there.
_launched: dict[int, float] = {}
LAUNCH_WAIT = 30.0


# what relogin(org, port) returns when it really ran a try (anything else: refused, throttled, pending, nothing typed or opened)
TRIED = ("ok", "session_live", "put_back", "unclear", "unclear_stop", "bad_credentials", "locked", "otp", "pending", "unknown")


def sync_sessions(cfg: Config, repo: PgRepo, *, launch, inspect, keep=lambda _port: None, now=time.monotonic, running=chrome_running, relogin=None) -> None:
    """relogin(org, port) -> None: MERIMEN_RELOGIN. Asked for at most ONE org per tick, only when that org's Chrome answers, no tab
    of it is logged in, and its saved login is ok and not blocked (the gate is "ready"). Orgs tried longest ago go first."""
    want_relogin: list[tuple[str, int]] = []
    if cfg.ext_connect:
        repo.ensure_sessions()  # a ready org (login ok + consent) gets its row; with EXT_CONNECT off nothing is asked for
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
        argv = chrome_argv(cfg.chrome_bin, port, profile)
        info = inspect(port)  # ask the debugging port first: a Chrome that answers is never started again
        if info is None and not running(profile):  # nor one that holds the profile but is slow to answer
            t = now()
            if port not in _launched or t - _launched[port] >= LAUNCH_WAIT:
                _launched[port] = t
                launch(argv)
        if not info:
            repo.set_session(org, status="waiting_login", wanted="start", account=account, port=port, detail="not_logged_in")
            login_notice(cfg.state_dir)
            continue
        reason = page_block(info)
        status = next_status(row["status"] or "idle", reason is None)
        if reason is None:
            keep(port)
            if relogin and row.get("status") != "connected":
                repo.seen_connected(org)  # ends an open put-back streak, however Chrome was fixed
                from .relogin import clear_detail

                clear_detail(org)
        else:
            login_notice(cfg.state_dir)
            if relogin and reason == "not_logged_in":
                want_relogin.append((org, port))
                from .relogin import detail_for

                reason = detail_for(org) or reason
        repo.set_session(org, status=status, wanted="start", account=account, port=port, detail=reason)
    if relogin and want_relogin:
        # orgs tried longest ago first; a refused or throttled org hands the turn to the next one, so one stopped org never starves
        # the others. Still at most ONE real try per tick.
        ports = dict(want_relogin)
        for org in repo.relogin_order([o for o, _ in want_relogin]):
            if relogin(org, ports[org]) in TRIED:
                break


def tick(cfg: Config, repo: PgRepo, *, launch, inspect, namer, driver: Driver, download, keep=lambda _port: None, fetch_page=None, master: bytes = b"", page_for=None, put_blob=None, delete_blob=None, side_check=None, now=time.monotonic, forget_files=None, relogin_fetch=None) -> str | None:
    _at("heartbeat")
    repo.heartbeat(cfg.worker_id, cfg.hf_repo, chrome_ok=True)
    if cfg.merimen_login and fetch_page and master:
        _at("claim_verify")
        verify_once(cfg, repo, fetch_page, master, now=now)
    _at("reclaim_stale")
    repo.reclaim_stale(cfg.lease_seconds)
    _at("cleanup")
    maybe_cleanup(cfg, repo, delete_blob)
    _at("session_sync")
    relogin = None
    if cfg.merimen_relogin and cfg.merimen_login and relogin_fetch and master:
        from .relogin import try_once

        def relogin(org: str, port: int):
            return try_once(cfg, repo, org, port, fetch_page=relogin_fetch, master=master, now=now)

        from .relogin import retry_pending

        retry_pending(cfg, repo)  # a try whose outcome write failed is written before anything else

    sync_sessions(cfg, repo, launch=launch, inspect=inspect, keep=keep, now=now, relogin=relogin)
    _at("followup_cases")
    for case, jobs in repo.followup_cases():
        if repo.gate(case["org_id"], env_on=cfg.ext_connect) != "ready":
            continue
        for step in followup_steps(case, jobs, writes=cfg.live_writes):
            repo.enqueue(case["id"], step)
    _at("claim")
    job = repo.claim(ext_connect=cfg.ext_connect, worker_id=cfg.worker_id, org_limit=cfg.org_limit)
    if not job:
        return None
    _at("job")
    case = repo.load(job["case_id"])
    shooter = Screenshotter(repo, enabled=bool(cfg.worker_ui and page_for and put_blob), page_for=page_for or (lambda _o: None), put=put_blob or (lambda *_: None))
    emitted: set[str] = set()

    def shoot(step: str) -> None:
        if step not in emitted and shooter.shoot(job, case, step):
            emitted.add(step)

    try:
        try:
            # Only the photo model reads files from this machine. (Intake used to download every case PDF here and nothing read them:
            # the Jev page check reads its PDFs in memory, straight from the Blob.)
            # downloads go to <state>/files/<case id>/<job id>/<photo id>-<name>; the name comes from the database and is made safe by the downloader
            if job["step"] == "photo_model":
                for p in case["photos"]:
                    local = download(p.get("blob_path") or "", p.get("src_name") or "photo.jpg", job["case_id"], job["id"], p["id"])
                    if local:
                        p["local"] = local
            if job["step"] in ("phase_a", "phase_b") and cfg.live_writes and os.environ.get("MERIMEN_DRYRUN") != "on":
                # the originals go to Merimen (documents and photos); only when writes are really on, never in a dry run.
                # Into this job's own folder like the photo model's files; "f"/"p" in front of the id keeps a file and a photo with the same id apart.
                for f in case["files"]:
                    if not (f.get("name") or "").lower().endswith(".pdf"):
                        continue  # only the documents; zips and photos are not uploaded as documents
                    local = download(f["url"], f["name"], job["case_id"], job["id"], f"f{f['id']}")
                    if local:
                        f["local"] = local
                for d in case.get("desk") or []:
                    local = download(d.get("blob_path") or "", d.get("src_name") or "photo.jpg", job["case_id"], job["id"], f"p{d['id']}")
                    if local:
                        d["local"] = local
            gate = repo.gate(job["org_id"], env_on=cfg.ext_connect)
            session = repo.session_status(job["org_id"])
            if job["step"] == "phase_a" and gate == "ready" and session == "connected":
                shoot("login_verified")
            driver.progress = lambda code: shoot(CODE_TO_STEP.get(code, ""))
            # the create-case step (Phase A) reads these: the user's manager/adjuster, and the case's workshop (True locks it, False only looks)
            driver.profile = lambda: repo.profile_for(job["org_id"])
            driver.marks = lambda: repo.create_marks(job["case_id"])
            driver.record = lambda cid, eid: repo.record_merimen_id(job["case_id"], cid, eid)
            driver.workshop = lambda lock: repo.claim_workshop_for_case(job["case_id"]) if lock else repo.peek_workshop_for_case(job["case_id"])
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
    finally:
        if forget_files:  # the job is over, done or failed: its own downloaded files leave this machine
            try:
                forget_files(job["case_id"], job["id"])
            except Exception:  # noqa: BLE001  (the hourly sweep takes what is left)
                pass
    _at("apply")
    repo.apply(job, outcome)
    return job["step"]
