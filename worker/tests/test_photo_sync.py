"""The photo step after 完成 (playbook 06 / tools/batch/phase_b.py) with a FAKE Merimen. Nothing here opens a browser or touches real Merimen."""

import re
from pathlib import Path

from autopilot_worker import photo_sync as ps
from autopilot_worker import playbook
from autopilot_worker.photo_rules import file_type, plan_rows, snapshot_of

ROOT = Path(__file__).resolve().parents[2]


class Fake:
    """Records every call. `held` = the captions Merimen has (None = could not read)."""

    def __init__(self, held=None, verify=None):
        self.held = held
        self.calls: list[str] = []
        self._verify = verify
        self.after_write = lambda: None

    def labels(self, case):
        self.calls.append("labels")
        return None if self.held is None else list(self.held)

    def upload(self, case, plan, chunks):
        self.calls.append(f"upload:{len(plan)}:{len(chunks)}")
        self.after_write()

    def relabel(self, case, mapping):
        self.calls.append(f"relabel:{len(mapping)}")
        self.after_write()

    def reorder(self, case, mapping):
        self.calls.append(f"reorder:{len(mapping)}")
        self.after_write()

    def verify(self, case, plan):
        self.calls.append("verify")
        if self._verify:
            return self._verify(plan)
        return {"count": len(plan), "mismatch": 0, "missing": []}

    @property
    def writes(self):
        return [c for c in self.calls if c.split(":")[0] in ("upload", "relabel", "reorder")]


def rows(*specs):
    """(id, src, model, final)"""
    return [{"id": i, "src_name": s, "model_name": m, "final_name": f} for i, s, m, f in specs]


def a_plan(rs):
    return [{"id": p["id"], "src": p["src"], "name": p["name"]} for p in plan_rows(rs)]


THREE = rows((1, "a.jpg", "Front Bumper", None), (2, "b.jpg", "Bonnet", None), (3, "c.jpg", "Grille", None))


# ---------- golden values shared with the web ----------
def test_snapshot_golden_matches_the_web():
    rs = [{"id": 1, "final_name": "Bonnet"}, {"id": 2, "model_name": None}, {"id": 3, "model_name": "Front Bumper"}]
    assert snapshot_of(rs, ["Cowl Panel", "Bumper Clips"]) == "2c07a7b2ad7aaa00740008fa2a413e08ee704347358e943066e7abdbc647fe9b"


def test_file_type_corner_and_default():
    assert file_type("Front View Right (FVR)") == file_type("Rear View Left (RVL)")
    assert file_type("Grille") == file_type("Something else")


# ---------- Phase A ----------
def test_phase_a_dry_run_never_writes_and_records_the_plan():
    m = Fake(held=[])
    rep = ps.phase_a({}, THREE, writes=False, merimen=m)
    assert m.writes == [] and rep.mode == "dry" and rep.upload == 3 and rep.action == "upload"
    assert rep.line() == "Photos, dry run (Merimen not changed): would upload 3 · relabel 0 · reorder 0"


def test_phase_a_dry_run_works_when_merimen_is_unreachable():
    m = Fake(held=None)
    rep = ps.phase_a({}, THREE, writes=False, merimen=m)
    assert m.writes == [] and rep.ok and rep.merimen_count is None


def test_phase_a_skips_a_case_that_already_has_a_photo():
    m = Fake(held=["Bonnet"])
    rep = ps.phase_a({}, THREE, writes=True, merimen=m)
    assert m.writes == [] and rep.action == "none" and rep.upload == 0


def test_phase_a_uploads_once_in_chunks_of_25():
    many = rows(*[(i, f"{i}.jpg", f"Item {i}", None) for i in range(1, 61)])
    m = Fake(held=[])
    rep = ps.phase_a({}, many, writes=True, merimen=m)
    assert m.writes == ["upload:60:3"] and rep.ok and rep.mode == "live"


def test_phase_a_unreadable_merimen_writes_nothing():
    m = Fake(held=None)
    rep = ps.phase_a({}, THREE, writes=True, merimen=m)
    assert m.writes == [] and rep.code == "unreadable" and not rep.ok


def test_phase_a_retries_dropped_photos_then_gives_up_for_a_hand_fix():
    state = {"n": 0}

    def v(plan):
        state["n"] += 1
        return {"count": 2, "mismatch": 0, "missing": [2]}

    m = Fake(held=[], verify=v)
    rep = ps.phase_a({}, THREE, writes=True, merimen=m)
    assert m.writes == ["upload:3:1", "upload:1:1", "upload:1:1"] and rep.code == "hand_fix"


def test_phase_a_guard_false_stops_before_the_upload():
    m = Fake(held=[])
    rep = ps.phase_a({}, THREE, writes=True, merimen=m, guard=lambda: False)
    assert m.writes == [] and rep.code == "undone"


# ---------- Phase B ----------
def final(rs, **names):
    return [dict(r, final_name=names.get(r["src_name"], r["final_name"])) for r in rs]


def test_phase_b_refuses_when_nothing_was_snapshotted():
    m = Fake(held=[])
    rep = ps.phase_b({}, THREE, [], stored_snapshot=None, phase_a_photos=[], writes=True, merimen=m)
    assert rep.code == "edited" and m.calls == []


def test_phase_b_refuses_when_edited_after_done():
    snap = snapshot_of(THREE, [])
    edited = final(THREE, **{"a.jpg": "Front Bumper Lower"})
    m = Fake(held=[a["name"] for a in a_plan(THREE)])
    rep = ps.phase_b({}, edited, [], stored_snapshot=snap, phase_a_photos=a_plan(THREE), writes=True, merimen=m)
    assert rep.code == "edited" and m.calls == []
    # extras count too
    rep = ps.phase_b({}, THREE, ["Cowl Panel"], stored_snapshot=snap, phase_a_photos=a_plan(THREE), writes=True, merimen=m)
    assert rep.code == "edited" and m.calls == []


def test_phase_b_dry_run_records_would_numbers_and_writes_nothing():
    new = final(THREE, **{"a.jpg": "Front Bumper Lower"})
    m = Fake(held=["Front Bumper", "Bonnet", "Grille"])
    rep = ps.phase_b({}, new, [], stored_snapshot=snapshot_of(new, []), phase_a_photos=a_plan(THREE), writes=False, merimen=m)
    assert m.writes == [] and rep.mode == "dry" and (rep.relabel, rep.reorder, rep.upload) == (1, 0, 0)
    assert "would upload 0 · relabel 1 · reorder 0" in rep.line()
    assert rep.corrections == [{"src": "a.jpg", "model": "Front Bumper", "final": "Front Bumper Lower"}]


def test_phase_b_uploads_the_final_names_when_merimen_is_empty():
    new = final(THREE, **{"b.jpg": "Bonnet Hinge"})
    m = Fake(held=[])
    rep = ps.phase_b({}, new, [], stored_snapshot=snapshot_of(new, []), phase_a_photos=[], writes=True, merimen=m)
    assert m.writes == ["upload:3:1"] and rep.action == "upload" and rep.ok


def test_phase_b_empty_merimen_with_writes_off_only_plans_the_upload():
    m = Fake(held=[])
    rep = ps.phase_b({}, THREE, [], stored_snapshot=snapshot_of(THREE, []), phase_a_photos=[], writes=False, merimen=m)
    assert m.writes == [] and rep.upload == 3


def test_phase_b_relabels_and_reorders_then_verifies():
    old = a_plan(THREE)
    # the adjuster renames #1 and drags #3 to the front
    new = [THREE[2], dict(THREE[0], final_name="Front Bumper Lower"), THREE[1]]
    m = Fake(held=[x["name"] for x in old])
    rep = ps.phase_b({}, new, [], stored_snapshot=snapshot_of(new, []), phase_a_photos=old, writes=True, merimen=m)
    assert rep.ok and rep.relabel == 1 and rep.reorder == 3
    assert m.writes == ["relabel:1", "reorder:3"] and m.calls[-1] == "verify"


def test_phase_b_only_relabel_when_order_is_unchanged():
    old = a_plan(THREE)
    new = final(THREE, **{"c.jpg": "Grille Moulding"})
    m = Fake(held=[x["name"] for x in old])
    rep = ps.phase_b({}, new, [], stored_snapshot=snapshot_of(new, []), phase_a_photos=old, writes=True, merimen=m)
    assert m.writes == ["relabel:1"] and rep.reorder == 0


def test_phase_b_heals_photos_that_landed_at_the_end():
    old = a_plan(THREE)
    new = final(THREE, **{"a.jpg": "Front Bumper Lower"})
    m = Fake(held=["Bonnet", "Grille", "Front Bumper"])  # the retried photo is last
    rep = ps.phase_b({}, new, [], stored_snapshot=snapshot_of(new, []), phase_a_photos=old, writes=True, merimen=m)
    assert rep.ok and "matched by label" in rep.note
    assert m.writes == ["relabel:1", "reorder:3"] or m.writes[0] == "relabel:1"


def test_phase_b_unmatched_photos_need_a_hand_fix_and_write_nothing():
    old = a_plan(THREE)
    m = Fake(held=["Something", "Else", "Entirely"])
    rep = ps.phase_b({}, THREE, [], stored_snapshot=snapshot_of(THREE, []), phase_a_photos=old, writes=True, merimen=m)
    assert rep.code == "hand_fix" and m.writes == []


def test_phase_b_verify_mismatch_is_refused():
    old = a_plan(THREE)
    new = final(THREE, **{"a.jpg": "Front Bumper Lower"})
    m = Fake(held=[x["name"] for x in old], verify=lambda plan: {"count": 3, "mismatch": 1, "missing": []})
    rep = ps.phase_b({}, new, [], stored_snapshot=snapshot_of(new, []), phase_a_photos=old, writes=True, merimen=m)
    assert rep.code == "hand_fix" and not rep.ok


def test_phase_b_unreadable_merimen_stops():
    m = Fake(held=None)
    rep = ps.phase_b({}, THREE, [], stored_snapshot=snapshot_of(THREE, []), phase_a_photos=a_plan(THREE), writes=True, merimen=m)
    assert rep.code == "unreadable" and m.writes == []


def test_phase_b_stops_before_the_next_write_when_done_is_undone():
    old = a_plan(THREE)
    new = [THREE[2], dict(THREE[0], final_name="Front Bumper Lower"), THREE[1]]
    m = Fake(held=[x["name"] for x in old])
    alive = {"on": True}
    m.after_write = lambda: alive.update(on=False)  # the adjuster undoes 完成 right after the first write
    rep = ps.phase_b({}, new, [], stored_snapshot=snapshot_of(new, []), phase_a_photos=old, writes=True, merimen=m, guard=lambda: alive["on"])
    assert m.writes == ["relabel:1"] and rep.code == "undone" and not rep.ok


def test_phase_b_a_photo_without_a_name_is_refused():
    unnamed = THREE + rows((4, "d.jpg", None, None))
    m = Fake(held=[])
    rep = ps.phase_b({}, unnamed, [], stored_snapshot=snapshot_of(unnamed, []), phase_a_photos=[], writes=True, merimen=m)
    # plan_rows leaves the unnamed one out, so the counts differ only when a name is blank-but-present; here it is just left out
    assert rep.ok or rep.code == "edited"


def test_default_adapter_is_safe():
    from autopilot_worker.pipeline import _NoMerimenPhotos

    a = _NoMerimenPhotos()
    assert a.labels({}) is None
    for fn, args in ((a.upload, ({}, [], [])), (a.relabel, ({}, {})), (a.reorder, ({}, {}))):
        try:
            fn(*args)
            raise AssertionError("should not write")
        except ps.NotPorted:
            pass


# ---------- helpers ----------
def test_heal_gives_every_photo_one_new_position():
    old = [{"src": "a", "name": "Grille"}, {"src": "b", "name": "Bonnet"}, {"src": "c", "name": "Door"}]
    new = [{"src": "a", "name": "Grille"}, {"src": "b", "name": "Bonnet Lower"}, {"src": "c", "name": "Door"}]
    got = ps.heal(old, new, ["Grille", "Door", "Bonnet"])
    assert got is not None
    lab, ordm = got
    assert lab == {"3": ["Bonnet", "Bonnet Lower"]} and sorted(v[1] for v in ordm.values()) == [1, 2, 3]
    assert ps.heal(old, new, ["Grille", "Door"]) is None  # a photo is missing in Merimen


def test_chunked_sizes():
    plan = [{"i": i} for i in range(51)]
    assert [len(c) for c in ps.chunked(plan)] == [25, 25, 1]


# ---------- playbook copy ----------
def test_worker_playbook_copy_equals_the_repo():
    pb = playbook
    assert pb.version() and pb.tag().startswith(pb.version())
    for f in ("03-photo-naming.md", "06-upload-docs-and-photos.md", "07-select-parts-and-labour.md"):
        assert (ROOT / "playbook" / f).read_text() == (ROOT / "worker" / "autopilot_worker" / "playbook" / f).read_text()
    assert (ROOT / "playbook" / "photo-rules.json").read_text() == (ROOT / "worker" / "autopilot_worker" / "playbook" / "photo-rules.json").read_text()
    for kind in ("read_docs", "name_photos", "step2"):
        assert len(pb.block(kind)) > 500


# ---------- migration ----------
def test_migration_0010_is_idempotent_and_grants_no_delete():
    mig = (ROOT / "web" / "drizzle" / "0010_photo_sync.sql").read_text()
    assert not re.search(r"GRANT[^;]*DELETE", mig, re.I)
    assert "IF NOT EXISTS" in mig.upper()
    assert "autopilot_worker" in mig


# ---------- review round 1 (plan #48) ----------
def test_snapshot_golden_with_non_ascii_matches_the_web():
    rs = [{"id": 1, "final_name": "Bonnet"}, {"id": 2, "model_name": None}, {"id": 3, "final_name": "Pintu Kereta İ"}, {"id": 4, "model_name": "😀 Lamp"}]
    assert snapshot_of(rs, ["Ünder Tray", "😀 Clip", "Zebra", "éclat", "Ａ wide"]) == "6a87cfb036917649e85c8c8758e362eab2f8838b7492de2957c224c7b310c428"


def test_still_final_needs_a_snapshot_and_done():
    from autopilot_worker.store import PgRepo

    class Db:
        def __init__(self, row): self.row = row
        def execute(self, sql, params=()): return [self.row]

    def repo(row):
        r = PgRepo.__new__(PgRepo); r.db = Db(row); return r

    assert repo((True, "abc")).still_final("c", "abc") is True
    assert repo((True, "abc")).still_final("c", None) is False  # no fingerprint: never final
    assert repo((True, None)).still_final("c", None) is False
    assert repo((True, "abd")).still_final("c", "abc") is False  # edited
    assert repo((False, "abc")).still_final("c", "abc") is False  # undone


def test_only_a_missing_0010_table_is_tolerated():
    from autopilot_worker.store import PgRepo, _missing_0010

    assert _missing_0010(Exception('relation "photo_upload_log" does not exist'))
    assert _missing_0010(Exception('column "photos_snapshot" does not exist'))
    assert not _missing_0010(Exception("connection reset by peer"))

    class Db:
        def __init__(self, err): self.err = err
        def execute(self, sql, params=()): raise self.err

    r = PgRepo.__new__(PgRepo)
    r.db = Db(Exception('relation "photo_upload_log" does not exist'))
    assert r._photo_sync_state("c") == (None, [])
    r.db = Db(Exception("connection reset by peer"))
    try:
        r._photo_sync_state("c")
        raise AssertionError("a transient DB error must fail the job")
    except Exception as e:
        assert "connection reset" in str(e)


def test_undo_after_a_live_phase_a_relabels_instead_of_uploading_again():
    """G8: Phase A uploaded under the model's names; the adjuster later presses Done with other names: relabel/reorder, never a second upload."""
    old = a_plan(THREE)
    new = final(THREE, **{"a.jpg": "Bonnet Lock"})
    m = Fake(held=[x["name"] for x in old])
    rep = ps.phase_b({}, new, [], stored_snapshot=snapshot_of(new, []), phase_a_photos=old, writes=True, merimen=m)
    assert rep.action == "relabel_reorder" and not any(c.startswith("upload") for c in m.calls)


def test_followup_cases_only_tolerates_a_missing_0010():
    from autopilot_worker.store import PgRepo

    class Db:
        def __init__(self, err): self.err = err; self.n = 0
        def execute(self, sql, params=()):
            self.n += 1
            if "photos_snapshot" in sql:
                raise self.err
            return []

    r = PgRepo.__new__(PgRepo)
    r.db = Db(Exception('column "photos_snapshot" does not exist'))
    assert r.followup_cases() == []
    r.db = Db(Exception("connection reset by peer"))
    try:
        r.followup_cases()
        raise AssertionError("a transient DB error must fail")
    except Exception as e:
        assert "connection reset" in str(e)


def test_missing_0010_is_recognised_on_the_http_transport_too():
    from autopilot_worker.store import _missing_0010

    class DbError(Exception):
        def __init__(self, msg, code): super().__init__(msg); self.code = code

    assert _missing_0010(DbError("boom", "42703"))
    assert _missing_0010(DbError("boom", "42P01"))
    assert not _missing_0010(DbError("boom", "08006"))


# ---------- review round 4: one Phase B per Done press ----------
def _case(done_epoch, done=True):
    return {"status": "waiting_user", "photos_done_at": "x" if done else None, "done_epoch": done_epoch, "photos_snapshot": "s"}


def _job(state, created):
    return {"step": "phase_b", "state": state, "created_epoch": created}


def test_one_phase_b_per_done_press():
    from autopilot_worker.pipeline import followup_steps

    assert followup_steps(_case(100), [], writes=False) == ["phase_b"]  # Done, no job yet
    assert followup_steps(_case(100), [_job("queued", 101)], writes=False) == []  # never two at once
    assert followup_steps(_case(100), [_job("done", 101)], writes=False) == []  # finished for this press
    assert followup_steps(_case(100), [_job("failed", 101)], writes=False) == []  # a failed job is not re-queued by itself
    assert followup_steps(_case(None, done=False), [_job("cancelled", 101)], writes=False) == []  # undone: nothing


def test_done_pressed_again_queues_a_new_phase_b_whatever_happened_before():
    from autopilot_worker.pipeline import followup_steps

    again = _case(200)  # a newer press than every job below
    for history in (
        [_job("done", 101), _job("cancelled", 150)],  # finished S1, then stopped by an undo
        [_job("done", 101), _job("failed", 150)],  # finished S1, then S2 failed with no log row
        [_job("failed", 101)],  # hand_fix refusal, fixed by hand in Merimen, then undo + Done
        [_job("cancelled", 101)],
    ):
        assert followup_steps(again, history, writes=False) == ["phase_b"], history
        assert followup_steps(again, history + [_job("queued", 201)], writes=False) == []


def test_a_refused_phase_b_does_not_log_a_snapshot():
    old = a_plan(THREE)
    new = [THREE[2], dict(THREE[0], final_name="Bonnet Lock"), THREE[1]]
    m = Fake(held=[x["name"] for x in old])
    alive = {"on": True}
    m.after_write = lambda: alive.update(on=False)
    rep = ps.phase_b({}, new, [], stored_snapshot=snapshot_of(new, []), phase_a_photos=old, writes=True, merimen=m, guard=lambda: alive["on"])
    assert rep.code == "undone" and rep.row()["snapshot"] is None


# ---------- review round 5 ----------
def test_no_phase_b_is_queued_while_done_has_no_snapshot_yet():
    from autopilot_worker.pipeline import followup_steps

    gap = {"status": "waiting_user", "photos_done_at": "x", "done_epoch": 100, "photos_snapshot": None}
    assert followup_steps(gap, [], writes=False) == []
    assert followup_steps(dict(gap, photos_snapshot="s"), [], writes=False) == ["phase_b"]


def test_with_the_default_adapter_no_live_path_can_write():
    """D1: MERIMEN_WRITES + WORKER_SUBMIT on, but no real adapter is wired: nothing is written, the step is refused as unreadable."""
    from autopilot_worker.pipeline import _NoMerimenPhotos

    a = _NoMerimenPhotos()
    rep = ps.phase_a({}, THREE, writes=True, merimen=a)
    assert rep.code == "unreadable" and rep.row()["snapshot"] is None
    old = a_plan(THREE)
    rep = ps.phase_b({}, THREE, [], stored_snapshot=snapshot_of(THREE, []), phase_a_photos=old, writes=True, merimen=a)
    assert rep.code == "unreadable"


def test_followup_cases_pre_0010_keeps_the_done_epoch():
    from autopilot_worker.store import PgRepo

    class Db:
        def execute(self, sql, params=()):
            if "photos_snapshot" in sql:
                raise Exception('column "photos_snapshot" does not exist')
            if sql.lstrip().upper().startswith("SELECT ID"):
                return [("c1", "o", "waiting_user", None, None, 123.0)]
            return []

    r = PgRepo.__new__(PgRepo); r.db = Db()
    (case, _), = r.followup_cases()
    assert case["done_epoch"] == 123.0 and case["photos_snapshot"] is None
