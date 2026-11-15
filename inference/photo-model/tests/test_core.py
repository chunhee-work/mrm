import os, sys, json, time, threading
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import pytest
import core

FAKE = os.path.join(os.path.dirname(__file__), "fake_predict.py")


def line(f, name="Front Bumper", jev=False, **kw):
    d = {"file": f, "top": [[name, 0.9], ["Bonnet", 0.05]], "conf": 0.9, "sure": True, "area": "FRONT", "area_conf": 0.8, "jev": jev}
    d.update(kw)
    return json.dumps(d)


# ───── signing ─────
def test_sign_roundtrip_and_tamper():
    ts = str(int(time.time()))
    c = core.canonical_post(ts, "case", "job", "oh", "PERODUA Myvi", ["a" * 64, "b" * 64])
    sig = core.sign("s3cret", c)
    assert core.check_signature(["s3cret"], c, sig, ts)
    assert not core.check_signature(["other"], c, sig, ts)
    c2 = core.canonical_post(ts, "case", "job", "oh", "PERODUA Myvi", ["b" * 64, "a" * 64])  # reordered photos
    assert not core.check_signature(["s3cret"], c2, sig, ts)
    assert not core.check_signature(["s3cret"], c, sig, str(int(ts) - 301))  # outside the window
    assert not core.check_signature([], c, sig, ts)  # no secret configured = nobody gets in
    assert not core.check_signature(["s3cret"], c, "", ts)


def test_rotation_accepts_next_secret():
    ts = str(int(time.time()))
    c = core.canonical_get(ts, "j")
    assert core.check_signature(["old", "new"], c, core.sign("new", c), ts)


def test_vehicle_with_newline_cannot_shift_fields():
    ts = "1"
    a = core.canonical_post(ts, "c", "j", "h", "X\nY", ["p"])
    b = core.canonical_post(ts, "c", "j", "h", "X", ["Y\np"])
    assert a != b


@pytest.mark.parametrize("v", ["", "Perodua \"Myvi\"", "$(touch /tmp/x)", "line\nbreak", "車 ñ 🚗", "x" * 5000])
def test_odd_vehicle_strings_sign_fine(v):
    c = core.canonical_post("1", "c", "j", "h", v, ["p"])
    assert core.check_signature(["k"], c, core.sign("k", c), "1", now=1)


# ───── output check ─────
def test_parse_output_ok_drops_file_and_extras():
    files = ["/t/000.jpg", "/t/001.jpg"]
    out = core.parse_output("warn\n" + line(files[0], extra="x") + "\n" + line(files[1]) + "\n", files)
    assert [o["top"][0][0] for o in out] == ["Front Bumper", "Front Bumper"]
    assert all("file" not in o and "extra" not in o and "jev" not in o for o in out)


@pytest.mark.parametrize("bad", ["count", "json", "other_file", "jev", "no_top", "bad_top", "no_conf"])
def test_any_bad_line_fails_the_whole_job(bad):
    files = ["/t/000.jpg", "/t/001.jpg"]
    ok0 = line(files[0])
    second = {
        "count": None,
        "json": "{not json",
        "other_file": line("/t/999.jpg"),
        "jev": line(files[1], jev=True),
        "no_top": json.dumps({"file": files[1], "conf": 0.5, "sure": False}),
        "bad_top": line(files[1], top=[["x"]]),
        "no_conf": json.dumps({"file": files[1], "top": [["a", 0.5]]}),
    }[bad]
    text = ok0 if second is None else ok0 + "\n" + second
    with pytest.raises(core.ResultError):
        core.parse_output(text, files)


def test_formats():
    assert core.photo_ext("image/jpeg", "a") == "jpg"
    assert core.photo_ext("image/heic", "a") is None
    assert core.photo_ext("", "a") is None


# ───── runner: argv list, env dict, jev off ─────
def test_run_predict_uses_env_not_shell(tmp_path, monkeypatch):
    marker = tmp_path / "pwned"
    monkeypatch.setenv("PREDICT_SCRIPT", FAKE)
    f = tmp_path / "000.jpg"
    f.write_bytes(b"x")
    vehicle = "$(touch %s) \"quoted\" 'q' \nline2 車" % marker
    out = core.run_predict([str(f)], vehicle, 30)
    assert not marker.exists()
    assert out[0]["top"][0][0] == "Front Bumper"
    seen = json.load(open(str(f) + ".env"))
    assert seen["JEV"] == "0" and seen["PROD"] == "1" and seen["VEHICLE"] == vehicle
    assert seen["HF_TOKEN"] is None and seen["PHOTO_MODEL_SECRET"] is None


def test_run_predict_failure_is_short(tmp_path, monkeypatch):
    crash = tmp_path / "crash.py"
    crash.write_text("import sys\nsys.stderr.write('secret file name ' + sys.argv[2])\nsys.exit(3)\n")
    monkeypatch.setenv("PREDICT_SCRIPT", str(crash))
    f = tmp_path / "000.jpg"
    f.write_bytes(b"x")
    with pytest.raises(core.ResultError) as e:
        core.run_predict([str(f)], "", 30)
    assert str(tmp_path) not in str(e.value)


# ───── queue ─────
def make_queue(tmp_path, run, waiting=3):
    q = core.Queue(waiting, 30, str(tmp_path), run=run)
    q.start()
    return q


def wait_for(q, jid, status, t=5):
    end = time.time() + t
    while time.time() < end:
        if q.jobs[jid].status == status:
            return
        time.sleep(0.02)
    raise AssertionError(jid + " is " + q.jobs[jid].status)


def test_queue_runs_one_at_a_time_and_deletes_temp_photos(tmp_path):
    active, peak = [0], [0]
    def run(files, vehicle, limit):
        active[0] += 1; peak[0] = max(peak[0], active[0]); time.sleep(0.05); active[0] -= 1
        return [{"top": [["a", 1.0]], "conf": 1.0, "sure": True, "area": None, "area_conf": None}] * len(files)
    q = make_queue(tmp_path, run)
    for i in range(3):
        q.submit("j%d" % i, "c%d" % i, "v", [("jpg", b"1")])
    for i in range(3):
        wait_for(q, "j%d" % i, "done")
    assert peak[0] == 1
    assert not any(tmp_path.iterdir())  # temp folders are gone


def test_queue_full_gives_busy(tmp_path):
    gate = threading.Event()
    def run(files, vehicle, limit):
        gate.wait(5)
        return []
    q = make_queue(tmp_path, run, waiting=3)
    for i in range(3):
        q.submit("j%d" % i, "c", "v", [("jpg", b"1")])
    with pytest.raises(core.Full):
        q.submit("j9", "c", "v", [("jpg", b"1")])
    gate.set()


def test_same_job_id_same_payload_is_idempotent_other_payload_refused(tmp_path):
    gate = threading.Event()
    q = make_queue(tmp_path, lambda f, v, l: (gate.wait(5), [])[1])
    a = q.submit("j", "canon1", "v", [("jpg", b"1")])
    assert q.submit("j", "canon1", "v", [("jpg", b"1")]) is a
    with pytest.raises(core.Mismatch):
        q.submit("j", "canon2", "v", [("jpg", b"1")])
    gate.set()


def test_failed_job_has_short_error(tmp_path):
    def run(files, vehicle, limit):
        raise core.ResultError("line count 1 != photo count 2")
    q = make_queue(tmp_path, run)
    q.submit("j", "c", "v", [("jpg", b"1")])
    wait_for(q, "j", "failed")
    assert q.jobs["j"].error == "line count 1 != photo count 2" and q.jobs["j"].results is None
