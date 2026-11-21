import io, json, logging, os, sys, time
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
os.environ["PHOTO_MODEL_SECRET"] = "unit-test-secret"
os.environ["WORK_DIR"] = __import__("tempfile").mkdtemp()
os.environ["MAX_PHOTO_BYTES"] = "1000"
os.environ["MAX_TOTAL_BYTES"] = "3000"
os.environ["MAX_PHOTOS"] = "4"
import pytest
from fastapi.testclient import TestClient
import app as service
import core

OK = {"top": [["Front Bumper", 0.9]], "conf": 0.9, "sure": True, "area": None, "area_conf": None}
client = TestClient(service.app, raise_server_exceptions=False)


@pytest.fixture(autouse=True)
def fake_run(monkeypatch):
    monkeypatch.setattr(service.queue, "_run", lambda files, vehicle, limit: [OK] * len(files))
    service.queue.jobs.clear(); service.queue.order.clear()


def post(photos, vehicle="PERODUA Myvi", job_id="job-1", sig_override=None, ts=None, content_type="image/jpeg", case_id="case-1", names=None):
    ts = ts or str(int(time.time()))
    canon = core.canonical_post(ts, case_id, job_id, "oh", vehicle, [core.sha256_hex(b) for b in photos])
    sig = sig_override if sig_override is not None else core.sign("unit-test-secret", canon)
    files = [("photos", ((names or ["IMG_%d_secret_name.jpg" % i for i in range(len(photos))])[i], b, content_type)) for i, b in enumerate(photos)]
    meta = json.dumps({"case_id": case_id, "job_id": job_id, "order_hash": "oh", "vehicle": vehicle})
    return client.post("/jobs", data={"meta": meta}, files=files, headers={"X-Photo-Ts": ts, "X-Photo-Sig": sig})


def get(job_id, secret="unit-test-secret", ts=None):
    ts = ts or str(int(time.time()))
    return client.get("/jobs/" + job_id, headers={"X-Photo-Ts": ts, "X-Photo-Sig": core.sign(secret, core.canonical_get(ts, job_id))})


def wait_done(job_id):
    for _ in range(100):
        r = get(job_id)
        if r.json().get("status") in ("done", "failed"):
            return r.json()
        time.sleep(0.02)
    raise AssertionError("not finished")


def test_health_is_open_and_plain():
    r = client.get("/health")
    assert r.status_code == 200 and set(r.json()) == {"ok", "busy", "waiting"}


def test_happy_path_and_idempotent_repeat():
    r = post([b"a" * 10, b"b" * 10])
    assert r.status_code == 202 and r.json()["job_id"] == "job-1"
    body = wait_done("job-1")
    assert body["status"] == "done" and len(body["results"]) == 2
    assert post([b"a" * 10, b"b" * 10]).status_code == 202  # same job id, same payload: the existing job


def test_unauthorized_cases_never_start_work():
    assert post([b"a"], sig_override="deadbeef").status_code == 401
    assert post([b"a"], ts=str(int(time.time()) - 400)).status_code == 401  # replay outside the window
    assert service.queue.jobs == {}
    assert get("job-1", secret="wrong").status_code == 401


def test_changed_or_reordered_photo_is_401():
    ts = str(int(time.time()))
    canon = core.canonical_post(ts, "case-1", "job-1", "oh", "PERODUA Myvi", [core.sha256_hex(b"a"), core.sha256_hex(b"b")])
    sig = core.sign("unit-test-secret", canon)
    assert post([b"b", b"a"], sig_override=sig, ts=ts).status_code == 401


def test_same_job_id_other_payload_refused():
    assert post([b"a"]).status_code == 202
    assert post([b"zzz"]).status_code == 409


def test_empty_oversize_format_count():
    assert post([]).status_code in (400, 422)
    assert post([b"x" * 1001]).status_code == 413
    assert post([b"x" * 900] * 4).status_code == 413  # total > 3000
    assert post([b"a"], content_type="image/heic").status_code == 415
    assert post([b"a"] * 5).status_code == 400  # over the photo cap


def test_unknown_job_and_busy():
    assert get("nope").status_code == 404
    service.queue._run = lambda f, v, l: (time.sleep(0.3), [OK] * len(f))[1]
    codes = [post([bytes([i])], job_id="q%d" % i).status_code for i in range(5)]
    assert 429 in codes


def test_logs_never_hold_filenames_headers_or_vehicle(caplog):
    caplog.set_level(logging.DEBUG)
    post([b"x" * 1001], vehicle="SECRETVEHICLE", names=["customer_name_photo.jpg"])  # oversize
    post([b"a"], vehicle="SECRETVEHICLE", sig_override="badsig", names=["customer_name_photo.jpg"])  # auth failure
    post([b"a"], vehicle="SECRETVEHICLE", content_type="image/heic", names=["customer_name_photo.jpg"])  # bad format
    client.post("/jobs", data={"meta": "{broken"}, files=[("photos", ("customer_name_photo.jpg", b"a", "image/jpeg"))])  # bad meta
    text = "\n".join(r.getMessage() + " " + str(r.__dict__) for r in caplog.records)
    for needle in ("customer_name_photo", "SECRETVEHICLE", "badsig", "unit-test-secret"):
        assert needle not in text


def test_no_secret_configured_means_nobody(monkeypatch):
    monkeypatch.delenv("PHOTO_MODEL_SECRET")
    assert post([b"a"]).status_code == 401


def test_retry_with_new_timestamp_is_idempotent_not_409():
    now = int(time.time())
    assert post([b"a", b"b"], ts=str(now)).status_code == 202
    r = post([b"a", b"b"], ts=str(now + 5))  # response was lost, the web app retries a few seconds later
    assert r.status_code == 202
