"""PgRepo with a recording database: writes go out as ONE batch, and every statement it builds runs on a real engine."""
import json
import shutil

import pytest

from autopilot_worker.db import to_numbered
from autopilot_worker.pipeline import Outcome
from autopilot_worker.store import PgRepo
from test_claim import SEED, needs_pg, run


class Rec:
    def __init__(self, rows=None):
        self.calls, self.batches, self.rows = [], [], rows or {}

    def execute(self, sql, params=()):
        self.calls.append((sql, params))
        return self.rows.get("execute", [])

    def batch(self, statements):
        self.batches.append(list(statements))
        return self.rows.get("batch", [])


JOB = {"id": 1, "case_id": "c1", "step": "phase_a", "org_id": "o1"}


def test_apply_is_one_batch():
    rec = Rec()
    repo = PgRepo("", db=rec)
    repo.apply(JOB, Outcome("done", case_status="waiting_user", event="x", enqueue=["phase_b"], merimen_caseid="M1",
                            photo_rows=[{"id": 1, "model_name": "Bonnet", "confidence": 0.9, "alts": ["a"]}, {"id": 2, "failed": True}],
                            browser_minutes="2"))
    assert len(rec.batches) == 1 and rec.calls == []
    assert len(rec.batches[0]) == 7


def test_claim_returns_the_job_or_none():
    rec = Rec({"execute": [(5, "c1", "intake", 1, "o1")]})
    assert PgRepo("", db=rec).claim(ext_connect=False, worker_id="w1") == {"id": 5, "case_id": "c1", "step": "intake", "attempts": 1, "org_id": "o1"}
    assert len(rec.calls) == 1
    assert PgRepo("", db=Rec()).claim(ext_connect=False, worker_id="w1") is None


@needs_pg
def test_every_statement_apply_and_finish_verify_build_runs_on_postgres():
    rec = Rec()
    repo = PgRepo("", db=rec)
    repo.apply({**JOB, "id": 100, "step": "photo_model"}, Outcome("paused", case_status="waiting_user", event="e", invalidate=True, verify_state="locked",
                                                      enqueue=["phase_b"], photo_fail="worker: x",
                                                      photo_rows=[{"id": 1, "model_name": "Bonnet", "confidence": 0.9, "alts": ["a"]}], browser_minutes="3"))
    repo.finish_verify("o1", {"verify_state": "bad_credentials", "blocked": True, "pause": True, "resume": False, "event": "bad", "email": None})
    repo.finish_verify("o1", {"verify_state": "ok", "blocked": False, "pause": False, "resume": True, "event": "ok", "email": None})
    steps = []
    for st in [s for b in rec.batches for s in b]:
        text, args = to_numbered(*st)
        steps.append({"sql": text, "params": args})
    seed = SEED[:2] + [
        "INSERT INTO merimen_credentials (org_id, username_hint, wrapped_dek, dek_nonce, username_ct, username_nonce, password_ct, password_nonce, verify_state) "
        "VALUES ('o1','u','a','b','c','d','e','f','checking')",
        "INSERT INTO jobs (id, case_id, step, state) VALUES (100,'c1','photo_model','running'), (101,'c2','phase_a','queued')",
        "INSERT INTO case_photos (id, case_id, position, orig_n, src_name, blob_path, thumb_path) VALUES (1,'c1',0,1,'a.jpg','p','t')",
    ]
    steps.append({"sql": "SELECT count(*) FROM case_events"})
    steps.append({"sql": "SELECT state FROM jobs WHERE id = 101"})
    r = run(steps, seed=seed)
    assert r[-2][0][0] >= 3
    assert r[-1] == [["queued"]]  # paused by the first failure, put back by the later success


def test_step2_log_and_learning_rows_go_out_in_the_same_batch():
    rec = Rec()
    PgRepo("", db=rec).apply(
        {**JOB, "step": "phase_b"},
        Outcome("done", step2_log={"mode": "dry", "action": "plan", "plan": {"parts": 3}, "check": {"ok": True}, "ai": {}, "playbook": "v@local", "note": "n"},
                learning=[{"photo_id": 1, "content_hash": "h", "blob_path": "p", "model_name": "A", "label": "B", "changed": True}]),
    )
    assert len(rec.batches) == 1 and rec.calls == []
    sqls = [s[0] for s in rec.batches[0]]
    assert any("INSERT INTO step2_log" in s for s in sqls) and any("INSERT INTO photo_learning" in s for s in sqls)


@needs_pg
def test_step2_log_learning_upsert_and_export_run_on_postgres():
    rec = Rec()
    repo = PgRepo("", db=rec)
    job = {**JOB, "id": 100, "step": "phase_b"}
    one = lambda label, changed: Outcome("done", step2_log={"mode": "dry", "action": "plan", "plan": {"parts": 1}, "check": {}, "ai": {}, "playbook": "v@x", "note": "n"},
                                         learning=[{"photo_id": 1, "content_hash": "h", "blob_path": "p", "model_name": "Bonnet", "label": label, "changed": changed}])
    repo.apply(job, one("Door Mirror RH", True))
    repo.apply(job, one("Door Mirror RH", True))  # Done again with the same name: still one row
    steps = []
    for st in [s for b in rec.batches for s in b]:
        text, args = to_numbered(*st)
        steps.append({"sql": text, "params": args})
    take, targs = to_numbered("UPDATE photo_learning SET exported_at = now() WHERE exported_at IS NULL RETURNING label, changed", ())
    steps += [
        {"sql": "SELECT count(*), max(label) FROM photo_learning"},
        {"sql": "SELECT count(*) FROM step2_log"},
        {"sql": take},
    ]
    seed = SEED[:2] + ["INSERT INTO jobs (id, case_id, step, state) VALUES (100,'c1','phase_b','running')",
                       "INSERT INTO case_photos (id, case_id, position, orig_n, src_name, blob_path, thumb_path) VALUES (1,'c1',0,1,'a.jpg','p','t')"]
    r = run(steps, seed=seed)
    assert r[-3] == [[1, "Door Mirror RH"]] and r[-2] == [[2]] and r[-1] == [["Door Mirror RH", True]]


@needs_pg
def test_end_of_phase_b_goes_on_to_checks_only_if_done_is_still_pressed_with_the_same_names():
    def outcome():
        return Outcome("done", case_status="checking", event="Checking", enqueue=["checks"], total_rm="10.00", require_snapshot="s1", stale_event="Names changed")
    for done_sql, want_status, want_jobs, want_event in [
        ("UPDATE cases SET status = 'phase_b', photos_done_at = now(), photos_snapshot = 's1' WHERE id = 'c1'", "checking", 1, "Checking"),
        # the adjuster renamed a photo after the worker's last check: the web app cleared 完成 and set waiting_user
        ("UPDATE cases SET status = 'waiting_user', photos_done_at = NULL, photos_snapshot = NULL WHERE id = 'c1'", "waiting_user", 0, "Names changed"),
        # 完成 pressed again on other names: a new Phase B is due, not checks
        ("UPDATE cases SET status = 'phase_b', photos_done_at = now(), photos_snapshot = 's2' WHERE id = 'c1'", "phase_b", 0, "Names changed"),
    ]:
        rec = Rec()
        PgRepo("", db=rec).apply({**JOB, "id": 100, "step": "phase_b"}, outcome())
        steps = [dict(zip(("sql", "params"), to_numbered(*st))) for b in rec.batches for st in b]
        steps += [{"sql": "SELECT status FROM cases WHERE id = 'c1'"}, {"sql": "SELECT count(*) FROM jobs WHERE case_id = 'c1' AND step = 'checks'"},
                  {"sql": "SELECT string_agg(message, ',') FROM case_events WHERE case_id = 'c1'"}]
        r = run(steps, seed=SEED[:2] + [done_sql, "INSERT INTO jobs (id, case_id, step, state) VALUES (100,'c1','phase_b','running')"])
        assert r[-3] == [[want_status]] and r[-2] == [[want_jobs]] and r[-1] == [[want_event]], done_sql


@needs_pg
def test_a_phase_b_run_again_compares_merimen_with_what_the_last_phase_b_left_there():
    from autopilot_worker.store import LAST_PHOTO_LIST_SQL
    def log(phase, action, snap, name, mins):
        photos = json.dumps([{"id": 1, "src": "a.jpg", "name": name, "fileType": "jpg", "position": 0}])
        return (f"INSERT INTO photo_upload_log (case_id, phase, mode, action, photos, snapshot, created_at) VALUES "
                f"('c1', '{phase}', 'live', '{action}', '{photos}'::jsonb, {snap}, now() - interval '{mins} minutes')")
    q = [dict(zip(("sql", "params"), to_numbered(LAST_PHOTO_LIST_SQL, ("c1",))))]
    a = [log("A", "upload", "NULL", "Bonnet", 30)]
    assert run(q, seed=SEED[:2] + a)[-1][0][0][0]["name"] == "Bonnet"
    b_done = a + [log("B", "relabel_reorder", "'s1'", "Bonnet LH", 20)]
    assert run(q, seed=SEED[:2] + b_done)[-1][0][0][0]["name"] == "Bonnet LH"
    # a later Phase B that was refused or stopped (no snapshot), or a Phase A that found photos there already, changed nothing in Merimen
    later = b_done + [log("B", "refused", "NULL", "Hood", 10), log("B", "none", "'s2'", "Hood", 5), log("A", "none", "NULL", "Hood", 3)]
    assert run(q, seed=SEED[:2] + later)[-1][0][0][0]["name"] == "Bonnet LH"


def test_profile_for_reads_the_front_page_details():
    rec = Rec({"execute": [("Bengkel Ali", "Ali", "Siti", 3)]})
    assert PgRepo("", db=rec).profile_for("o1") == {"workshop": "Bengkel Ali", "manager": "Ali", "adjuster": "Siti", "version": 3}
    assert PgRepo("", db=Rec()).profile_for("o1") is None


def test_profile_for_is_none_before_migration_0013():
    class Boom:
        def execute(self, sql, params=()):
            raise RuntimeError('column "workshop_name" does not exist')
    assert PgRepo("", db=Boom()).profile_for("o1") is None


def test_workshops_for_lists_the_slots():
    rec = Rec({"execute": [(1, "Bengkel Ali"), (3, "Bengkel Cheras")]})
    assert PgRepo("", db=rec).workshops_for("o1") == [{"slot": 1, "name": "Bengkel Ali"}, {"slot": 3, "name": "Bengkel Cheras"}]
    assert PgRepo("", db=Rec()).workshops_for("o1") == []


def test_claim_workshop_locks_in_one_statement_and_reads_slot_and_name():
    rec = Rec({"execute": [(2, "Bengkel Cheras")]})
    assert PgRepo("", db=rec).claim_workshop_for_case("c1") == {"slot": 2, "name": "Bengkel Cheras"}
    sql, params = rec.calls[0]
    assert len(rec.calls) == 1 and "locked_at" in sql and "ON CONFLICT (case_id)" in sql and params == ("c1",) and "locked_name" in sql
    assert PgRepo("", db=Rec()).claim_workshop_for_case("nope") is None  # unknown case: nothing to use
    assert PgRepo("", db=Rec({"execute": [(2, None)]})).claim_workshop_for_case("c1") is None  # removed workshop: the caller must stop


def test_a_permission_error_is_never_taken_for_a_missing_table():
    class Denied:
        def execute(self, sql, params=()):
            raise RuntimeError("permission denied for table merimen_workshops (42501)")
    for call in (lambda r: r.claim_workshop_for_case("c1"), lambda r: r.workshops_for("o1")):
        try:
            call(PgRepo("", db=Denied()))
            assert False, "must raise, not fall back to workshop 1"
        except RuntimeError:
            pass


def test_workshop_before_migration_0014_is_the_one_workshop():
    class Old:
        def __init__(self):
            self.n = 0

        def execute(self, sql, params=()):
            self.n += 1
            if "merimen_case_workshop" in sql:
                raise RuntimeError('relation "merimen_case_workshop" does not exist (42P01)')
            return [(1, "Bengkel Ali")]
    assert PgRepo("", db=Old()).claim_workshop_for_case("c1") == {"slot": 1, "name": "Bengkel Ali"}

    class NoTable:
        def execute(self, sql, params=()):
            raise RuntimeError('relation "merimen_workshops" does not exist')
    assert PgRepo("", db=NoTable()).workshops_for("o1") == []


def test_peek_workshop_reads_the_same_answer_but_writes_and_locks_nothing():
    rec = Rec({"execute": [(2, "Bengkel Cheras")]})
    assert PgRepo("", db=rec).peek_workshop_for_case("c1") == {"slot": 2, "name": "Bengkel Cheras"}
    sql, params = rec.calls[0]
    assert params == ("c1",) and "INSERT" not in sql.upper() and "UPDATE" not in sql.upper() and "locked_name" in sql
    assert PgRepo("", db=Rec()).peek_workshop_for_case("nope") is None
    assert PgRepo("", db=Rec({"execute": [(1, None)]})).peek_workshop_for_case("c1") is None  # no name: the caller stops, never workshop 1


def test_record_merimen_id_never_overwrites_a_number():
    rec = Rec()
    PgRepo("", db=rec).record_merimen_id("c1", "123", "456")
    sql, params = rec.calls[0]
    assert "merimen_caseid IS NULL" in sql and params == ("123", "456", "c1")


def test_create_marks_use_only_case_events_and_press_is_one_conditional_insert():
    rec = Rec({"execute": [(7,)], "batch": [[], [(7,)]]})
    m = PgRepo("", db=rec).create_marks("c1")
    assert m.pressed() is True and m.press() is True
    pressed_sql = rec.calls[0][0]
    assert "create_submitted" in pressed_sql and "create_cleared" in pressed_sql and "INSERT" not in pressed_sql.upper()
    lock_sql, press_sql = rec.batches[0][0][0], rec.batches[0][1][0]  # one transaction: advisory lock first, then the conditional insert
    assert "pg_advisory_xact_lock" in lock_sql
    assert press_sql.lstrip().upper().startswith("INSERT INTO CASE_EVENTS") and "WHERE NOT EXISTS" in press_sql.upper() and "RETURNING id" in press_sql
    m.clear()
    assert "create_cleared" in rec.calls[1][0]
    none = PgRepo("", db=Rec()).create_marks("c1")
    assert none.pressed() is False and none.press() is False  # an empty answer from the insert means a mark already stands


# Item 7: the worker asks for a Chrome session itself once an org's login checked ok and its consent is complete.
from autopilot_worker.store import ENSURE_SESSIONS_SQL  # noqa: E402

_ORGS = "INSERT INTO organizations (id, name) VALUES ('o1','One'),('o2','Two'),('o3','Three'),('o4','Four'),('o5','Five')"
_CRED = ("INSERT INTO merimen_credentials (org_id, username_hint, wrapped_dek, dek_nonce, username_ct, username_nonce, password_ct, password_nonce, verify_state, blocked) VALUES "
         "('o1','u','w','n','c','n','p','n','ok',false),"          # ready
         "('o2','u','w','n','c','n','p','n','ok',false),"          # no consent row
         "('o3','u','w','n','c','n','p','n','bad_credentials',true),"  # login rejected
         "('o4','u','w','n','c','n','p','n','ok',false),"          # ready, but someone stopped its session
         "('o5','u','w','n','c','n','p','n','ok',false)")          # ready, already connected
_GATE = ("INSERT INTO ext_org_settings (org_id, enabled, consent_reference) VALUES "
         "('o1',true,'details-card:1'),('o2',true,'details-card:1'),('o3',true,'details-card:1'),('o4',true,'details-card:1'),('o5',true,'details-card:1')")
_CONSENT = "INSERT INTO ext_consents (org_id, user_id, wording_version) VALUES ('o1','u1','v'),('o3','u1','v'),('o4','u1','v'),('o5','u1','v')"
_ROWS = "INSERT INTO worker_sessions (org_id, status, wanted) VALUES ('o4','stopped','none'),('o5','connected','start')"


@needs_pg
def test_ensure_sessions_asks_only_for_ready_orgs():
    seed = [_ORGS, "INSERT INTO \"user\" (id, name, email) VALUES ('u1','U','u1@x.invalid')", _CRED, _GATE, _CONSENT, _ROWS]
    q = "SELECT org_id, account_key, status, wanted FROM worker_sessions ORDER BY org_id"
    r = run([{"sql": to_numbered(ENSURE_SESSIONS_SQL, ())[0], "params": []}, {"sql": q},
             {"sql": to_numbered(ENSURE_SESSIONS_SQL, ())[0], "params": []}], seed=seed)
    assert [row[0] for row in r[0]] == ["o1"]  # o2 no consent, o3 bad login, o4 stopped by a person, o5 already asking
    rows = {row[0]: row[1:] for row in r[1]}
    assert rows["o1"] == ["default", "idle", "start"]
    assert rows["o4"][1:] == ["stopped", "none"]
    assert rows["o5"][1:] == ["connected", "start"]
    assert "o2" not in rows and "o3" not in rows
    assert r[2] == []  # running it again changes nothing


def test_sync_sessions_creates_rows_only_with_ext_connect_on():
    from autopilot_worker.config import Config
    from autopilot_worker.loop import sync_sessions

    class R:
        def __init__(self): self.asked = 0
        def ensure_sessions(self): self.asked += 1; return []
        def wanted(self): return []

    for on, want in ((True, 1), (False, 0)):
        cfg = Config.from_env({"EXT_CONNECT": "on" if on else "off"})
        r = R()
        sync_sessions(cfg, r, launch=lambda *_: None, inspect=lambda *_: None)
        assert r.asked == want


def test_no_worker_accounts_env_means_one_default_profile():
    from autopilot_worker.config import account_for, parse_accounts
    assert account_for("any-org", parse_accounts(""), {}) == "default"


@needs_pg
def test_the_jev_ledger_row_goes_in_with_insert_only_rights():
    # 2026-11-28 "jev ledger skipped: DbError": ON CONFLICT (request_id) needs SELECT on llm_calls, the worker role has INSERT only (0016)
    rec = Rec()
    PgRepo("", db=rec).record_llm_call({"request_id": "r1", "case_id": "c1", "purpose": "jev_insurer", "model": "jev-latest",
                                        "input_tokens": 10, "output_tokens": 2, "latency_ms": 900, "ok": True, "error_class": None})
    text, args = to_numbered(*rec.calls[0])
    seed = SEED[:2] + [
        "CREATE ROLE autopilot_worker",
        'GRANT INSERT ON "llm_calls" TO autopilot_worker',
        'GRANT USAGE, SELECT ON SEQUENCE "llm_calls_id_seq" TO autopilot_worker',
        'GRANT SELECT ON "cases" TO autopilot_worker',
    ]
    r = run([{"sql": "SET ROLE autopilot_worker"}, {"sql": text, "params": args}, {"sql": text, "params": args},
             {"sql": "RESET ROLE"}, {"sql": "SELECT count(*), max(org_id) FROM llm_calls"}], seed=seed)
    assert r[-1] == [[1, "o1"]]
