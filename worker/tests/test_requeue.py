"""A job that is put back waits before it is taken again (jobs.not_before): 30 s, 2 min, 10 min. The fourth try is the last
(it used to be taken again every 2 seconds for ever, one timeline row each time)."""
from autopilot_worker.db import to_numbered
from autopilot_worker.jobs import CLAIM_SQL, claim_params
from autopilot_worker.login_page import backoff_seconds
from autopilot_worker.pipeline import Outcome
from autopilot_worker.store import MAX_ATTEMPTS, REQUEUE_MAX_ATTEMPTS, PgRepo
from test_claim import SEED, needs_pg, run


class Rec:
    def __init__(self):
        self.batches = []

    def execute(self, sql, params=()):
        raise AssertionError("apply writes one batch")

    def batch(self, statements):
        self.batches.append(list(statements))
        return []


def applied(job, outcome):
    rec = Rec()
    PgRepo("", db=rec).apply(job, outcome)
    assert len(rec.batches) == 1
    return rec.batches[0]


def job(attempts, step="phase_b"):
    return {"id": 100, "case_id": "c1", "step": step, "org_id": "o1", "attempts": attempts}


GAVE_UP = "Stopped after 4 tries (it waited 30 s, 2 min and 10 min in between). It will not be tried again by itself."


def test_a_requeue_waits_30_seconds_then_2_minutes_then_10_minutes():
    waits = []
    for attempts in (1, 2, 3):
        sql, params = applied(job(attempts), Outcome("requeue", event="Phase B stopped. Merimen could not be read"))[0]
        assert "not_before = now() +" in sql and "state = 'queued'" in sql and "locked_by = NULL" in sql and "state = 'running'" in sql
        assert params == (str(backoff_seconds(attempts)), 100)
        waits.append(int(params[0]))
    assert waits == [30, 120, 600]


def test_a_requeue_before_the_last_try_writes_no_give_up_line_and_leaves_the_case_alone():
    st = applied(job(3), Outcome("requeue", event="Phase B stopped. Merimen could not be read"))
    assert [p[2] for s, p in st if s.lstrip().startswith("INSERT INTO case_events")] == ["Phase B stopped. Merimen could not be read"]
    assert not [1 for s, p in st if "UPDATE cases SET" in s]


def test_the_fourth_try_is_the_last():
    assert (MAX_ATTEMPTS, REQUEUE_MAX_ATTEMPTS) == (3, 4)
    st = applied(job(4), Outcome("requeue", event="Phase B stopped. Merimen could not be read"))
    sql, params = st[0]
    assert "not_before" not in sql and params == ("failed", 100)
    events = [p[2] for s, p in st if s.lstrip().startswith("INSERT INTO case_events")]
    assert events == ["Phase B stopped. Merimen could not be read", GAVE_UP]
    case_update = [p for s, p in st if "UPDATE cases SET" in s]
    assert len(case_update) == 1 and case_update[0][0] is None and case_update[0][5] == "gave up after 4 tries"  # status untouched, error set


def test_the_last_try_keeps_the_error_the_step_gave():
    st = applied(job(5, "phase_a"), Outcome("requeue", error="no_tab", event="Phase A dry-run failed. No logged-in Merimen tab"))
    assert st[0][1] == ("failed", 100)
    assert [p[5] for s, p in st if "UPDATE cases SET" in s] == ["no_tab"]


def test_other_outcomes_do_not_touch_not_before():
    for state in ("done", "failed", "paused", "cancelled"):
        sql, params = applied(job(1), Outcome(state))[0]
        assert "not_before" not in sql and params == (state, 100)
    hold = applied(job(1), Outcome("hold"))[0]
    assert "not_before" not in hold[0] and "locked_at = now()" in hold[0]


def _steps(batch):
    out = []
    for st in batch:
        text, args = to_numbered(*st)
        out.append({"sql": text, "params": args})
    return out


@needs_pg
def test_on_postgres_a_requeued_job_is_not_claimable_until_its_time_and_fails_on_the_fourth_try():
    seed = SEED[:2] + [
        "INSERT INTO jobs (id, case_id, step, state, attempts, locked_by, locked_at) VALUES (100,'c1','intake','running',1,'w1',now())",
        "INSERT INTO jobs (id, case_id, step, state, attempts, locked_by, locked_at) VALUES (200,'c2','intake','running',4,'w1',now())",
    ]
    first = _steps(applied({"id": 100, "case_id": "c1", "step": "intake", "org_id": "o1", "attempts": 1}, Outcome("requeue", event="waiting")))
    last = _steps(applied({"id": 200, "case_id": "c2", "step": "intake", "org_id": "o1", "attempts": 4}, Outcome("requeue", event="waiting")))
    claim_sql, claim_args = to_numbered(CLAIM_SQL, claim_params(False, 5, "w2"))
    claim = {"sql": claim_sql, "params": claim_args}
    r = run([*first, *last, claim,
             {"sql": "SELECT id, state, locked_by, not_before > now() + interval '25 seconds', not_before <= now() + interval '31 seconds' FROM jobs ORDER BY id"},
             {"sql": "UPDATE jobs SET not_before = now() - interval '1 second' WHERE id = 100"},
             claim,
             {"sql": "SELECT message FROM case_events WHERE case_id = 'c2' ORDER BY id"},
             {"sql": "SELECT status, error FROM cases WHERE id = 'c2'"}], seed=seed)
    n = len(first) + len(last)
    assert r[n] == []  # the job that was put back is not taken at once
    assert r[n + 1] == [[100, "queued", None, True, True], [200, "failed", None, None, None]]
    assert [x[0] for x in r[n + 3]] == [100]  # taken once its time has come
    assert [x[0] for x in r[n + 4]] == ["waiting", GAVE_UP]
    assert r[n + 5] == [["phase_a", "gave up after 4 tries"]]
