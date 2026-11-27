"""The one stderr line a failed tick leaves (2026-11-27): which step, the SQLSTATE and a short message, never parameters or secrets."""
import pytest

from autopilot_worker import loop
from autopilot_worker.config import Config
from autopilot_worker.db import DbError
from autopilot_worker.loop import tick, tick_error_line


def test_db_error_line_has_step_code_and_short_message():
    line = tick_error_line(DbError("could not connect to server", "08006"), "heartbeat")
    assert line == "tick DbError step=heartbeat code=08006 msg=could not connect to server"


def test_db_error_without_code_and_message_capped():
    line = tick_error_line(DbError("x" * 500), "claim")
    assert line.startswith("tick DbError step=claim code=- msg=")
    assert len(line.split("msg=", 1)[1]) <= 200


def test_values_links_and_tokens_are_not_logged_but_names_are():
    token = "x" * 30  # any long unbroken string stands in for a key; no real key format here
    msg = ('invalid input syntax for type uuid: "case-123 secret"; key \'(a)=(b)\' violates "cases_pkey" '
           "at postgresql://autopilot_worker:pw@ep-x.neon.tech/db token " + token)
    line = tick_error_line(DbError(msg, "22P02"), "reclaim_stale")
    for leaked in ("case-123", "secret", "(a)=(b)", "autopilot_worker:pw", "neon.tech", token):
        assert leaked not in line
    assert '"cases_pkey"' in line and "code=22P02" in line


def test_other_errors_keep_the_short_form_plus_step():
    assert tick_error_line(ValueError("has a secret in it"), "session_sync") == "tick ValueError step=session_sync"


class Boom:
    """A repo that fails at one named call, like a Neon HTTP write that is not retried."""

    def __init__(self, fail_at):
        self.fail_at = fail_at

    def __getattr__(self, name):
        def call(*a, **k):
            if name == self.fail_at:
                raise DbError("database unreachable")
            return [] if name in ("followup_cases", "wanted") else None
        return call


@pytest.mark.parametrize("fail_at,step", [("heartbeat", "heartbeat"), ("reclaim_stale", "reclaim_stale"), ("followup_cases", "followup_cases"), ("claim", "claim")])
def test_tick_records_the_step_that_failed(fail_at, step):
    loop._last_cleanup[0] = 1e12
    cfg = Config.from_env({})
    with pytest.raises(DbError) as e:
        tick(cfg, Boom(fail_at), launch=lambda a: None, inspect=lambda p: None, namer=None, driver=None, download=lambda *a: None)
    assert tick_error_line(e.value) == f"tick DbError step={step} code=- msg=database unreachable"
