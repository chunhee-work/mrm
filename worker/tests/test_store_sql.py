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
        return []


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
