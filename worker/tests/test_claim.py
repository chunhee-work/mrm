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
    reclaim, rargs = to_numbered(RECLAIM_SQL, (3, 900, ""))
    touch, targs = to_numbered(TOUCH_SQL, (12, "alive"))
    wrong, wargs = to_numbered(TOUCH_SQL, (12, "someone-else"))
    r = run([
        {"sql": reclaim, "params": [str(a) for a in rargs]},
        {"sql": touch, "params": [str(a) for a in targs]},
        {"sql": wrong, "params": [str(a) for a in wargs]},
        {"sql": "SELECT id, state, locked_by FROM jobs ORDER BY id"},
    ], seed=seed)
    assert sorted(x[0] for x in r[0]) == [10, 11]
    assert r[1] == [[12]] and r[2] == []  # only the holder can renew
    assert r[3] == [[10, "queued", None], [11, "failed", None], [12, "running", "alive"]]


@needs_pg
def test_a_job_this_worker_still_runs_keeps_its_row_after_a_long_db_outage():
    """WORKER_SLOTS > 1 (plan #150 I2): the lease ran out only because the DB was away; the slot still runs the job."""
    seed = SEED[:2] + [
        "INSERT INTO jobs (id, case_id, step, state, attempts, locked_by, locked_at) VALUES "
        "(10,'c1','intake','running',1,'w', now() - interval '30 minutes'),"
        "(11,'c2','intake','running',3,'w', now() - interval '30 minutes')",
    ]
    reclaim, rargs = to_numbered(RECLAIM_SQL, (3, 900, "10,11"))
    r = run([{"sql": reclaim, "params": [str(a) for a in rargs]}, {"sql": "SELECT id, state FROM jobs ORDER BY id"}], seed=seed)
    assert r[0] == [] and r[1] == [[10, "running"], [11, "running"]]


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


def _merimen_seed(workshops: int, extra=()):
    """One org ready for Merimen work (login ok, worker connected, consent) with a queued Phase A job for case c1."""
    ws = ", ".join("('o1', %d, 'W%d')" % (n, n) for n in range(1, workshops + 1))
    return [
        "INSERT INTO organizations (id, name) VALUES ('o1', 'One')",
        "INSERT INTO \"user\" (id, name, email) VALUES ('u1', 'U', 'u@x.invalid')",
        "INSERT INTO cases (id, org_id, plate, status) VALUES ('c1','o1','A1','phase_a')",
        "INSERT INTO merimen_credentials (org_id, username_hint, wrapped_dek, dek_nonce, username_ct, username_nonce, password_ct, password_nonce, verify_state) VALUES ('o1','h','x','x','x','x','x','x','ok')",
        "INSERT INTO worker_sessions (org_id, status) VALUES ('o1', 'connected')",
        "INSERT INTO ext_org_settings (org_id, enabled, consent_reference) VALUES ('o1', true, 'ref')",
        "INSERT INTO ext_consents (org_id, user_id, wording_version) VALUES ('o1', 'u1', 'v1')",
        "INSERT INTO jobs (case_id, step, state) VALUES ('c1','phase_a','queued')",
    ] + (["INSERT INTO merimen_workshops (org_id, slot, name) VALUES " + ws] if workshops else []) + list(extra)


def mclaim(worker: str = "w1"):
    sql, args = to_numbered(CLAIM_SQL, claim_params(True, 1, worker))
    return {"sql": sql, "params": args}


@needs_pg
def test_phase_a_waits_for_the_workshop_confirm_with_two_workshops():
    # owner 2026-11-29: not confirmed -> the case is not started in Merimen
    assert run([mclaim()], seed=_merimen_seed(2)) == [[]]
    assert run([mclaim()], seed=_merimen_seed(2, ["INSERT INTO merimen_case_workshop (case_id, slot) VALUES ('c1', 2)"])) == [[]]
    # confirmed, or already locked by the worker (the case was made): it goes
    for row in ["INSERT INTO merimen_case_workshop (case_id, slot, confirmed_at) VALUES ('c1', 2, now())",
                "INSERT INTO merimen_case_workshop (case_id, slot, locked_at, locked_name) VALUES ('c1', 1, now(), 'W1')"]:
        r = run([mclaim()], seed=_merimen_seed(2, [row]))
        assert len(r[0]) == 1 and r[0][0][2] == "phase_a", row


@needs_pg
def test_phase_a_needs_no_confirm_with_one_workshop_or_none():
    for n in (0, 1):
        r = run([mclaim()], seed=_merimen_seed(n))
        assert len(r[0]) == 1 and r[0][0][2] == "phase_a", n


@needs_pg
def test_migration_0019_counts_every_existing_case_as_confirmed():
    mig = (HERE.parent.parent / "web" / "drizzle" / "0019_workshop_confirm.sql").read_text()
    assert not re.search(r"\b(DROP|DELETE|TRUNCATE)\b", mig, re.I)
    seed = [
        "INSERT INTO organizations (id, name) VALUES ('o1', 'One')",
        "INSERT INTO cases (id, org_id, plate, status) VALUES ('c1','o1','A1','phase_a'), ('c2','o1','A2','phase_a')",
        "INSERT INTO merimen_case_workshop (case_id, slot) VALUES ('c2', 2)",
    ] + [s for s in mig.split("--> statement-breakpoint") if s.strip()] * 2  # runs twice
    r = run([{"sql": "SELECT case_id, slot, confirmed_at IS NOT NULL FROM merimen_case_workshop ORDER BY case_id"}], seed=seed)
    assert r[0] == [["c1", 1, True], ["c2", 2, True]]


@needs_pg
def test_phase_a_waits_when_the_cases_workshop_was_removed():
    # confirmed on workshop 2, then the user removed workshop 2: wait for a new pick + Confirm (the worker could only stop it)
    two_then_one = _merimen_seed(2, ["INSERT INTO merimen_case_workshop (case_id, slot, confirmed_at) VALUES ('c1', 2, now())",
                                     "DELETE FROM merimen_workshops WHERE org_id = 'o1' AND slot = 2"])
    assert run([mclaim()], seed=two_then_one) == [[]]
    # one workshop left and the case not confirmed, but on the removed slot: waits as well
    assert run([mclaim()], seed=_merimen_seed(1, ["INSERT INTO merimen_case_workshop (case_id, slot) VALUES ('c1', 2)"])) == [[]]
    # moved to the remaining workshop: with one workshop there is nothing to confirm
    r = run([mclaim()], seed=_merimen_seed(1, ["INSERT INTO merimen_case_workshop (case_id, slot) VALUES ('c1', 1)"]))
    assert len(r[0]) == 1


@needs_pg
def test_a_worker_lock_without_a_name_on_a_removed_workshop_waits_like_the_page():
    # the page offers this case a new pick (the lock never named a workshop and that workshop is gone): the worker waits for it
    seed = _merimen_seed(2, ["INSERT INTO merimen_case_workshop (case_id, slot, locked_at) VALUES ('c1', 3, now())"])
    assert run([mclaim()], seed=seed) == [[]]


@needs_pg
def test_the_fallback_claim_has_no_workshop_gate():
    from autopilot_worker.jobs import CLAIM_SQL_NO_WORKSHOPS
    assert "merimen_case_workshop" not in CLAIM_SQL_NO_WORKSHOPS and ";" not in CLAIM_SQL_NO_WORKSHOPS
    sql, args = to_numbered(CLAIM_SQL_NO_WORKSHOPS, claim_params(True, 1, "w1"))
    r = run([{"sql": sql, "params": args}], seed=_merimen_seed(2))
    assert len(r[0]) == 1


def test_store_claim_falls_back_only_when_the_workshop_tables_are_missing():
    from autopilot_worker.jobs import CLAIM_SQL_NO_WORKSHOPS
    from autopilot_worker.store import PgRepo

    class DB:
        def __init__(self, err):
            self.err, self.seen = err, []
        def execute(self, sql, params=None):
            self.seen.append(sql)
            if len(self.seen) == 1:
                raise Exception(self.err)
            return [(1, "c1", "phase_a", 1, "o1")]

    repo = PgRepo.__new__(PgRepo)
    repo.db = DB('column "confirmed_at" does not exist (42703)')
    assert repo.claim(ext_connect=True, worker_id="w")["case_id"] == "c1"
    assert repo.db.seen[1] == CLAIM_SQL_NO_WORKSHOPS
    repo.db = DB("permission denied for table jobs (42501)")
    with pytest.raises(Exception):
        repo.claim(ext_connect=True, worker_id="w")


def test_store_claim_does_not_fall_back_for_other_missing_objects():
    from autopilot_worker.store import PgRepo

    class DB:
        def execute(self, sql, params=None):
            raise Exception('relation "jobs_view" does not exist (42P01)')

    repo = PgRepo.__new__(PgRepo)
    repo.db = DB()
    with pytest.raises(Exception):
        repo.claim(ext_connect=True, worker_id="w")
