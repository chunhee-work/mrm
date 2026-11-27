"""The create-case step between the pipeline and Merimen: one function for the dry run and the live save.

dry run (live=False): fill the create form in a new tab, read it back, close the tab. Nothing is saved; the case's workshop is only
looked at (peek), so the user can still switch it.

live save (live=True), in this order:
  1. a case that already has its Merimen number is skipped; a case whose earlier attempt pressed Next but stored no number STOPS
     (a retry could make a second case: a person looks in the worklist);
  2. the form is filled and every check must pass (the workshop is only looked at so far);
  3. right before Next: the workshop is looked at again (a switch stops the case, nothing locked), then LOCKED (claim_workshop_for_case, and it
     must still be the one the form holds), then the "Next pressed" mark is written. A stop before the lock leaves both untouched;
  4. Next; the case number is written the moment the page shows it, before the manager and adjuster are set."""

from __future__ import annotations

import time

from .create_spec import SpecError, build_spec
from .merimen_create import MerimenCreate
from .pipeline import DriveResult

# failures before Next, or where nothing was changed: tried again later (the job's 3 attempts). Everything else is for a person.
RETRY = {"not_logged_in", "form_not_open", "form_error", "workshop_changed"}


def run_create_step(case: dict, *, profile, workshop, page_for, live: bool, progress=None, factory=MerimenCreate, record=None, marks=None) -> DriveResult:
    """`profile()` -> {"manager","adjuster",...} or None. `workshop(lock)` -> {"slot","name"} or None. `page_for(org_id)` -> the Merimen tab or None.
    `marks` -> the object from PgRepo.create_marks (pressed / press / clear), or None."""
    if case.get("merimen_caseid"):  # dry run too: there is nothing to fill for a case that exists
        return DriveResult(ok=True, case_id=case["merimen_caseid"], partial=True, line="check by hand: the manager and adjuster, and the claimant insurer and policy")
    if live and marks is not None and marks.pressed():
        return DriveResult(ok=False, fatal=True, error="create_unclear", line="An earlier attempt pressed Create in Merimen but no case number was saved. "
                           "Look for this plate in Merimen's worklist before anything is tried again.")
    try:
        spec = build_spec(case.get("case_data"), case.get("plate") or "", profile(), workshop(False))
    except SpecError as e:
        return DriveResult(ok=False, fatal=True, error=e.code, line=f"Cannot create the case yet: {e.code}" + (f" ({e.detail})" if e.detail else ""))
    page = page_for(case["org_id"])
    if page is None:
        return DriveResult(ok=False, error="no_tab", line="No logged-in Merimen tab")

    def same(w) -> bool:
        return bool(w) and (int(w.get("slot") or 1), " ".join((w.get("name") or "").split())) == (spec.workshop_slot, spec.workshop_name)

    def before_submit():
        try:
            peek = workshop(False)
        except Exception:  # noqa: BLE001
            return "form_error"  # nothing locked, nothing written: a retry is safe
        if not peek:
            return "workshop_missing"  # no workshop for this case any more: stop, never fall back to workshop 1
        if not same(peek):
            return "workshop_changed"  # the user switched it while the form was filled: nothing is locked, nothing was pressed
        try:
            locked = workshop(True)  # locks it: from here the user cannot switch this case's workshop (a switch right now is caught here)
        except Exception:  # noqa: BLE001
            return "form_error"  # the lock statement itself failed: nothing is locked
        if not locked:
            return "workshop_missing"
        if not same(locked):
            return "workshop_changed"
        try:
            if marks is not None and not marks.press():
                return "create_unclear"
        except Exception:  # noqa: BLE001  (the workshop IS locked and the mark may have been written: no retry, a person looks)
            return "mark_error"
        return None

    started = time.monotonic()
    kw = {"on_created": record, "before_submit": before_submit} if live else {}
    run = factory(page, **kw)
    try:
        rep = run.create(spec) if live else run.fill(spec)
    finally:
        run.close()
    if not live:
        if rep.ok:
            warn = list(spec.warnings) + (["the model has no price data (white option)"] if rep.white_model else [])
            return DriveResult(ok=True, line=f"Create form filled and checked, not saved ({rep.readback or spec.insurer}; workshop {spec.workshop_slot}; model {rep.model or 'unchecked'})" + (f"; {'; '.join(warn)}" if warn else ""))
        return DriveResult(ok=False, fatal=rep.code not in RETRY, error=rep.code or "form", line=f"Create form not ready: {rep.line()}")
    if rep.cleared and marks is not None:
        marks.clear()  # Merimen made no case: a retry is safe again
    if rep.case_id:
        if progress:
            progress("create_case")
        minutes = f"{(time.monotonic() - started) / 60:.2f}"
        line = {"manager_adjuster_not_set": "Manager or adjuster was not found in Merimen: set them by hand"}.get(rep.note or "", "")
        line = (line + "; " if line else "") + "check by hand: the claimant insurer and policy stored on the case, and the manager and adjuster"
        if rep.white_model:
            line = (line + "; " if line else "") + "the model has no price data (white option)"
        return DriveResult(ok=True, case_id=rep.case_id, ext_id=rep.ext_id, minutes=minutes, partial=True, line=line or None)
    hint = " Look for this plate in Merimen's worklist before anything is tried again." if rep.code in ("create_unclear", "duplicate_warning", "unexpected_dialog", "mark_error") else ""
    return DriveResult(ok=False, fatal=rep.code not in RETRY, error=rep.code or "create", line=((rep.line() or "The case was not created") + hint).strip())
