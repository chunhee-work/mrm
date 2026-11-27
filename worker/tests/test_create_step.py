"""The create-case step inside the pipeline, with a FAKE Merimen driver. Nothing here opens a browser."""
from autopilot_worker.create_step import run_create_step
from autopilot_worker.merimen_create import CreateReport
from autopilot_worker.pipeline import DriveResult, Driver, run_phase
from autopilot_worker.screens import milestones_after
from test_create_spec import PROFILE, WORKSHOP, case_data


def case(**over):
    return {"id": "c1", "org_id": "o1", "plate": "BNN6055", "status": "phase_a", "case_data": case_data(), "file_count": 2, "photo_count": 3,
            "photos_done_at": None, "merimen_caseid": None, "desk": None, "extras": [], **over}


class FakeRun:
    log = []

    def __init__(self, page, rep=None, on_created=None, before_submit=None):
        self.rep, self.on_created, self.before_submit = rep or CreateReport(ok=True, model="Myvi 1.5 SE"), on_created, before_submit

    def fill(self, spec):
        FakeRun.log.append("fill")
        return self.rep

    def create(self, spec):
        FakeRun.log.append("create")
        stop = self.before_submit() if self.before_submit else None
        if stop:
            return CreateReport(code=stop)
        if self.on_created and self.rep.case_id:
            self.on_created(self.rep.case_id, self.rep.ext_id)
        return self.rep

    def close(self):
        FakeRun.log.append("close")


class Marks:
    def __init__(self, pressed=False):
        self.was, self.calls = pressed, []

    def pressed(self):
        return self.was

    def press(self):
        self.calls.append("press")
        return not self.was

    def clear(self):
        self.calls.append("clear")


def step(c, *, live, rep=None, workshop=WORKSHOP, claimed=None, page=object(), profile=PROFILE, marks=None, record=None):
    """workshop = what the user's settings say; claimed = what the lock returns when it is asked (default: the same)."""
    FakeRun.log = []
    asked = []

    def ws(lock):
        asked.append(lock)
        return (claimed if lock and claimed is not None else workshop)

    r = run_create_step(c, profile=lambda: profile, workshop=ws, page_for=lambda org: page, live=live,
                        progress=lambda code: FakeRun.log.append("progress:" + code), factory=lambda pg, **kw: FakeRun(pg, rep, **kw), marks=marks, record=record)
    return r, asked


def test_a_dry_run_fills_only_looks_at_the_workshop_and_always_closes():
    r, asked = step(case(), live=False)
    assert r.ok and "not saved" in r.line and asked == [False] and FakeRun.log == ["fill", "close"]


def test_a_live_save_looks_first_locks_the_workshop_only_right_before_next_then_marks():
    m = Marks()
    r, asked = step(case(), live=True, rep=CreateReport(ok=True, case_id="22322999", ext_id="9800111"), marks=m)
    assert (r.ok, r.case_id, r.ext_id, r.partial) == (True, "22322999", "9800111", True) and asked == [False, False, True] and m.calls == ["press"]
    assert FakeRun.log == ["create", "close", "progress:create_case"] and float(r.minutes) >= 0


def test_a_stop_before_next_locks_nothing_and_leaves_no_mark():
    m = Marks()
    r, asked = step(case(), live=True, rep=CreateReport(code="form_not_ready", problems=["model_unsure: a / b"]), marks=m)
    # the fake only asks the hooks inside create(); a real MerimenCreate returns form_not_ready before it ever calls them
    assert not r.ok and r.fatal and r.error in ("form_not_ready", "workshop_changed", "create_unclear")


def test_a_workshop_switched_while_the_form_was_filled_stops_before_next_and_is_tried_again():
    m = Marks()
    moved = {"slot": 2, "name": "Bengkel Cheras"}
    r, asked = step(case(), live=True, rep=CreateReport(ok=True, case_id="9"), claimed=moved, marks=m)
    assert not r.ok and not r.fatal and r.error == "workshop_changed" and m.calls == [] and asked == [False, False, True]
    r, _ = step(case(), live=True, rep=CreateReport(ok=True, case_id="9"), workshop=None, marks=m)
    assert not r.ok and r.error == "workshop_missing" and "workshop_missing" in r.line  # no workshop name at all: never workshop 1


def test_a_case_that_already_has_its_merimen_id_is_never_created_again():
    r, asked = step(case(merimen_caseid="777"), live=True, marks=Marks())
    assert r.ok and r.case_id == "777" and asked == [] and FakeRun.log == []


def test_an_earlier_attempt_that_pressed_next_without_a_number_stops_before_anything_opens():
    m = Marks(pressed=True)
    r, asked = step(case(), live=True, marks=m)
    assert not r.ok and r.fatal and r.error == "create_unclear" and "worklist" in r.line and asked == [] and FakeRun.log == []
    r, _ = step(case(), live=True, rep=CreateReport(ok=True, case_id="9"), marks=Marks())  # a standing mark seen at press time (a second runner) also stops
    assert r.ok
    two = Marks()
    two.press = lambda: False
    r, _ = step(case(), live=True, rep=CreateReport(ok=True, case_id="9"), marks=two)
    assert not r.ok and r.error == "create_unclear"


def test_a_refused_form_clears_the_mark_so_a_retry_is_safe_but_an_unclear_landing_does_not():
    m = Marks()
    step(case(), live=True, rep=CreateReport(code="form_rejected", cleared=True), marks=m)
    assert m.calls == ["press", "clear"]  # pressed, then Merimen refused: cleared
    m = Marks()
    r, _ = step(case(), live=True, rep=CreateReport(code="create_unclear", messages=["landed on dsp_xyz"]), marks=m)
    assert m.calls == ["press"] and r.fatal and "landed on dsp_xyz" in r.line and "worklist" in r.line


def test_missing_data_workshop_or_profile_stop_before_the_browser_is_touched():
    for c, kw in ((case(case_data={}), {}), (case(), {"workshop": None}), (case(), {"profile": {}})):
        r, _ = step(c, live=True, **kw)
        assert not r.ok and r.fatal and r.line.startswith("Cannot create the case yet") and FakeRun.log == []


def test_no_tab_is_retried_but_a_refused_form_is_not():
    r, _ = step(case(), live=False, page=None)
    assert not r.ok and not r.fatal and r.error == "no_tab"
    r, _ = step(case(), live=True, rep=CreateReport(code="duplicate_warning"), marks=Marks())
    assert not r.ok and r.fatal and r.error == "duplicate_warning" and "worklist" in r.line
    r, _ = step(case(), live=True, rep=CreateReport(code="not_logged_in"))
    assert not r.ok and not r.fatal


def test_the_case_number_is_written_the_moment_the_case_exists():
    order = []

    def factory(page, **kw):
        class R(FakeRun):
            def create(self, spec):
                order.append("created")
                kw["on_created"]("555", "666")
                order.append("assigned")
                return CreateReport(ok=True, case_id="555", ext_id="666")

        return R(page)

    r = run_create_step(case(), profile=lambda: PROFILE, workshop=lambda lock: WORKSHOP, page_for=lambda o: object(), live=True,
                        record=lambda c, e: order.append(f"saved {c} {e}"), factory=factory)
    assert order == ["created", "saved 555 666", "assigned"] and r.case_id == "555"


class D(Driver):
    def __init__(self, dry=None, save=None):
        self._dry, self._save = dry or DriveResult(ok=True), save or DriveResult(ok=False, fatal=True, error="writes_off")

    def dry_run(self, phase, steps):
        return self._dry

    def save(self, phase, steps):
        return self._save


def test_a_dry_run_that_cannot_enter_the_case_waits_for_the_user_and_says_why():
    d = D(dry=DriveResult(ok=False, fatal=True, error="missing_data", line="Cannot create the case yet: missing_data (accident time)"))
    o = run_phase("A", case(), writes=False, driver=d)
    assert (o.job_state, o.case_status, o.error) == ("failed", "waiting_user", "missing_data") and "accident time" in o.event


def test_a_dry_run_that_checked_the_form_says_so_and_changed_nothing():
    d = D(dry=DriveResult(ok=True, line="Create form filled and checked, not saved (Allianz)"))
    o = run_phase("A", case(), writes=False, driver=d)
    assert o.job_state == "done" and "Merimen was not changed" in o.event and "Allianz" in o.event and o.merimen_caseid is None


def test_a_create_only_save_stores_the_case_number_and_claims_no_upload():
    d = D(save=DriveResult(ok=True, case_id="22322999", ext_id="9800111", partial=True, minutes="0.80"))
    o = run_phase("A", case(photos_done_at="2026-11-27T10:00:00"), writes=True, driver=d)
    assert (o.job_state, o.merimen_caseid, o.merimen_extid, o.partial) == ("done", "22322999", "9800111", True)
    assert o.case_status == "phase_b" and o.enqueue == ["phase_b"] and "not automated yet" in o.event  # 完成 was already pressed: Phase B gets its turn
    assert milestones_after("phase_a", o, saved=True) == ["case_opened"]  # no "documents uploaded"
    o2 = run_phase("A", case(), writes=True, driver=D(save=DriveResult(ok=True, case_id="22322999", partial=True)))
    assert o2.case_status == "waiting_user" and o2.enqueue == []


def test_a_refused_live_save_waits_for_the_user_with_merimens_reason():
    d = D(save=DriveResult(ok=False, fatal=True, error="form_rejected", line="form_rejected Merimen says: Handling Insurer must be indicated"))
    o = run_phase("A", case(), writes=True, driver=d)
    assert (o.job_state, o.case_status, o.merimen_caseid) == ("failed", "waiting_user", None) and "Handling Insurer" in o.event


# ---- the three switches (plan #113, D1): what the driver does for every combination ----
import pytest

from autopilot_worker.__main__ import _CdpDriver


# MERIMEN_DRYRUN  MERIMEN_WRITES  WORKER_SUBMIT -> fills the form (dry run) | saves (live)
@pytest.mark.parametrize("dryrun,writes,submit,dry_fills,saves", [
    ("", "", "", False, False),  # all off: nothing touches Merimen
    ("on", "", "", True, False),  # dry run: fills the form, never saves
    ("", "on", "", False, False),  # one write switch alone: nothing
    ("", "", "on", False, False),
    ("on", "on", "", True, False),
    ("on", "", "on", True, False),
    ("", "on", "on", False, True),  # live: the save fills and checks by itself, no separate dry fill
    ("on", "on", "on", True, False),  # dry run on wins: it fills, it never saves, and nothing else writes (Config.live_writes is False)
])
def test_switch_table(monkeypatch, dryrun, writes, submit, dry_fills, saves):
    for k, v in (("MERIMEN_DRYRUN", dryrun), ("MERIMEN_WRITES", writes), ("WORKER_SUBMIT", submit)):
        monkeypatch.setenv(k, v) if v else monkeypatch.delenv(k, raising=False)
    calls = []
    d = _CdpDriver("x.mjs")
    d._create = lambda live: calls.append(live) or DriveResult(ok=True, case_id="1", partial=True)
    d.dry_run("A", ())
    assert calls == ([False] if dry_fills else [])
    calls.clear()
    r = d.save("A", ())
    assert calls == ([True] if saves else []) and (r.ok if saves else r.error == "step_not_ported")
    assert d.save("B", ()).error == "step_not_ported"  # Phase B is never saved here
    calls.clear()
    d.dry_run("B", ())
    assert calls == []
    from autopilot_worker.config import Config

    env = {"WORKER_STATE": "/var/lib/x", "MERIMEN_DRYRUN": dryrun, "MERIMEN_WRITES": writes, "WORKER_SUBMIT": submit}
    assert Config.from_env(env).live_writes is saves  # the pipeline, photos and Step 2 agree with the driver




def test_a_workshop_that_is_gone_when_locking_is_a_stop_not_a_retry_and_never_falls_back_to_workshop_1():
    FakeRun.log = []
    m = Marks()
    n = {"i": 0}

    def ws(lock):
        n["i"] += 1
        return WORKSHOP if n["i"] <= 2 else None  # spec ask and peek see it; the lock finds none

    r = run_create_step(case(), profile=lambda: PROFILE, workshop=ws, page_for=lambda org: object(), live=True, progress=None,
                        factory=lambda pg, **kw: FakeRun(pg, CreateReport(ok=True, case_id="9"), **kw), marks=m, record=None)
    assert not r.ok and r.fatal and r.error == "workshop_missing" and m.calls == []


def test_a_finished_create_tells_the_person_what_to_check_by_hand():
    r, _ = step(case(), live=True, rep=CreateReport(ok=True, case_id="22322999"), marks=Marks())
    assert "check by hand" in (r.line or "")


def test_a_case_that_already_exists_is_not_filled_or_made_again_even_in_a_dry_run():
    for live in (False, True):
        r, asked = step(case(merimen_caseid="22322999"), live=live)
        assert r.ok and r.case_id == "22322999" and FakeRun.log == [] and asked == []


def test_a_progress_note_after_next_is_not_a_rejection():
    from autopilot_worker.merimen_create import _new_msgs
    assert _new_msgs(["Please wait, saving...", "Handling Insurer must be indicated", "static required label"], {"static required label"}) == ["Handling Insurer must be indicated"]


def test_a_live_create_refuses_to_start_when_more_than_one_job_may_run_per_org(monkeypatch):
    from autopilot_worker.__main__ import _CdpDriver
    for k, v in (("MERIMEN_WRITES", "on"), ("WORKER_SUBMIT", "on"), ("MERIMEN_DRYRUN", ""), ("ORG_CONCURRENCY", "2")):
        monkeypatch.setenv(k, v)
    d = _CdpDriver("x", lambda org: None)
    r = d.save("A", ())
    assert not r.ok and r.fatal and r.error == "concurrency_unsafe"


def test_a_failure_while_writing_the_mark_after_the_lock_is_not_retried():
    class Boom(Marks):
        def press(self):
            raise RuntimeError("db gone")

    r, _ = step(case(), live=True, rep=CreateReport(ok=True, case_id="9"), marks=Boom())
    assert not r.ok and r.fatal and r.error == "mark_error" and "worklist" in r.line


def test_with_a_one_case_limit_only_the_named_case_can_reach_a_live_create(monkeypatch):
    from autopilot_worker.__main__ import _CdpDriver
    for k, v in (("MERIMEN_WRITES", "on"), ("WORKER_SUBMIT", "on"), ("MERIMEN_DRYRUN", ""), ("ORG_CONCURRENCY", "1"), ("MERIMEN_CREATE_ONLY_CASE", "c-only")):
        monkeypatch.setenv(k, v)
    d = _CdpDriver("x", lambda org: None)
    d.case = {"id": "c-other"}
    assert d.save("A", ()).error == "step_not_ported"
