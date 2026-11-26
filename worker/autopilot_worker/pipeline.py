"""One job in, one outcome out. Merimen steps dry-run first. Save runs only when writes are on."""

from __future__ import annotations

from dataclasses import dataclass, field

from . import learning, photo_sync, step2_run
from .photos import ModelError
from .plan import plan_case, steps_for


@dataclass
class DriveResult:
    ok: bool
    fatal: bool = False
    error: str | None = None
    case_id: str | None = None
    ext_id: str | None = None
    total_rm: str | None = None
    minutes: str = "0"


class _NoMerimenPhotos:
    """The default: Merimen's photo list cannot be read and nothing can be written. A dry run still records what it would do."""

    def labels(self, case):
        return None

    def upload(self, case, plan, chunks):
        raise photo_sync.NotPorted("upload")

    def relabel(self, case, mapping):
        raise photo_sync.NotPorted("relabel")

    def reorder(self, case, mapping):
        raise photo_sync.NotPorted("reorder")

    def verify(self, case, plan):
        raise photo_sync.NotPorted("verify")


class _NoMerimenStep2:
    """The default: the catalogue cannot be read and nothing can be ticked. A dry run records no plan; a live run stops with "unreadable"."""

    def catalogue(self, case):
        return None

    def apply(self, case, plan):
        raise photo_sync.NotPorted("step2")

    def selected(self, case):
        return None


class Driver:
    step2_reviewer = None  # the AI that reviews the Step 2 plan with the playbook's "step2" files; None = the rule plan stands
    progress = None  # set per job: a driver that ports a Merimen step calls progress("create_case") after it
    guard = staticmethod(lambda: True)  # set per job: False once Done was undone or the names changed, asked before every photo write

    def merimen_photos(self, case: dict):
        return _NoMerimenPhotos()

    def merimen_step2(self, case: dict):
        return _NoMerimenStep2()

    def dry_run(self, phase: str, steps: tuple) -> DriveResult:
        return DriveResult(ok=True)

    def save(self, phase: str, steps: tuple) -> DriveResult:
        return DriveResult(ok=False, fatal=True, error="writes_off")


@dataclass
class Outcome:
    job_state: str
    case_status: str | None = None
    event: str | None = None
    error: str | None = None
    enqueue: list[str] = field(default_factory=list)
    merimen_caseid: str | None = None
    merimen_extid: str | None = None
    total_rm: str | None = None
    done: bool = False
    pending_doc: str | None = None
    photo_rows: list[dict] | None = None
    photo_fail: str | None = None
    browser_minutes: str | None = None
    invalidate: bool = False
    verify_state: str | None = None
    photo_log: dict | None = None  # one photo_upload_log row: what the photo step did, or in a dry run would do
    step2_log: dict | None = None  # one step2_log row: the parts + labour plan from the final names, the two-way check, the AI review
    learning: list[dict] | None = None  # the adjuster's final names for the photo model (photo_learning rows)
    # set: the case update and the queued jobs are written only if 完成 is still pressed with this fingerprint (checked in the
    # same transaction as the write, so a name changed after the last check cannot be carried on to checks)
    require_snapshot: str | None = None
    stale_event: str | None = None  # with require_snapshot: written instead of `event` when 完成 or the names changed meanwhile


def run_phase(phase: str, case: dict, *, writes: bool, driver: Driver) -> Outcome:
    plan = plan_case(
        case_data=case.get("case_data"),
        files=int(case.get("file_count") or 0),
        photos=int(case.get("photo_count") or 0),
        photos_done=bool(case.get("photos_done_at")),
    )
    steps = steps_for(phase, plan)
    blocked = [s for s in steps if not s.ok]
    if blocked:
        if any("documents" in s.missing for s in blocked):
            return Outcome("failed", case_status="pending_doc", pending_doc="documents", event="Phase stopped: document missing", error="documents")
        miss = ", ".join(blocked[0].missing)[:180]
        return Outcome("failed", case_status="failed", error=f"missing {miss}", event=f"Phase {phase} blocked: {miss}")
    # the photo step: B before the parts (they are chosen from the names Merimen holds), A after the case exists
    desk = case.get("desk")
    merimen = driver.merimen_photos(case)

    def photo_b():
        return photo_sync.phase_b(
            case, desk, case.get("extras") or [], stored_snapshot=case.get("photos_snapshot"),
            phase_a_photos=case.get("phase_a_photos") or [], writes=writes, merimen=merimen, guard=driver.guard,
        )

    def photo_a(c):
        return photo_sync.phase_a(c, desk, writes=writes, merimen=merimen, guard=driver.guard)

    rep = None
    s2 = None
    side: dict = {}  # what Phase B adds to every outcome from here on: the Step 2 log and the learning rows

    def _o(*a, **k):
        return Outcome(*a, **{**side, **k})

    if desk is not None and phase == "B":
        try:
            rep = photo_b()
        except photo_sync.NotPorted:
            return Outcome("done", event=f"Phase {phase} checked. Merimen was not changed.")
        stop = _photo_stop(phase, rep)
        if stop:
            return stop
        if rep.snapshot:  # the names went through at Done: they are the photo model's learning data (our own database, no Merimen)
            side["learning"] = learning.rows_for(case, desk)
            if rep.mode == "live":  # Merimen now holds these names: log it on every outcome, so a Phase B run again compares with them
                side["photo_log"] = _log(rep)
        try:
            s2 = step2_run.run(case, desk, case.get("extras") or [], writes=writes, merimen=driver.merimen_step2(case), reviewer=driver.step2_reviewer, guard=driver.guard)
        except photo_sync.NotPorted:
            s2 = None
        if s2 is not None and (s2.plan or not s2.ok):
            side["step2_log"] = s2.row()
        if s2 is not None and not s2.ok:
            ev = f"Phase {phase} stopped. {s2.line()}"
            if s2.code == "undone":
                return _o("cancelled", event=ev)
            return _o("failed", case_status="waiting_user", error="step2", event=ev)
    dry = driver.dry_run(phase, steps)
    if not dry.ok:
        return _o("failed" if dry.fatal else "requeue", error=dry.error or "dry_run", event=f"Phase {phase} dry-run failed")
    if not writes:
        if desk is not None and phase == "A":
            rep = photo_a(case)
        note = (f" {rep.line()}" if rep and (rep.photos or not rep.ok) else "") + (f" {s2.line()}" if s2 and s2.plan else "")
        return _o("done", event=f"Phase {phase} dry-run only. Merimen was not changed.{note}", photo_log=_log(rep))
    saved = driver.save(phase, steps)
    if not saved.ok:
        if saved.error == "step_not_ported":
            # a live photo step already wrote to Merimen: its list stays logged (side), only a dry one is logged here
            live = bool(rep and rep.mode == "live")
            return _o("done", event=f"Phase {phase} checked. Merimen was not saved" + (" (photos were relabelled)." if live and side.get("photo_log") else "."),
                      **({} if live else {"photo_log": _log(rep)}))
        return _o("failed" if saved.fatal else "requeue", error=saved.error or "save", event=f"Phase {phase} not saved")
    if phase == "A":
        if desk is not None:
            try:
                rep = photo_a({**case, "merimen_caseid": saved.case_id or case.get("merimen_caseid")})
            except photo_sync.NotPorted:
                rep = None
            stop = _photo_stop(phase, rep) if rep else None
            if stop:
                return stop
        nxt = "phase_b" if case.get("photos_done_at") else "waiting_user"
        extra = ["phase_b"] if case.get("photos_done_at") else []
        suffix = f". {rep.line()}" if rep and (rep.photos or not rep.ok) else ""
        return _o(
            "done", case_status=nxt, enqueue=extra, event="Phase A saved" + suffix,
            merimen_caseid=saved.case_id, merimen_extid=saved.ext_id, browser_minutes=saved.minutes, photo_log=_log(rep),
        )
    suffix = (f". {rep.line()}" if rep and (rep.photos or not rep.ok) else "") + (f". {s2.line()}" if s2 and s2.plan else "")
    # The web app's naming desk locks a case once its `checks` job is queued, running, paused or done (web/src/lib/photos/server.ts,
    # CHECKS_QUEUED), and while the case is checking or done: queue `checks` only here, after the final names are saved.
    return _o(
        "done", case_status="checking", event="Checking" + suffix, enqueue=["checks"],
        total_rm=saved.total_rm, browser_minutes=saved.minutes, photo_log=_log(rep),
        # the adjuster may change a name (or undo 完成) while Step 2 and the save run: the move to checks is written only if 完成 is
        # still pressed on the same names, checked by the database in the same write; otherwise Merimen holds the old names and
        # the case waits for 完成, which queues a new Phase B with the new names (at once if it was already pressed again)
        require_snapshot=case.get("photos_snapshot") if desk is not None else None,
        stale_event="Phase B saved, but the names changed meanwhile. A new Phase B runs once 完成 is pressed on the new names" + suffix,
    )


def _log(rep):
    return rep.row() if rep is not None and (rep.photos or not rep.ok) else None


def _photo_stop(phase: str, rep) -> "Outcome | None":
    """A photo step that must not go on: the names are no longer final (job cancelled, a new Phase B follows the next Done), Merimen cannot be
    read (try again later), or Merimen does not match the plan (stop for a hand fix, say so on the case)."""
    if rep is None or rep.ok:
        return None
    event = f"Phase {phase} stopped. {rep.line()}"
    row = rep.row()
    if rep.code in ("edited", "undone"):
        return Outcome("cancelled", event=event, photo_log=row)
    if rep.code == "unreadable":
        return Outcome("requeue", event=event)
    return Outcome("failed", case_status="waiting_user", error="photos", event=event, photo_log=row)


def handle_job(job: dict, case: dict, photos: list[dict], *, gate: str, session: str, photo_worker: bool, writes: bool, namer, driver: Driver, login_result: str = "connected", cred_blocked: bool = False) -> Outcome:
    step = job["step"]
    if step in ("phase_a", "phase_b", "checks") and (cred_blocked or login_result in ("bad_credentials", "locked", "unknown")):
        from .login_page import finish_verify
        kind = login_result if login_result in ("bad_credentials", "locked") else "bad_credentials"
        decided = finish_verify(kind)
        return Outcome("paused", case_status="waiting_user", event=decided["event"], invalidate=True, verify_state=decided["verify_state"])
    if step in ("phase_a", "phase_b", "checks") and login_result == "otp":
        from .login_page import EVENT_OTP
        return Outcome("hold", case_status="waiting_user", event=EVENT_OTP)
    if step == "checks":
        if gate != "ready" or session != "connected":
            return Outcome("requeue")
        return Outcome("done", case_status="done", done=True, event="Case finished")
    if step in ("phase_a", "phase_b"):
        if gate != "ready":
            return Outcome("requeue")
        if session != "connected":
            return Outcome("requeue", event="Waiting for you to log in on the worker Chrome")
        if step == "phase_b" and not case.get("photos_done_at"):
            return Outcome("requeue")
        return run_phase("A" if step == "phase_a" else "B", case, writes=writes, driver=driver)
    if step == "intake":
        if case.get("status") == "pending_doc":
            return Outcome("done", event="Intake stopped: documents still missing")
        if case.get("status") != "phase_a":
            return Outcome("requeue")
        extra = ["photo_model"] if case.get("photo_count") and photo_worker else []
        extra.append("phase_a")
        return Outcome("done", event="Files ready for Phase A", enqueue=extra)
    if step == "photo_model":
        if not photo_worker:
            return Outcome("done", event="Photo model off")
        try:
            rows = namer(photos, (case.get("car_model") or "")[:120])
        except ModelError as e:
            return Outcome("failed", photo_fail=f"worker: {str(e)[:160]}", event="Photo model failed")
        return Outcome("done", photo_rows=rows, event="Photos named by the on-site model")
    return Outcome("failed", error="unknown step", event="Unknown job")


def followup_steps(case: dict, jobs: list[dict], *, writes: bool) -> list[str]:
    """phase_b after the desk is done; a second phase_a only once writes are allowed and the first pass did not save."""
    open_steps = {j["step"] for j in jobs if j["state"] in ("queued", "running")}
    out = []
    # one Phase B per Done press: due when the newest Done is later than the newest phase_b job, whatever state that job ended in.
    # Undo + Done again (also after a hand fix in Merimen) is a new press and queues a new one; a finished, failed or cancelled job is not
    # re-queued by itself. The snapshot is only the guard inside the step (photo_sync.phase_b), never what decides "due".
    b_jobs = [j for j in jobs if j["step"] == "phase_b"]
    newest = max((j.get("created_epoch") for j in b_jobs if j.get("created_epoch") is not None), default=None)
    done_at = case.get("done_epoch")
    due = not b_jobs or (newest is not None and done_at is not None and done_at > newest)
    if (
        case.get("status") in ("waiting_user", "phase_b")
        and case.get("photos_done_at")
        and case.get("photos_snapshot") is not None  # Done and its snapshot are two writes: never start in the gap (nor before migration 0010)
        and "phase_b" not in open_steps
        and due
    ):
        out.append("phase_b")
    dry_done = any(j["step"] == "phase_a" and j["state"] == "done" for j in jobs)
    if writes and case.get("status") == "phase_a" and not case.get("merimen_caseid") and dry_done and "phase_a" not in open_steps:
        out.append("phase_a")
    return out
