"""One pass: heartbeat, Chrome session the user asked for, follow-up jobs, one claimed job."""

from __future__ import annotations

import os
import re
import sys
import threading
import time
import traceback
from dataclasses import replace

from .cdp_client import page_block
from .chrome import chrome_argv, chrome_running, clear_login_notice, login_notice, next_status, profile_dir
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


def job_error_line(job: dict, e: BaseException) -> str:
    """`job 67 phase_b attempt 3 KeyError msg=... at pipeline.py:150 run_phase < loop.py:290 tick`. The message is scrubbed like
    tick_error_line (no parameters, links or tokens) and the place is file:line + function only, never local values."""
    frames = traceback.extract_tb(e.__traceback__)[-4:]
    where = " < ".join(f"{os.path.basename(f.filename)}:{f.lineno} {f.name}" for f in reversed(frames))
    code = f" code={getattr(e, 'code', None)}" if getattr(e, "code", None) else ""
    return f"job {job.get('id')} {job.get('step')} attempt {job.get('attempts')} {type(e).__name__}{code} msg={_scrub(str(e))} at {where}"[:600]


def _print_error(job: dict, e: BaseException) -> None:
    try:
        print(job_error_line(job, e), file=sys.stderr, flush=True)
    except Exception:  # noqa: BLE001  (the log line never changes the outcome)
        pass


# ---- Merimen logged out during a job (owner 2026-11-28: "will the worker notice, log in and go on?") ----
PHASE_STEPS = ("phase_a", "phase_b", "checks")
LOST_EVENT = "Merimen logged out during"  # the event every put-back writes; the cap counts these (store.session_lost_count)
LOST_CAP = 5  # put-backs for one case in LOST_WINDOW; the next one takes the normal failure path
LOST_WINDOW = "6 hours"
_PHASE_NAME = {"phase_a": "Phase A", "phase_b": "Phase B", "checks": "the checks"}
FORCE_TTL = 1200.0  # a mark nobody could act on (re-login refused, a person logged in) ends after 20 min: the address decides again
# org -> when a job found its session logged out: the next sync_sessions books a re-login even if a tab address still carries the
# session marks (a page that shows a password box at an old address). Cleared when a re-login is ok or finds the session live.
FORCE_RELOGIN: dict[str, float] = {}


def _forced(org_id: str, now) -> bool:
    t = FORCE_RELOGIN.get(org_id)
    if t is None:
        return False
    if now() - t >= FORCE_TTL:
        FORCE_RELOGIN.pop(org_id, None)
        return False
    return True


def session_alive(cfg: Config, inspect, page_for, org_id: str) -> bool:
    """A fresh look after a job that did not finish: a tab whose address is a logged-in claims page, and (when the page provider can
    look inside, `page_for.session_tabs`) at least one such tab shows no password box. Chrome not answering counts as logged out
    (the job cannot go on either). Two logged-in tabs are NOT logged out."""
    account = account_for(org_id, cfg.accounts, cfg.org_accounts)
    if not account:
        return True  # no Chrome for this org: nothing to say about a login
    try:
        info = inspect(cfg.accounts[account])
    except Exception:  # noqa: BLE001
        info = None
    if not info or page_block(info) is not None:
        return False
    look = getattr(page_for, "session_tabs", None)
    if look:
        try:
            tabs = look(org_id)  # one bool per tab with session marks: True = that page shows a password box
        except Exception:  # noqa: BLE001  (the look itself failed: the address check above decides)
            tabs = None
        if tabs and all(tabs):  # an empty look says nothing: the address check above decides
            return False
    return True


def _not_merimen(outcome: Outcome) -> bool:
    """Stops that do not depend on the session (a missing document or field, a setting): never turned into a put-back."""
    err = outcome.error or ""
    return bool(outcome.pending_doc) or err in ("documents", "concurrency_unsafe") or err.startswith("missing ")


def session_lost_outcome(job: dict, outcome: Outcome, *, count: int) -> Outcome:
    """The outcome of a job that Merimen logged out half way. Under the cap: put back without using a try, nothing it found is
    taken as the case's state (no status, error or follow-up job), what it did write (the case number, the photo and Step 2 logs)
    is kept. At the cap: the job's own outcome as a failure, with one line that says why it stops."""
    phase = _PHASE_NAME.get(job["step"], job["step"])
    if count >= LOST_CAP:
        lead = f"Merimen logged out {LOST_CAP} times in {LOST_WINDOW}: {phase} is not tried again by itself."
        return replace(outcome, job_state="failed", event=(lead + (f" {outcome.event}" if outcome.event else ""))[:400])
    return replace(
        outcome, job_state="requeue", session_lost=True, case_status=None, error=None, enqueue=[], done=False, pending_doc=None,
        require_snapshot=None, stale_event=None, invalidate=False, verify_state=None,
        event=f"{LOST_EVENT} {phase}. Logging in again, then it goes on from where it stopped.",
    )


def check_session_after(cfg: Config, repo, job: dict, outcome: Outcome, *, inspect, page_for, now=time.monotonic) -> Outcome:
    """After a Merimen job that did not finish: was the session logged out meanwhile? Then the put-back outcome (and, with re-login
    on, the org is marked so the next tick books one). A check that fails itself leaves the outcome as it was."""
    if job["step"] not in PHASE_STEPS or outcome.job_state not in ("failed", "requeue") or not cfg.ext_connect or _not_merimen(outcome):
        return outcome
    try:
        if session_alive(cfg, inspect, page_for, job["org_id"]):
            return outcome
        got = session_lost_outcome(job, outcome, count=repo.session_lost_count(job["case_id"]))
    except Exception:  # noqa: BLE001
        return outcome
    if got.session_lost and cfg.merimen_relogin:
        FORCE_RELOGIN[job["org_id"]] = now()
    return got


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
TRIED = ("ok", "session_live", "put_back", "unclear", "unclear_stop", "bad_credentials", "locked", "otp", "pending")


def sync_sessions(cfg: Config, repo: PgRepo, *, launch, inspect, keep=lambda _port: None, now=time.monotonic, running=chrome_running, relogin=None) -> None:
    """relogin(org, port) -> outcome word: MERIMEN_RELOGIN. At most ONE real try per tick, only when that org's Chrome answers, no
    tab of it is logged in, and its gate (settings + consent) is "ready". Whether the saved login is ok and not blocked is checked
    inside the booking (the `cred` refusal), never here. Orgs tried longest ago go first."""
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
            if not relogin:  # with re-login active nobody is asked to log in by hand (owner 2026-11-28)
                login_notice(cfg.state_dir)
            else:
                clear_login_notice(cfg.state_dir)  # an old notice from before the switch would mislead
            continue
        reason = page_block(info)
        if _forced(org, now):
            if relogin and reason is None:
                reason = "not_logged_in"  # a job found this session logged out: book a re-login whatever the tab address says
            elif not relogin:
                FORCE_RELOGIN.pop(org, None)  # without re-login nobody acts on the mark: the address decides, as before
        status = next_status(row["status"] or "idle", reason is None)
        if reason is None:
            keep(port)
            if relogin and row.get("status") != "connected":
                repo.seen_connected(org)  # ends an open put-back streak, however Chrome was fixed
                from .relogin import clear_detail

                clear_detail(org)
        else:
            if not relogin:  # with re-login active nobody is asked to log in by hand (owner 2026-11-28)
                login_notice(cfg.state_dir)
            else:
                clear_login_notice(cfg.state_dir)  # an old notice from before the switch would mislead
            if relogin and reason == "not_logged_in":
                want_relogin.append((org, port))
                from .relogin import detail_for

                reason = detail_for(org) or reason
        repo.set_session(org, status=status, wanted="start", account=account, port=port, detail=reason)
    if relogin and want_relogin:
        # orgs tried longest ago first; a refused or throttled org hands the turn to the next one, so one stopped org never starves
        # the others. Still at most ONE real try per tick.
        ports = dict(want_relogin)
        try:
            order = repo.relogin_order([o for o, _ in want_relogin])
        except Exception:  # noqa: BLE001  (a DB error here must not abort the tick; the booking itself still decides)
            order = [o for o, _ in want_relogin]
        for org in order:
            got = relogin(org, ports[org])
            if got in ("ok", "session_live"):
                FORCE_RELOGIN.pop(org, None)
            if got in TRIED:
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
        except Exception as e:  # noqa: BLE001
            _print_error(job, e)
            outcome = Outcome("requeue" if job["attempts"] < 3 else "failed", error="worker error", event="Worker error")
            if job["step"] in ("phase_a", "phase_b", "checks"):
                shoot("failed")
    finally:
        if forget_files:  # the job is over, done or failed: its own downloaded files leave this machine
            try:
                forget_files(job["case_id"], job["id"])
            except Exception:  # noqa: BLE001  (the hourly sweep takes what is left)
                pass
    _at("session_check")
    outcome = check_session_after(cfg, repo, job, outcome, inspect=inspect, page_for=page_for or getattr(driver, "page_for", None), now=now)
    _at("apply")
    repo.apply(job, outcome)
    return job["step"]
