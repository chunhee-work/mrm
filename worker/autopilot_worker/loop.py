"""One pass: heartbeat, Chrome session the user asked for, follow-up jobs, one claimed job."""

from __future__ import annotations

import os
import re
import sys
import threading
import time
import traceback
from dataclasses import replace

from . import login_seen
from .cdp_client import page_block
from .chrome import chrome_argv, chrome_running, clear_login_notice, login_notice, next_status, profile_dir
from .config import Config, account_for
from .db import DbError
from .pipeline import Driver, Outcome, followup_steps, handle_job
from .screens import CODE_TO_STEP, Screenshotter, cleanup, milestones_after
from .store import LOST_EVENT, LOST_WINDOW, PgRepo


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
PHASE_STEPS = ("phase_a", "phase_b")  # the jobs that drive Merimen (Phase B runs its own checks); the `checks` job only waits
LOST_CAP = 3  # put-backs for one case in LOST_WINDOW (store.LOST_EVENT, store.LOST_WINDOW); the next one fails and the case waits
_PHASE_NAME = {"phase_a": "Phase A", "phase_b": "Phase B", "checks": "the checks"}
# a mark that no re-login cleared within 25 min (two re-login cooldowns and some room) ends, and the org is then HELD (RELOGIN_HELD): the address decides again, but no
# logout is put back for HOLD_SECONDS, so a stale tab that now counts as connected can never loop into more forced password tries.
# Until then the org is not "connected" on purpose: a stale tab with the old address cannot be told from a hand login
FORCE_TTL = 1500.0
# org -> when a job found its session logged out: the next sync_sessions books a re-login even if a tab address still carries the
# session marks (a page that shows a password box at an old address). Cleared when a re-login is ok or finds the session live.
FORCE_RELOGIN: dict[str, float] = {}
# orgs whose forced re-login was refused or failed (monotonic time): no logout put-back for HOLD_SECONDS; the job keeps its own
# outcome (its normal tries, or a stop for a person). Cleared by a re-login that works.
RELOGIN_HELD: dict[str, float] = {}
HOLD_SECONDS = 6 * 3600.0
# orgs held while a job of theirs still met the login form: not "connected" (the stale tab address is not believed), so the queue
# waits instead of every case of the org meeting the login form and stopping one by one. A held re-login / timeout org is then
# simply logged out: the usual re-login is booked with all its DB limits, and one that works lifts the hold. An org held by
# ORG_CAP books nothing until its hold ends (one page that logs out every time must not spend the account's login tries)
HELD_PAUSED: set[str] = set()
HOLD_KIND: dict[str, str] = {}
# org -> times of its logouts found in jobs (put-backs and case-cap stops, all cases): ORG_CAP within ORG_WINDOW holds the org, so
# one page that logs out every time (or a login-looking box Merimen shows while logged in) cannot spend the account's login tries
# case after case. 3 h: a logout followed by a re-login cooldown and a long Phase B still falls inside it. The hard ceiling stays the
# re-login's own limits: 12 tries that did not log in, 48 tries in all, per 24 h
ORG_PUTBACKS: dict[str, list[float]] = {}
ORG_CAP = 4
ORG_WINDOW = 3 * 3600.0


_noted: dict[tuple[str, str], float] = {}


def note(org_id: str, word: str, now=time.monotonic) -> None:
    """One fixed-word stderr line (never values) when an org is marked, held or put back, at most once an hour per org and word, so
    an operator can see why a logout was or was not put back."""
    key, t = (str(org_id), word), now()
    if key in _noted and t - _noted[key] < 3600.0:
        return
    _noted[key] = t
    import hashlib

    org = hashlib.sha256(str(org_id).encode()).hexdigest()[:6]  # which org, without its id
    print(f"session_lost: {word} org={org}", file=sys.stderr, flush=True)


def _forced(org_id: str, now) -> bool:
    t = FORCE_RELOGIN.get(org_id)
    if t is None:
        return False
    if now() - t >= FORCE_TTL:
        FORCE_RELOGIN.pop(org_id, None)
        _hold(org_id, now, "held_force_timeout")  # no re-login fixed it in time: the old stops stand for a while (a person looks)
        return False
    return True


def session_alive(cfg: Config, inspect, page_for, org_id: str) -> bool:
    """A fresh look after a job that did not finish: a tab whose address is a logged-in claims page, and (when the page provider can
    look inside, `page_for.session_tabs`) at least one such tab shows no password box. Chrome not answering is unknown: the job's
    own outcome stands. Two logged-in tabs are NOT logged out."""
    account = account_for(org_id, cfg.accounts, cfg.org_accounts)
    if not account:
        return True  # no Chrome for this org: nothing to say about a login
    try:
        info = inspect(cfg.accounts[account])
    except Exception:  # noqa: BLE001
        info = None
    if not info:
        return True  # Chrome did not answer this once (busy, a slow /json/list): unknown, the job's own outcome stands
    if page_block(info) is not None:
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
    if outcome.job_state == "requeue" and not err and (not outcome.event or outcome.event.startswith("Waiting for you to log in")):
        return True  # a wait before the step ran (gate, session, Done not pressed): Merimen was not driven, nothing was cut off
    return bool(outcome.pending_doc) or err in ("documents", "concurrency_unsafe", "writes_off") or err.startswith("missing ")


def _may_come_from_logout(job: dict, outcome: Outcome, seen_login: bool) -> bool:
    """Which outcomes a logout can explain. Every retry the job does by itself (photos unreadable, no logged-in tab, the form did
    not open, a dry run that failed, a worker error) and a worker error that ran out of tries. A stop meant for a person (Step 2,
    the checks before submit, a case that cannot be entered, a Phase B photo write, a photo list to fix by hand) stays one, with a
    single exception: Phase A's photo step that itself found the login form (an upload cut off by the logout)."""
    if outcome.job_state not in ("failed", "requeue") or _not_merimen(outcome):
        return False
    if outcome.job_state == "requeue" or outcome.error == "worker error":
        return True
    return job["step"] == "phase_a" and outcome.error == "photos" and seen_login and "(not_logged_in)" in (outcome.event or "")


def _where(event: str) -> str:
    """Where the job stopped, without its "check by hand" advice (the worker goes on by itself)."""
    return re.split(r"\.?\s*Check (?:the|them)\b", event, maxsplit=1)[0].strip()


def session_lost_outcome(job: dict, outcome: Outcome, *, count: int) -> Outcome:
    """The outcome of a job that Merimen logged out half way. Under the cap: put back without using a try, nothing it found is
    taken as the case's state (no status, error or follow-up job), what it did write (the case number, the photo and Step 2 logs)
    is kept. At the cap: the job's own outcome as a failure, with one line that says why it stops."""
    phase = _PHASE_NAME.get(job["step"], job["step"])
    if count >= LOST_CAP:
        lead = f"Merimen logged out {LOST_CAP} times in {LOST_WINDOW}: {phase} is not tried again by itself."
        # a put-back job's own outcome may be a bare requeue (no error, no status): the case still has to show it waits for a person
        return replace(outcome, job_state="failed", error=outcome.error or outcome.stop_error or "session_lost", case_status=outcome.case_status or "waiting_user",
                       event=(lead + (f" {outcome.event}" if outcome.event else ""))[:400])
    return replace(
        outcome, job_state="requeue", session_lost=True, case_status=None, error=None, enqueue=[], done=False, pending_doc=None,
        require_snapshot=None, stale_event=None, invalidate=False, verify_state=None,
        event=(f"{LOST_EVENT} {phase}. Logging in again, then it goes on from where it stopped."
               + (f" ({_where(outcome.event)})" if outcome.event else ""))[:400],
    )


def held(org_id: str, now=time.monotonic) -> bool:
    """The org's last re-login was refused or failed, its force mark timed out, or it was put back ORG_CAP times in ORG_WINDOW,
    less than HOLD_SECONDS ago."""
    t = RELOGIN_HELD.get(org_id)
    if t is not None and now() - t < HOLD_SECONDS:
        return True
    HELD_PAUSED.discard(org_id)
    HOLD_KIND.pop(org_id, None)
    return False


def _hold(org_id: str, now, word: str) -> None:
    # a refusal while already held does not make the hold longer: it ends HOLD_SECONDS after it began (or with a re-login that
    # works). Only the org cap, the stronger hold, starts its own full time
    if word == "held_org_cap" or not held(org_id, now):
        RELOGIN_HELD[org_id] = now()
    if HOLD_KIND.get(org_id) != "held_org_cap":  # the org cap is the stronger hold: a later refusal does not soften it
        HOLD_KIND[org_id] = word
    note(org_id, word, now)


def _lift(org_id: str) -> None:
    """A re-login worked: the hold ends, except the org cap's (it ends only with its time)."""
    if HOLD_KIND.get(org_id) != "held_org_cap":
        HELD_PAUSED.discard(org_id)
        RELOGIN_HELD.pop(org_id, None)
        HOLD_KIND.pop(org_id, None)


def puts_back(cfg: Config, relogin_ready: bool = True) -> bool:
    """A logout half way is put back only when the worker can really log in again: EXT_CONNECT, MERIMEN_RELOGIN and the re-login
    itself built (MERIMEN_LOGIN, the key, the login page). Without it nobody logs in, the job keeps its own outcome and the usual
    login notice asks the user."""
    return bool(cfg.ext_connect and cfg.merimen_relogin and relogin_ready)


def check_session_after(cfg: Config, repo, job: dict, outcome: Outcome, *, inspect, page_for, now=time.monotonic, relogin_ready: bool = True,
                        seen_login: bool = False) -> Outcome:
    """After a Merimen job that did not finish: was the session logged out meanwhile (a step found the login form in a page it
    opened, `seen_login`, or a fresh look at Chrome)? Then the put-back outcome, and the org is marked so the next tick books a
    re-login. A check that fails itself leaves the outcome as it was."""
    if job["step"] not in PHASE_STEPS or not puts_back(cfg, relogin_ready) or not _may_come_from_logout(job, outcome, seen_login):
        return outcome
    org = job["org_id"]
    if held(org, now):
        try:
            if seen_login or not session_alive(cfg, inspect, page_for, org):
                HELD_PAUSED.add(org)  # logged out while held: the org waits (not connected) until the hold ends, nothing typed
                note(org, "not_put_back_held", now)
        except Exception:  # noqa: BLE001
            pass
        return outcome  # the last forced re-login was refused: never loop into more password tries
    try:
        if not seen_login and session_alive(cfg, inspect, page_for, org):
            return outcome
        got = session_lost_outcome(job, outcome, count=repo.session_lost_count(job["case_id"]))
    except Exception:  # noqa: BLE001
        return outcome
    times = [t for t in ORG_PUTBACKS.get(org, []) if now() - t < ORG_WINDOW]
    if len(times) >= ORG_CAP:
        # this org was logged out ORG_CAP times within ORG_WINDOW (3 h, any cases): stop putting back, keep the job's own outcome
        ORG_PUTBACKS[org] = times
        _hold(org, now, "held_org_cap")
        HELD_PAUSED.add(org)
        return outcome
    ORG_PUTBACKS[org] = times + [now()]  # the case cap's stop counts too: it also books a re-login
    FORCE_RELOGIN[job["org_id"]] = now()  # logged out: book a re-login, also at the cap (only the job stops there, not the login)
    note(job["org_id"], "put_back" if got.job_state != "failed" else "cap_reached", now)
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
        if HOLD_KIND.get(org) == "held_org_cap" and org in HELD_PAUSED and held(org, now):
            reason = "relogin_held"  # the org cap books nothing until its hold ends, whatever the tab address says (no try below)
        elif reason is None and org in HELD_PAUSED and held(org, now):
            # held, and a job saw the login form: the stale address is not believed; a plain logout (the usual re-login, DB limits)
            reason = "not_logged_in"
        if _forced(org, now):
            if relogin and reason is None:
                reason = "not_logged_in"  # a job found this session logged out: book a re-login whatever the tab address says
            elif not relogin:
                FORCE_RELOGIN.pop(org, None)  # without re-login nobody acts on the mark: the address decides, as before
        status = next_status(row["status"] or "idle", reason is None)
        if reason is None:
            keep(port)
            if relogin and row.get("status") != "connected" and not held(org, now):
                # ends an open put-back streak, however Chrome was fixed. Not while held: a stale tab that counts as connected then
                # must not end a failed re-login streak (that would book more password tries)
                repo.seen_connected(org)
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
                _lift(org)
            # short waits, nothing typed: no hold. `cred` (the saved login is not ok, or could not be read) holds: a held org that still
            # meets the login form books the usual re-login, so a passing read error only costs one more booking, and one that works lifts it
            elif got not in (None, "pending", "db_error", "cooldown", "put_back"):
                # refused or failed: no more put-backs for this org for a while, so a stale tab that later counts as connected never
                # books more password tries by itself (the refusal already mailed / showed why)
                _hold(org, now, f"held_relogin_{got}" if isinstance(got, str) and got.isidentifier() else "held_relogin")
            if got in ("ok", "session_live"):
                # logged in again: the mark goes. Any other answer (refused, put back, cooldown) keeps it until FORCE_TTL: a stale tab
                # must not count as connected meanwhile, which would end a failed streak and book more password tries
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
    if isinstance(case, dict) and job["step"] in PHASE_STEPS and hasattr(repo, "was_put_back"):
        # asked whatever the re-login state (also while the org is held or re-login is off): this only makes the checks stricter
        try:  # put back after a logout, or simply not the first run of this job (a worker killed half way, e.g. by a restart, leaves
            # no put-back event): a photo list that does not line up is never "already has photos"
            case["resumed_after_logout"] = int(job.get("attempts") or 1) > 1 or bool(repo.was_put_back(job))
        except Exception:  # noqa: BLE001  (not known: the stricter way, a partial list stops for a person)
            case["resumed_after_logout"] = True
    login_seen.reset()
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
            # while the org is held the old stops stand (a person looks), exactly as with re-login off
            driver.relogin_ready = puts_back(cfg, relogin is not None) and not held(job["org_id"], now)
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
    outcome = check_session_after(cfg, repo, job, outcome, inspect=inspect, page_for=page_for or getattr(driver, "page_for", None), now=now,
                                  relogin_ready=relogin is not None, seen_login=login_seen.seen())
    _at("apply")
    repo.apply(job, outcome)
    return job["step"]
