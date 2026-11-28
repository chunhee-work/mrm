"""Step 2 (Select Parts + Labour) from the final photo names, the two-way check, the AI review and the learning rows, all with a FAKE Merimen.
Nothing here opens a browser or touches real Merimen."""

import json

from autopilot_worker import learning, playbook, step2_run
from autopilot_worker.pipeline import Driver, DriveResult, Outcome, run_phase
from autopilot_worker.photo_rules import snapshot_of
from autopilot_worker.step2 import build_plan
from autopilot_worker.step2_check import two_way
from test_photo_sync import Fake, rows

CAT = {
    "cat": [
        ["10@1", "CT1 [Front Panel] Bumper Front Cover", 0], ["10@2", "Bumper Front Sensor", 0], ["10@3", "Bumper Front Retainer LH", 0],
        ["10@4", "Bumper Front Retainer RH", 0], ["10@5", "Bumper Clips", 0], ["20@6", "Bonnet", 0], ["20@7", "Bonnet Hinge LH", 0],
        ["20@8", "Bonnet Hinge RH", 0], ["40@9", "Door Mirror RH", 0], ["10@10", "Headlamp Assy LH", 0], ["10@11", "Grille Front", 0],
    ],
    "labs": [["Bonnet", 0], ["Bumper Front", 0]],
}


def labour():
    return step2_run.labour_rules()


class FakeStep2:
    def __init__(self, cat=CAT, selected="plan"):
        self.cat, self.sel, self.calls, self.applied = cat, selected, [], None

    def catalogue(self, case):
        self.calls.append("catalogue")
        return self.cat

    def apply(self, case, plan):
        self.calls.append("apply")
        self.applied = plan

    def selected(self, case):
        self.calls.append("selected")
        if self.sel == "plan":
            lab = {v: l for v, l, *_ in self.cat["cat"]}
            return [(lab[v], "1") for v in self.applied["CP"]] + [(m, "1") for m in self.applied["manual"]]
        return self.sel


DESK = rows((1, "a.jpg", "Front Bumper", None), (2, "b.jpg", "Bonnet", None), (3, "c.jpg", "Headlamp LH", "Door Mirror RH"), (4, "d.jpg", "Front View", None))
CASE = {"id": "c1", "org_id": "o1", "car_model": "Perodua Myvi", "case_data": {}}


# ---------- the plan ----------
def test_plan_picks_photo_items_and_their_companions():
    p = build_plan(["Front Bumper", "Bonnet", "Door Mirror RH", "Front View"], CAT, "front", labour())
    assert {"10@1", "20@6", "40@9"} <= set(p["CP"])  # photographed items
    assert {"10@5", "10@2", "10@3", "10@4", "20@7", "20@8"} <= set(p["CP"])  # clips, sensor, retainers, hinges
    assert p["why"]["10@1"] == "photo: Front Bumper" and p["why"]["20@7"].startswith("companion")
    assert "Bonnet" in p["N"] and p["missing"] == []  # a view photo is never a part


def test_plan_names_a_missing_catalogue_item_as_a_manual_row():
    p = build_plan(["Floor Panel RH"], CAT, "front", labour())
    assert p["missing"] == ["Floor Panel RH"]


# ---------- the two-way check ----------
def test_two_way_add_when_a_photo_has_no_row():
    r = two_way(["Door Mirror RH", "Rear Lamp LH"], [("Door Mirror RH", "1")])
    assert r["ok"] is False and len(r["add"]) == 1 and "Rear Lamp LH" in r["add"][0]


def test_two_way_remove_when_a_changed_name_is_still_ticked():
    r = two_way(["Door Mirror RH"], [("Door Mirror RH", "1"), ("Door Mirror LH", "1")], ["Door Mirror LH"])
    assert r["add"] == [] and len(r["remove"]) == 1 and "Door Mirror LH" in r["remove"][0]


def test_two_way_a_companion_rule_keeps_an_unchanged_row_and_ok_is_true_when_matching():
    r = two_way(["Front Bumper", "Bonnet"], [("Bumper Front Cover", "1"), ("Bonnet", "1"), ("Bonnet Hinge LH", "1")], ["Bonnet Hinge LH"])
    assert r["ok"] is True  # Hinge is kept by a companion rule even though its name was "changed"


def test_two_way_a_row_with_qty_2_covers_both_sides():
    assert two_way(["Rear Lamp LH", "Rear Lamp RH"], [("Lamp Assembly Rear LH", "2")])["add"] == []


# ---------- the run ----------
def test_dry_run_plans_checks_and_never_ticks():
    m = FakeStep2()
    rep = step2_run.run(CASE, DESK, ["Grille Front"], writes=False, merimen=m)
    assert m.calls == ["catalogue"] and rep.mode == "dry" and rep.action == "plan" and rep.ok
    assert rep.plan["parts"] >= 4 and "10@11" in rep.plan["values"]  # the Space part "Grille Front" is planned like a photo name
    assert rep.check["ok"] is True
    assert rep.line().startswith("Parts and labour, dry run (Merimen not changed): would ")


def test_dry_run_with_the_default_adapter_records_no_plan_and_is_not_an_error():
    rep = step2_run.run(CASE, DESK, [], writes=False, merimen=Driver().merimen_step2(CASE))
    assert rep.action == "none" and rep.ok and rep.plan == {} and "dry run" in rep.note


def test_live_with_the_default_adapter_cannot_write_and_says_so():
    d = Driver().merimen_step2(CASE)
    rep = step2_run.run(CASE, DESK, [], writes=True, merimen=d)
    assert rep.action == "unreadable" and not rep.ok and rep.code == "unreadable"


def test_live_ticks_then_reads_back_and_passes_the_two_way_check():
    m = FakeStep2()
    rep = step2_run.run(CASE, DESK, [], writes=True, merimen=m)
    assert m.calls == ["catalogue", "apply", "selected"] and rep.action == "applied" and rep.check["ok"]
    assert set(m.applied["CP"]) == set(rep.plan["values"])


def test_live_refuses_when_the_rows_read_back_miss_a_photo_item():
    m = FakeStep2(selected=[("Bonnet", "1")])
    rep = step2_run.run(CASE, DESK, [], writes=True, merimen=m)
    assert rep.action == "refused" and rep.code == "check" and rep.check["add"]
    assert "fix by hand" in rep.note


def test_a_phase_b_run_again_flags_a_part_ticked_for_a_name_the_adjuster_dropped_since():
    class Left(FakeStep2):  # the first Phase B ticked "Tail Lamp LH" for a name the adjuster has changed since
        def selected(self, case):
            return super().selected(case) + [("Tail Lamp LH", "1")]
    again = {**CASE, "phase_a_photos": [{"name": "Tail Lamp LH"}, {"name": "Bonnet"}]}
    rep = step2_run.run(again, DESK, [], writes=True, merimen=Left())
    assert rep.action == "refused" and rep.code == "check" and "Tail Lamp LH" in str(rep.check["remove"])
    assert step2_run.run(CASE, DESK, [], writes=True, merimen=Left()).check["ok"]  # without that history it is not flagged


def test_live_stops_before_ticking_when_done_was_undone():
    m = FakeStep2()
    rep = step2_run.run(CASE, DESK, [], writes=True, merimen=m, guard=lambda: False)
    assert rep.action == "refused" and rep.code == "undone" and "apply" not in m.calls


def test_final_names_not_model_names_drive_the_plan():
    m = FakeStep2()
    rep = step2_run.run(CASE, DESK, [], writes=False, merimen=m)
    assert "40@9" in rep.plan["values"]  # photo 3: model said Headlamp LH, the adjuster set Door Mirror RH
    assert "10@10" not in rep.plan["values"]


# ---------- the AI review reads the playbook ----------
class Reviewer:
    def __init__(self, answer=None, boom=False):
        self.answer, self.boom, self.seen = answer, boom, None

    def review(self, system, user):
        self.seen = (system, user)
        if self.boom:
            raise RuntimeError("model down")
        return self.answer


def test_the_prompt_carries_the_step2_playbook_files_and_the_case():
    r = Reviewer({"notes": "fine"})
    step2_run.run(CASE, DESK, [], writes=False, merimen=FakeStep2(), reviewer=r)
    system, user = r.seen
    assert system.startswith(playbook.block("step2")[:200])
    for f in playbook.SECTIONS["step2"]:
        assert f'<playbook_file name="{f}">' in system
    assert "Answer with ONE JSON object" in system and playbook.version() in system
    body = json.loads(user)
    assert "Door Mirror RH" in body["photo_names_and_space_parts"] and any(c.startswith("10@1 | ") for c in body["catalogue_values"])


def test_ai_can_add_a_catalogue_item_and_remove_a_companion_but_never_a_photographed_item():
    r = Reviewer({
        "add": [{"value": "10@11", "reason": "grille cracked in the photo"}, {"value": "99@1", "reason": "invented"}],
        "remove": [{"value": "10@5", "reason": "no clips on this car"}, {"value": "10@1", "reason": "looks intact"}],
        "manual": [{"name": "Rear Lamp Panel LH", "reason": "no catalogue part"}], "notes": "ok",
    })
    rep = step2_run.run(CASE, DESK, [], writes=False, merimen=FakeStep2(), reviewer=r)
    assert rep.ai["added"] == ["10@11"] and rep.ai["removed"] == ["10@5"] and rep.ai["manual"] == ["Rear Lamp Panel LH"]
    assert {x.get("add") or x.get("remove") for x in rep.ai["rejected"]} == {"99@1", "10@1"}
    assert "10@1" in rep.plan["values"] and "10@5" not in rep.plan["values"] and "Rear Lamp Panel LH" in rep.plan["missing"]
    assert rep.ai["tag"] == playbook.tag()


def test_an_ai_failure_or_a_garbage_answer_leaves_the_rule_plan_standing():
    base = step2_run.run(CASE, DESK, [], writes=False, merimen=FakeStep2()).plan["values"]
    for r in (Reviewer(boom=True), Reviewer(answer=None), Reviewer(answer={"add": "nonsense", "remove": [7]})):
        rep = step2_run.run(CASE, DESK, [], writes=False, merimen=FakeStep2(), reviewer=r)
        assert rep.plan["values"] == base and rep.ok


def test_the_prompt_is_cut_at_the_budget_and_says_so():
    big = {"cat": [[f"1@{i}", f"Part {i}", 0] for i in range(step2_run.MAX_CATALOGUE_LINES + 5)], "labs": []}
    _, user = step2_run.prompt(["Bonnet"], {"CP": [], "pick": {}, "why": {}, "missing": [], "N": [], "R": []}, big, None)
    lines = json.loads(user)["catalogue_values"]
    assert len(lines) == step2_run.MAX_CATALOGUE_LINES + 1 and lines[-1].startswith("... 5 more")


# ---------- learning data ----------
def test_learning_rows_carry_the_final_name_and_flag_a_correction():
    desk = [{"id": 1, "model_name": "Bonnet", "final_name": None, "content_hash": "h1", "blob_path": "o/c/p1"},
            {"id": 2, "model_name": "Headlamp LH", "final_name": "Door Mirror RH", "content_hash": "h2", "blob_path": "o/c/p2"},
            {"id": 3, "model_name": None, "final_name": None}]
    got = learning.rows_for(CASE, desk)
    assert [(g["photo_id"], g["label"], g["changed"]) for g in got] == [(1, "Bonnet", False), (2, "Door Mirror RH", True)]
    assert got[1]["model_name"] == "Headlamp LH" and got[1]["content_hash"] == "h2"


# ---------- Phase B end to end (fake Merimen) ----------
def case_b():
    return {**CASE, "photos_done_at": "2026-11-21T10:00:00", "photo_count": 4, "file_count": 2,
            "case_data": {"plate": "ABC1", "client_vehicle": {"chassis_no": "X", "model": "Myvi"}, "police": {"report_no": "R1", "accident_datetime": "d"},
                          "at_fault": {"policy": {"policy_no": "P"}}},
            "desk": DESK, "extras": [], "photos_snapshot": snapshot_of(DESK, []), "phase_a_photos": []}


class D(Driver):
    def __init__(self, m2=None, photos=None):
        self.m2, self.photos = m2 or FakeStep2(), photos or Fake(held=[])

    def merimen_photos(self, case):
        return self.photos

    def merimen_step2(self, case):
        return self.m2


def test_phase_b_dry_run_logs_the_plan_and_the_learning_rows_and_changes_nothing():
    d = D()
    o = run_phase("B", case_b(), writes=False, driver=d)
    assert o.job_state == "done" and d.m2.calls == ["catalogue"] and d.photos.writes == []
    assert o.step2_log["action"] == "plan" and o.step2_log["mode"] == "dry" and o.step2_log["playbook"] == playbook.tag()
    assert [(x["photo_id"], x["changed"]) for x in o.learning] == [(1, False), (2, False), (3, True), (4, False)]
    assert "Parts and labour, dry run" in o.event


def test_phase_b_a_refused_photo_step_plans_nothing_and_learns_nothing():
    c = case_b(); c["photos_snapshot"] = "stale"
    d = D()
    o = run_phase("B", c, writes=False, driver=d)
    assert o.step2_log is None and o.learning is None and d.m2.calls == []


def test_phase_b_default_adapters_never_write_even_with_writes_on():
    o = run_phase("B", case_b(), writes=True, driver=Driver())
    assert o.job_state == "requeue" and o.case_status is None  # Merimen cannot be read: nothing was written, nothing was saved
    assert o.step2_log is None


def test_phase_b_a_failed_two_way_check_stops_for_a_hand_fix_and_keeps_the_log():
    d = D(FakeStep2(selected=[("Bonnet", "1")]), Fake(held=[]))
    o = run_phase("B", case_b(), writes=True, driver=d)
    assert o.job_state == "failed" and o.case_status == "waiting_user" and o.error == "step2"
    assert o.step2_log["action"] == "refused" and o.step2_log["check"]["add"]


def test_phase_b_select_parts_that_meets_the_login_form_is_a_retry_with_relogin_ready():
    from autopilot_worker import login_seen

    class Broke(FakeStep2):
        def apply(self, case, plan):
            login_seen.mark()
            e = RuntimeError("login form")
            e.code = "unreadable"
            raise e

    d = D(Broke(), Fake(held=[]))
    o = run_phase("B", case_b(), writes=True, driver=d)
    assert o.job_state == "failed" and o.case_status == "waiting_user"  # re-login off: the old stop
    d = D(Broke(), Fake(held=[]))
    d.relogin_ready = True
    o = run_phase("B", case_b(), writes=True, driver=d)
    assert o.job_state == "requeue" and o.error == "step2" and o.case_status is None


def test_phase_b_a_browser_or_network_break_on_select_parts_is_tried_again_and_logged(capsys):
    class PwError(Exception):
        pass

    PwError.__name__ = "Error"
    PwError.__module__ = "playwright._impl._errors"

    for err in (PwError("Target page, context or browser has been closed"), TimeoutError("timed out"), OSError(110, "Connection timed out")):
        class Broke(FakeStep2):
            def apply(self, case, plan, err=err):
                raise err

        o = run_phase("B", case_b(), writes=True, driver=D(Broke(), Fake(held=[])))
        assert o.job_state == "requeue" and o.error == "step2" and o.stop_error == "step2" and o.case_status is None
        assert "trying again" in o.event
    assert "step2 Error msg=Target page" in capsys.readouterr().err


def test_phase_b_a_page_that_said_no_still_stops_for_a_person():
    class Broke(FakeStep2):
        def apply(self, case, plan):
            raise ValueError("bad row")

    o = run_phase("B", case_b(), writes=True, driver=D(Broke(), Fake(held=[])))
    assert o.job_state == "failed" and o.case_status == "waiting_user" and "(ValueError)" in o.event


# ---------- the real reviewer (HTTP faked) ----------
def test_the_anthropic_reviewer_sends_the_playbook_as_the_cached_system_prompt_and_parses_the_json():
    from autopilot_worker.step2_ai import AnthropicStep2Reviewer, from_env

    sent = {}

    def post(url, headers, body, timeout):
        sent.update(url=url, headers=headers, body=body)
        return {"content": [{"type": "text", "text": 'Here you go: {"add": [], "notes": "ok"} done'}]}

    rep = step2_run.run(CASE, DESK, [], writes=False, merimen=FakeStep2(), reviewer=AnthropicStep2Reviewer("k", post=post))
    assert rep.ai["notes"] == "ok" and sent["body"]["system"][0]["cache_control"] == {"type": "ephemeral"}
    assert "07-select-parts-and-labour.md" in sent["body"]["system"][0]["text"] and "ABC" not in sent["body"]["messages"][0]["content"]
    assert from_env({}) is None and from_env({"STEP2_AI": "on"}) is None and from_env({"STEP2_AI": "on", "ANTHROPIC_API_KEY": "k"}) is not None


def test_the_site_and_the_worker_read_the_same_step2_files():
    import re
    from pathlib import Path

    ts = (Path(__file__).resolve().parents[2] / "web/src/lib/playbook/prompt.ts").read_text()
    m = re.search(r"step2:\s*\[([^\]]*)\]", ts)
    assert re.findall(r'"([^"]+)"', m.group(1)) == playbook.SECTIONS["step2"]


# ---------- the switches ----------
def test_merimen_may_only_be_changed_when_both_switches_are_on():
    from autopilot_worker.config import Config

    for env, want in (({}, False), ({"MERIMEN_WRITES": "on"}, False), ({"WORKER_SUBMIT": "on"}, False), ({"MERIMEN_WRITES": "on", "WORKER_SUBMIT": "on"}, True)):
        assert Config.from_env({"WORKER_STATE": "/var/lib/x", **env}).live_writes is want


def test_phase_b_goes_on_to_checks_only_if_the_names_it_saved_are_still_final():
    # the database decides in the same write (tests/test_store_sql.py): the step only says which fingerprint must still be there
    class Saving(D):
        def save(self, phase, steps):
            return DriveResult(ok=True, total_rm="100.00")
    c = case_b()
    o = run_phase("B", c, writes=True, driver=Saving())
    assert o.job_state == "done" and o.case_status == "checking" and o.enqueue == ["checks"]
    assert o.require_snapshot == c["photos_snapshot"] and o.require_snapshot
    assert "names changed meanwhile" in o.stale_event


def test_phase_b_a_broken_select_parts_page_stops_for_a_person():
    from autopilot_worker.merimen_step2 import Step2Error

    class Broken(FakeStep2):
        def apply(self, case, plan):
            raise Step2Error("no_save_button")

    o = run_phase("B", case_b(), writes=True, driver=D(Broken(), Fake(held=[])))
    assert o.job_state == "failed" and o.case_status == "waiting_user" and o.error == "step2" and "no_save_button" in o.event


def test_phase_b_estimate_details_saved_stops_before_checks_and_says_so():
    class Est(D):
        def save(self, phase, steps):  # what _CdpDriver.save("B") returns after merimen_estimate filled and saved the details
            return DriveResult(ok=False, error="step_not_ported", line="Estimate details set: conditions on 3 part rows, misc 2. Checks and submit are not automated yet.")
    o = run_phase("B", case_b(), writes=True, driver=Est())
    assert o.job_state == "done" and o.case_status is None and o.enqueue == []  # never "Case finished" without checks
    assert "Parts and labour" in o.event and "Estimate details set" in o.event and "not automated yet" in o.event


def test_phase_b_estimate_details_that_did_not_stick_wait_for_a_person():
    class Est(D):
        def save(self, phase, steps):
            return DriveResult(ok=False, fatal=True, error="estimate", line="Estimate details stopped: 1 part rows still have no Damage Condition.")
    o = run_phase("B", case_b(), writes=True, driver=Est())
    assert o.job_state == "failed" and o.case_status == "waiting_user" and "no Damage Condition" in o.event


def test_phase_b_a_failed_pre_submit_check_says_saved_and_waits_for_a_person():
    class Est(D):
        def save(self, phase, steps):
            return DriveResult(ok=False, fatal=True, error="checks", line="Estimate details saved. Not submitted, 1 to fix: total RM5,200.00 is below RM6,000")
    o = run_phase("B", case_b(), writes=True, driver=Est())
    assert o.job_state == "failed" and o.case_status == "waiting_user" and o.error == "checks"
    assert o.event.startswith("Phase B: Estimate details saved. Not submitted") and "not saved" not in o.event
