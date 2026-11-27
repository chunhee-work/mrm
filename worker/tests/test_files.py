"""Downloaded case files on the worker disk: one folder per case, one name per photo, names from the database cannot leave the
folder, and the folder is gone when the job ends (PDFs with ID numbers used to stay under <state>/files for ever)."""
import os

import pytest

from autopilot_worker import loop
from autopilot_worker.blobstore import local_file, remove_case_files, sweep_old_files, write_private
from autopilot_worker.config import Config
from autopilot_worker.loop import tick
from autopilot_worker.photos import Prediction, names_for_photos
from autopilot_worker.pipeline import Driver


def test_a_file_goes_under_its_case_and_carries_its_id(tmp_path):
    root = str(tmp_path / "files")
    assert local_file(root, "case1", 7, "front.jpg") == os.path.join(root, "case1", "7-front.jpg")
    # two photos of one case with the same name no longer overwrite each other; the same name in two cases neither
    assert local_file(root, "case1", 8, "front.jpg") != local_file(root, "case1", 7, "front.jpg")
    assert local_file(root, "case2", 7, "front.jpg") != local_file(root, "case1", 7, "front.jpg")


@pytest.mark.parametrize("name,expect", [
    ("../../etc/passwd", "7-passwd"),
    ("/etc/shadow", "7-shadow"),
    ("..\\..\\windows\\x.jpg", "7-x.jpg"),
    ("a/b/../c.pdf", "7-c.pdf"),
    ("..", "7-file"),
    (".", "7-file"),
    ("", "7-file"),
    ("dir/", "7-file"),
    ("ok\x00name\n.jpg", "7-okname.jpg"),
    ("报告 IC 800101-14-5555.pdf", "7-报告 IC 800101-14-5555.pdf"),
])
def test_a_name_from_the_database_cannot_leave_the_case_folder(tmp_path, name, expect):
    root = str(tmp_path / "files")
    got = local_file(root, "case1", 7, name)
    assert got == os.path.join(root, "case1", expect)
    assert os.path.realpath(got).startswith(os.path.realpath(os.path.join(root, "case1")) + os.sep)


def test_a_very_long_name_is_cut_and_keeps_its_ending(tmp_path):
    got = os.path.basename(local_file(str(tmp_path), "case1", 7, "x" * 500 + ".jpeg"))
    assert got.endswith(".jpeg") and len(got.encode()) <= 200


@pytest.mark.parametrize("case_id", ["../other", "a/b", "..", ".", "", "x\x00y", "c:\\x"])
def test_a_case_id_cannot_leave_the_files_folder(tmp_path, case_id):
    root = str(tmp_path / "files")
    try:
        got = local_file(root, case_id, 7, "a.jpg")
    except ValueError:
        return
    assert os.path.dirname(os.path.dirname(got)) == root and os.path.basename(os.path.dirname(got)) not in (".", "..")


def test_files_are_private_and_the_case_folder_is_removed_with_everything_in_it(tmp_path):
    root = str(tmp_path / "files")
    a = local_file(root, "case1", 1, "a.pdf")
    b = local_file(root, "case2", 1, "a.pdf")
    write_private(a, b"one")
    write_private(b, b"two")
    assert open(a, "rb").read() == b"one"
    assert os.stat(a).st_mode & 0o077 == 0 and os.stat(os.path.dirname(a)).st_mode & 0o077 == 0
    remove_case_files(root, "case1")
    assert not os.path.exists(os.path.dirname(a)) and os.path.exists(b)
    remove_case_files(root, "case1")  # already gone: fine
    remove_case_files(root, "../case2")  # never reaches another folder
    remove_case_files(root, "..")
    assert os.path.exists(b) and os.path.isdir(root)


def test_left_over_files_are_swept_by_age(tmp_path):
    root = str(tmp_path / "files")
    old_flat = os.path.join(root, "old-flat.pdf")  # the layout before this change: <state>/files/<name>
    old_case = local_file(root, "dead", 1, "a.jpg")  # a job that was killed and never reached its clean-up
    fresh = local_file(root, "running", 1, "a.jpg")
    for p in (old_flat, old_case, fresh):
        write_private(p, b"x")
    outside = tmp_path / "keep.txt"
    outside.write_text("x")
    os.symlink(str(outside), os.path.join(root, "link"))
    now = 1_000_000.0
    for p in (old_flat, os.path.dirname(old_case), os.path.join(root, "link")):
        os.utime(p, (now - 7 * 3600, now - 7 * 3600), follow_symlinks=False)
    os.utime(os.path.dirname(fresh), (now - 60, now - 60))
    assert sweep_old_files(root, max_age=6 * 3600, now=lambda: now) == 3
    assert sorted(os.listdir(root)) == ["running"] and os.path.exists(fresh)
    assert outside.read_text() == "x"  # a link is removed, never followed
    assert sweep_old_files(str(tmp_path / "missing")) == 0


def test_predictions_are_matched_on_the_local_file_so_same_named_photos_get_their_own():
    photos = [
        {"id": 1, "src_name": "IMG.jpg", "local": "/s/files/c1/1-IMG.jpg"},
        {"id": 2, "src_name": "IMG.jpg", "local": "/s/files/c1/2-IMG.jpg"},
        {"id": 3, "src_name": "x.jpg"},  # no local file (older caller): still matched on its own name
    ]
    preds = [Prediction("/s/files/c1/2-IMG.jpg", "Rear Bumper", 0.9, ()), Prediction("/s/files/c1/1-IMG.jpg", "Bonnet", 0.8, ()), Prediction("x.jpg", "Roof", 0.7, ())]
    rows = names_for_photos(photos, preds)
    assert [(r["id"], r["model_name"]) for r in rows] == [(1, "Bonnet"), (2, "Rear Bumper"), (3, "Roof")]


# ---- the loop: the folder is removed when the job ends, whatever happened ----

class Repo:
    def __init__(self, step):
        self.step, self.applied = step, []

    def heartbeat(self, *a, **k): pass
    def reclaim_stale(self, *a): return 0
    def wanted(self): return []
    def followup_cases(self): return []
    def claim(self, **k): return {"id": 7, "case_id": "case1", "step": self.step, "attempts": 1, "org_id": "o1"}
    def gate(self, org, env_on): return "off"
    def session_status(self, org): return "idle"
    def apply(self, job, outcome): self.applied.append(outcome)

    def load(self, case_id):
        return {"id": "case1", "org_id": "o1", "status": "phase_a", "plate": "A1", "case_data": {}, "photos_done_at": None, "merimen_caseid": None,
                "car_model": "Myvi", "file_count": 1, "photo_count": 2, "created_by": "u",
                "photos": [{"id": 11, "src_name": "IMG.jpg", "blob_path": "p/11"}, {"id": 12, "src_name": "IMG.jpg", "blob_path": "p/12"}],
                "files": [{"id": 5, "kind": "doc", "url": "https://x.blob.vercel-storage.com/a", "name": "../../report.pdf"}]}


def run_tick(tmp_path, step, namer):
    loop._last_cleanup[0] = 1e12
    root = str(tmp_path / "files")
    seen = {"downloads": [], "on_disk_during_job": None, "forgot": []}

    def download(url, name, case_id, item_id):
        target = local_file(root, case_id, item_id, name)
        write_private(target, b"data")
        seen["downloads"].append(os.path.relpath(target, root))
        return target

    def forget(case_id):
        seen["forgot"].append(case_id)
        remove_case_files(root, case_id)

    def wrapped(photos, vehicle):
        seen["on_disk_during_job"] = sorted(os.listdir(os.path.join(root, "case1")))
        return namer(photos, vehicle)

    repo = Repo(step)
    cfg = Config.from_env({"PHOTO_WORKER": "on"})
    tick(cfg, repo, launch=lambda a: None, inspect=lambda p: None, namer=wrapped, driver=Driver(), download=download, forget_files=forget)
    return repo, seen, root


def test_photo_job_gets_one_file_per_photo_and_the_folder_is_gone_afterwards(tmp_path):
    def namer(photos, vehicle):
        assert [os.path.basename(p["local"]) for p in photos] == ["11-IMG.jpg", "12-IMG.jpg"]
        return [{"id": p["id"], "failed": False, "model_name": "Bonnet"} for p in photos]

    repo, seen, root = run_tick(tmp_path, "photo_model", namer)
    assert seen["downloads"] == [os.path.join("case1", "11-IMG.jpg"), os.path.join("case1", "12-IMG.jpg")]
    assert seen["on_disk_during_job"] == ["11-IMG.jpg", "12-IMG.jpg"]
    assert repo.applied[0].job_state == "done"
    assert seen["forgot"] == ["case1"] and not os.path.exists(os.path.join(root, "case1"))


def test_the_folder_is_removed_when_the_job_fails_too(tmp_path):
    def namer(photos, vehicle):
        raise RuntimeError("model crashed")

    repo, seen, root = run_tick(tmp_path, "photo_model", namer)
    assert repo.applied[0].job_state == "requeue"
    assert seen["forgot"] == ["case1"] and not os.path.exists(os.path.join(root, "case1"))


def test_intake_files_stay_inside_the_case_folder_and_are_removed(tmp_path):
    repo, seen, root = run_tick(tmp_path, "intake", lambda photos, vehicle: [])
    assert seen["downloads"] == [os.path.join("case1", "file-5-report.pdf")]
    assert seen["forgot"] == ["case1"] and os.listdir(root) == []


def test_a_clean_up_that_fails_does_not_lose_the_job_result(tmp_path):
    loop._last_cleanup[0] = 1e12
    repo = Repo("intake")

    def forget(case_id):
        raise OSError("disk")

    tick(Config.from_env({}), repo, launch=lambda a: None, inspect=lambda p: None, namer=None, driver=Driver(), download=lambda *a: None, forget_files=forget)
    assert len(repo.applied) == 1 and repo.applied[0].job_state == "done"
