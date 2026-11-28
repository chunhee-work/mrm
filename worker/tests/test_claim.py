"""The claim statement and the migration, run on a real Postgres engine (PGlite from web/node_modules).
Skipped when Node or web/node_modules is not there. PGlite has one connection, so true two-process races cannot be shown here;
what is shown: one statement, the claimed row comes back marked running, a second call gets a different job, nothing is taken twice."""
import json
import re
import shutil
import subprocess
from pathlib import Path

import pytest

from autopilot_worker.db import to_numbered
from autopilot_worker.jobs import CLAIM_SQL, RECLAIM_SQL, TOUCH_SQL, claim_params

HERE = Path(__file__).resolve().parent
PGLITE = HERE.parent.parent / "web" / "node_modules" / "@electric-sql" / "pglite"
needs_pg = pytest.mark.skipif(not (shutil.which("node") and PGLITE.is_dir()), reason="needs node and web/node_modules")

SEED = [
    "INSERT INTO organizations (id, name) VALUES ('o1', 'One'), ('o2', 'Two')",
    "INSERT INTO cases (id, org_id, plate, status) VALUES ('c1','o1','A1','phase_a'), ('c2','o1','A2','phase_a'), ('c3','o2','B1','phase_a')",
    "INSERT INTO jobs (case_id, step, state, created_at) VALUES ('c1','intake','queued', now() - interval '3 minutes'), ('c2','intake','queued', now() - interval '2 minutes'), ('c3','intake','queued', now() - interval '1 minute')",
]


def claim(worker: str, limit: int = 1):
    sql, args = to_numbered(CLAIM_SQL, claim_params(False, limit, worker))
    return {"sql": sql, "params": args}  # native types: PGlite does not infer from text the way the HTTP endpoint does


def run(steps, seed=SEED):
    p = subprocess.run(["node", str(HERE / "pglite_run.mjs")], input=json.dumps({"seed": seed, "steps": steps}), capture_output=True, text=True, timeout=120)
    assert p.returncode == 0, p.stderr[-500:]
    return json.loads(p.stdout)["results"]


def test_claim_is_one_statement():
    body = CLAIM_SQL.strip()
    assert body.upper().startswith("UPDATE JOBS") and "RETURNING" in body
    assert body.count("SKIP LOCKED") == 1
    assert ";" not in body


@needs_pg
def test_claims_are_exclusive_ordered_and_marked_running():
    r = run([claim("w1"), claim("w2"), claim("w1"), claim("w2"),
             {"sql": "SELECT id, state, locked_by, attempts FROM jobs ORDER BY id"}])
    first, second = r[0], r[1]
    assert len(first) == 1 and first[0][2] == "intake" and first[0][3] == 1  # oldest job, attempts 0 -> 1
    # ORG_CONCURRENCY=1: org o1 already has a running job, so the next claim skips o1's second job and takes o2's
    assert len(second) == 1 and second[0][4] == "o2"
    assert first[0][0] != second[0][0]
    assert r[2] == [] and r[3] == []  # nothing else is claimable
    states = {row[0]: row[1:] for row in r[4]}
    assert sorted(v[0] for v in states.values()) == ["queued", "running", "running"]
    assert {v[1] for v in states.values() if v[0] == "running"} == {"w1", "w2"}


@needs_pg
def test_org_limit_two_lets_the_same_org_run_two_jobs():
    r = run([claim("w1", 2), claim("w2", 2), claim("w3", 2)])
    assert [len(x) for x in r] == [1, 1, 1]
    assert len({x[0][0] for x in r}) == 3


@needs_pg
def test_not_before_is_respected():
    r = run([claim("w1")], seed=SEED[:2] + ["INSERT INTO jobs (case_id, step, state, not_before) VALUES ('c1','intake','queued', now() + interval '1 hour')"])
    assert r[0] == []


@needs_pg
def test_lease_expiry_requeues_and_gives_up_after_three_tries():
    seed = SEED[:2] + [
        "INSERT INTO jobs (id, case_id, step, state, attempts, locked_by, locked_at) VALUES "
        "(10,'c1','intake','running',1,'dead', now() - interval '30 minutes'),"
        "(11,'c1','photo_model','running',3,'dead', now() - interval '30 minutes'),"
        "(12,'c2','intake','running',1,'alive', now() - interval '1 minute')",
    ]
    reclaim, rargs = to_numbered(RECLAIM_SQL, (3, 900))
    touch, targs = to_numbered(TOUCH_SQL, (12, "alive"))
    wrong, wargs = to_numbered(TOUCH_SQL, (12, "someone-else"))
    r = run([
        {"sql": reclaim, "params": [str(a) for a in rargs]},
        {"sql": touch, "params": [str(a) for a in targs]},
        {"sql": wrong, "params": [str(a) for a in wargs]},
        {"sql": "SELECT id, state, locked_by FROM jobs ORDER BY id"},
        {"sql": "SELECT case_id, step, message FROM case_events ORDER BY id"},
    ], seed=seed)
    assert sorted(x[0] for x in r[0]) == [10, 11]
    assert r[1] == [[12]] and r[2] == []  # only the holder can renew
    assert r[3] == [[10, "queued", None], [11, "failed", None], [12, "running", "alive"]]
    # the job given up (the worker hung or died on it) gets the crash line, so its case can be deleted (plan #159); the requeued one not
    assert r[4] == [["c1", "photo_model", "Worker error"]]


def test_crash_line_is_the_one_the_web_matches():
    """loop.py writes WORKER_ERROR when it crashes; the web delete rule (case-delete.ts FAULT_LINE) matches the same text."""
    from autopilot_worker.jobs import WORKER_ERROR
    assert WORKER_ERROR == "Worker error"
    loop = (HERE.parent / "autopilot_worker" / "loop.py").read_text()
    assert 'event=WORKER_ERROR' in loop and '"Worker error"' not in loop
    web = (HERE.parent.parent / "web" / "src" / "lib" / "case-delete.ts").read_text()
    assert 'FAULT_LINE = "Worker error"' in web


@needs_pg
def test_migration_0008_applies_twice_and_has_no_delete_grant():
    mig = (HERE.parent.parent / "web" / "drizzle" / "0008_case_screenshots.sql").read_text()
    again = [s for s in mig.split("--> statement-breakpoint") if s.strip()]
    r = run([{"sql": "SELECT count(*) FROM case_screenshots"}], seed=again)  # second run of the same file after the harness's first
    assert r[0] == [[0]]
    assert not re.search(r"GRANT[^;]*DELETE", mig, re.I)
    assert re.search(r"GRANT SELECT, INSERT, UPDATE ON \"case_screenshots\" TO autopilot_worker", mig)


@needs_pg
def test_a_deleted_case_is_never_claimed():
    seed = SEED[:2] + ["INSERT INTO jobs (case_id, step, state) VALUES ('c1','intake','queued')", "UPDATE cases SET deleted_at = now() WHERE id = 'c1'"]
    r = run([claim("w1")], seed=seed)
    assert r[0] == []


@needs_pg
def test_migration_0017_gives_the_worker_select_on_case_extras_only():
    mig = (HERE.parent.parent / "web" / "drizzle" / "0017_worker_case_extras_grant.sql").read_text()
    assert not re.search(r"GRANT[^;]*(DELETE|INSERT|UPDATE|TRUNCATE|ALL)", mig, re.I)
    assert "rolname = 'autopilot_worker'" in mig
    seed = ["CREATE ROLE autopilot_worker", mig, mig]  # runs twice with the role present
    r = run([
        {"sql": "SELECT has_table_privilege('autopilot_worker', 'case_extras', 'SELECT'), has_table_privilege('autopilot_worker', 'case_extras', 'INSERT'), has_table_privilege('autopilot_worker', 'case_extras', 'DELETE')"},
    ], seed=seed)
    assert r[0] == [[True, False, False]]
