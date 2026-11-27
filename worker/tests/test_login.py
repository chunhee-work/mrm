import json
import os
import subprocess

from autopilot_worker.crypto import master_key, open_secret, seal
from autopilot_worker.jobs import CLAIM_SQL
from autopilot_worker.login_flow import run_verify
from autopilot_worker.login_page import (
    EVENT_BAD, backoff_seconds, can_claim_verify, classify_login, finish_verify,
    login_email, pause_ids, resume_ids, should_login,
)
from autopilot_worker.pipeline import Driver, handle_job

KEY = base64_key = "A" * 32  # replaced below

import base64
KEY = base64.b64encode(b"k" * 32).decode()


def test_lock_beats_password_word():
    text = "Invalid password. Your account has been locked. locktime=15"
    assert classify_login(text=text, has_password=True) == "locked"


def test_wrong_password_page():
    assert classify_login(text="Invalid User ID or password", has_password=True) == "bad_credentials"
    assert classify_login(text="用户名或密码错误", has_password=True) == "bad_credentials"


def test_otp_page_and_not_a_word_inside_contact():
    assert classify_login(text="Enter the verification code", has_password=False) == "otp"
    assert classify_login(text="Please contact support", has_password=True) == "unknown"
    assert classify_login(text="", has_otp=True, has_password=True) == "otp"


def test_success_is_a_claims_address_without_a_password_box():
    url = "https://www.merimen.com.my/claims/index.cfm?fuseaction=home&CFID=1&RID=2"
    assert classify_login(url=url, text="Welcome", has_password=False) == "success"
    assert classify_login(url=url, text="Welcome", has_password=True) == "unknown"


def test_one_failure_stops_further_logins():
    bad = finish_verify("bad_credentials")
    assert bad["blocked"] is True and bad["pause"] is True and bad["resume"] is False
    assert should_login(verify_state=bad["verify_state"], blocked=True, session="expired") is False
    locked = finish_verify("locked")
    assert locked["verify_state"] == "locked" and "lock" in locked["event"].lower() or "锁定" in locked["event"]
    ok = finish_verify("success")
    assert ok["resume"] is True and ok["blocked"] is False
    assert should_login(verify_state="ok", blocked=False, session="expired") is True
    assert should_login(verify_state="ok", blocked=False, session="connected") is False
    assert can_claim_verify("queued", 0) is True
    assert can_claim_verify("queued", 1) is False
    assert can_claim_verify("checking", 0) is False


def test_pause_and_resume_only_merimen_steps():
    jobs = [
        {"id": 1, "step": "phase_a", "state": "queued"},
        {"id": 2, "step": "photo_model", "state": "queued"},
        {"id": 3, "step": "phase_b", "state": "running"},
        {"id": 4, "step": "phase_a", "state": "paused"},
    ]
    assert pause_ids(jobs) == [1, 3]
    assert resume_ids(jobs) == [4]


def test_verify_calls_the_page_once_and_does_not_keep_the_password():
    sealed = seal(master_key(KEY), "org-1", "abuser", "s3cret-pass")
    row = {"org_id": "org-1", **sealed}
    seen = []

    def fetch(user, password):
        seen.append((user, password))
        return {"text": "Invalid User ID or password", "has_password": True, "url": "https://www.merimen.com.my/login"}

    decision = run_verify(row, master_key(KEY), fetch)
    assert seen == [("abuser", "s3cret-pass")]
    assert decision["verify_state"] == "bad_credentials"
    blob = json.dumps(sealed)
    assert "s3cret-pass" not in blob and "abuser" not in blob


def test_offline_does_not_count_as_a_wrong_password():
    sealed = seal(master_key(KEY), "org-1", "ab", "pw")
    decision = run_verify({"org_id": "org-1", **sealed}, master_key(KEY), lambda u, p: {"offline": True})
    assert decision["release"] is True
    assert decision["blocked"] is False


def test_email_has_both_languages_and_no_secret():
    subject, html = login_email("bad_credentials")
    assert "登录" in subject and "密码" in html and "password" in html.lower()
    assert "s3cret" not in html
    assert "锁定" in login_email("locked")[1] or "locked" in login_email("locked")[1]


def test_job_failure_pauses_without_another_try():
    out = handle_job(
        {"step": "phase_a"}, {"status": "phase_a", "file_count": 1, "photo_count": 0}, [],
        gate="ready", session="connected", photo_worker=False, writes=False, namer=None, driver=Driver(),
        login_result="bad_credentials",
    )
    assert out.job_state == "paused" and out.invalidate and out.case_status == "waiting_user"
    assert EVENT_BAD[:20] in out.event


def test_claim_sql_skips_locked_rows_and_bad_logins():
    assert "FOR NO KEY UPDATE OF j, c SKIP LOCKED" in CLAIM_SQL
    assert "not_before" in CLAIM_SQL
    assert "merimen_credentials" in CLAIM_SQL
    assert "org_limit" in CLAIM_SQL
    assert backoff_seconds(1) == 2
    assert backoff_seconds(10) == 300


def test_python_ciphertext_opens_in_node():
    sealed = seal(master_key(KEY), "org-9", "zzname", "zz-secret")
    script = os.path.join(os.path.dirname(__file__), "..", "crypto.mjs")
    proc = subprocess.run(
        ["node", script],
        input=json.dumps({"master": KEY, "org": "org-9", "row": sealed, "field": "pass"}),
        text=True, capture_output=True,
    )
    assert proc.returncode == 0, proc.stderr
    assert proc.stdout == "zz-secret"
    assert open_secret(master_key(KEY), "org-9", sealed, "user") == "zzname"
