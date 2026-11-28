"""Job claim: ONE statement. The inner SELECT locks the row with SKIP LOCKED, the outer UPDATE marks it running and
returns it, so two workers (or two HTTP requests) cannot take the same job and no session has to stay open."""

from __future__ import annotations

_CLAIM_TEMPLATE = """
UPDATE jobs SET state = 'running', locked_by = %(worker)s, locked_at = now(), attempts = attempts + 1
WHERE state = 'queued' AND id = (
SELECT j.id
FROM jobs j
JOIN cases c ON c.id = j.case_id
WHERE j.state = 'queued'
  AND c.deleted_at IS NULL -- a case the user deleted (migration 0015) is never picked up
  AND (j.not_before IS NULL OR j.not_before <= now())
  -- never two jobs of one case at the same time (WORKER_SLOTS > 1, plan #150). Race-free inside one worker process (it claims
  -- one job at a time), several processes with slots are not a supported setup (README)
  AND NOT EXISTS (SELECT 1 FROM jobs j5 WHERE j5.case_id = j.case_id AND j5.state = 'running')
  -- a create (Phase A of a case with no Merimen case yet) runs one at a time in this process: while one runs, no other is taken, so
  -- no slot sits waiting for it (WORKER_SLOTS > 1, GPR-150-3 G2)
  AND NOT (%(no_create)s AND j.step = 'phase_a' AND c.merimen_caseid IS NULL)
  AND (
    j.step NOT IN ('phase_a', 'checks', 'phase_b')
    OR (
      -- an org whose Merimen work this process holds back (a logout found in a job, a re-login on its way): no new Merimen step
      NOT (c.org_id = ANY(string_to_array(%(skip_orgs)s, ',')))
      -- one Chrome holds ONE Merimen login (one_chrome = WORKER_SLOTS > 1, this worker's own Chrome). When several orgs with a saved login share a Chrome port, only the org whose first case
      -- came first uses it, the others' Merimen steps wait until they have their own Chrome profile (WORKER_ACCOUNTS +
      -- WORKER_ORG_ACCOUNTS), so a case is never written into another user's Merimen account
      AND (NOT %(one_chrome)s OR NOT EXISTS (
        SELECT 1 FROM worker_sessions s0
        JOIN worker_sessions s6 ON s6.org_id <> s0.org_id
        WHERE s0.org_id = c.org_id AND s0.port IS NOT NULL
          -- another org on this Chrome: its row has this port, or it lost the port (gate) while a Merimen step of it still runs
          AND (s6.port = s0.port OR (s6.port IS NULL AND EXISTS (SELECT 1 FROM jobs jn6 JOIN cases jn6c ON jn6c.id = jn6.case_id WHERE jn6c.org_id = s6.org_id AND jn6.state = 'running' AND jn6.step IN ('phase_a', 'phase_b'))))
          -- that org takes part when its saved login is ok, or while a Merimen step of it runs (a login blocked under a running
          -- step never hands the Chrome to another org before that step ends)
          AND (EXISTS (SELECT 1 FROM merimen_credentials m6 WHERE m6.org_id = s6.org_id AND m6.verify_state = 'ok' AND NOT m6.blocked)
               OR EXISTS (SELECT 1 FROM jobs jb6 JOIN cases jb6c ON jb6c.id = jb6.case_id WHERE jb6c.org_id = s6.org_id AND jb6.state = 'running' AND jb6.step IN ('phase_a', 'phase_b')))
          -- the owner: an org with a Merimen step running now first (ownership never moves under running work), then the first
          -- non-deleted case first (an org without one comes last), ties by org id
          AND (NOT EXISTS (SELECT 1 FROM jobs jr6 JOIN cases jr6c ON jr6c.id = jr6.case_id WHERE jr6c.org_id = s6.org_id AND jr6.state = 'running' AND jr6.step IN ('phase_a', 'phase_b')), coalesce((SELECT min(c7.created_at) FROM cases c7 WHERE c7.org_id = s6.org_id AND c7.deleted_at IS NULL), 'infinity'), s6.org_id)
            < (NOT EXISTS (SELECT 1 FROM jobs jr8 JOIN cases jr8c ON jr8c.id = jr8.case_id WHERE jr8c.org_id = c.org_id AND jr8.state = 'running' AND jr8.step IN ('phase_a', 'phase_b')), coalesce((SELECT min(c8.created_at) FROM cases c8 WHERE c8.org_id = c.org_id AND c8.deleted_at IS NULL), 'infinity'), c.org_id)
      ))
    )
  )
  AND (
    SELECT count(*)::int FROM jobs j2
    JOIN cases c2 ON c2.id = j2.case_id
    WHERE c2.org_id = c.org_id AND j2.state = 'running'
  ) < %(org_limit)s
  AND (
    (j.step = 'intake' AND c.status IN ('phase_a', 'pending_doc'))
    OR j.step = 'photo_model'
    OR (
      %(merimen)s
      AND j.step = 'phase_a'
      AND c.status IN ('phase_a', 'waiting_user')
      {ws_gate}      AND EXISTS (
        SELECT 1 FROM merimen_credentials mc
        WHERE mc.org_id = c.org_id AND mc.verify_state = 'ok' AND NOT mc.blocked
      )
      AND EXISTS (
        SELECT 1 FROM worker_sessions s
        WHERE s.org_id = c.org_id AND s.status = 'connected'
      )
      AND EXISTS (
        SELECT 1 FROM ext_org_settings g
        WHERE g.org_id = c.org_id AND g.enabled AND btrim(coalesce(g.consent_reference, '')) <> ''
      )
      AND EXISTS (SELECT 1 FROM ext_consents k WHERE k.org_id = c.org_id)
    )
    OR (
      %(merimen)s
      AND j.step = 'checks'
      AND c.status IN ('checking', 'waiting_user')
      AND EXISTS (
        SELECT 1 FROM merimen_credentials mc
        WHERE mc.org_id = c.org_id AND mc.verify_state = 'ok' AND NOT mc.blocked
      )
      AND EXISTS (
        SELECT 1 FROM worker_sessions s
        WHERE s.org_id = c.org_id AND s.status = 'connected'
      )
      AND EXISTS (
        SELECT 1 FROM ext_org_settings g
        WHERE g.org_id = c.org_id AND g.enabled AND btrim(coalesce(g.consent_reference, '')) <> ''
      )
      AND EXISTS (SELECT 1 FROM ext_consents k WHERE k.org_id = c.org_id)
    )
    OR (
      %(merimen)s
      AND j.step = 'phase_b'
      AND c.status IN ('waiting_user', 'phase_b')
      AND c.photos_done_at IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM merimen_credentials mc
        WHERE mc.org_id = c.org_id AND mc.verify_state = 'ok' AND NOT mc.blocked
      )
      AND EXISTS (
        SELECT 1 FROM worker_sessions s
        WHERE s.org_id = c.org_id AND s.status = 'connected'
      )
      AND EXISTS (
        SELECT 1 FROM ext_org_settings g
        WHERE g.org_id = c.org_id AND g.enabled AND btrim(coalesce(g.consent_reference, '')) <> ''
      )
      AND EXISTS (SELECT 1 FROM ext_consents k WHERE k.org_id = c.org_id)
    )
  )
-- the case uploaded first goes first, with all its later steps: user 1's cases are done before user 2's (owner 2026-11-28)
ORDER BY c.created_at, c.id, j.created_at, j.id
FOR NO KEY UPDATE OF j, c SKIP LOCKED
LIMIT 1
)
RETURNING id, case_id, step, attempts, (SELECT c3.org_id FROM cases c3 WHERE c3.id = jobs.case_id),
  (SELECT c9.merimen_caseid IS NULL FROM cases c9 WHERE c9.id = jobs.case_id)
"""

WS_GATE = """-- owner 2026-11-29: with two or more workshops the user confirms the case's workshop once (migration 0019) before Phase A.
-- The same rule as the page (web/src/lib/ext/workshop-rules.ts workshopState: a Confirm is asked when the block is shown and the
-- workshop is neither fixed nor confirmed on a workshop that still exists). Here: the job may go when no Confirm is asked.
AND (
  c.merimen_caseid IS NOT NULL
  OR EXISTS (
    SELECT 1 FROM merimen_case_workshop cw
    WHERE cw.case_id = c.id AND (
      (cw.locked_at IS NOT NULL AND (cw.locked_name IS NOT NULL OR EXISTS (SELECT 1 FROM merimen_workshops w WHERE w.org_id = c.org_id AND w.slot = cw.slot)))
      OR (cw.confirmed_at IS NOT NULL AND EXISTS (SELECT 1 FROM merimen_workshops w WHERE w.org_id = c.org_id AND w.slot = cw.slot))
    )
  )
  -- no block shown: fewer than two workshops and the case's own one still exists (or only the old single name is saved)
  OR (
    (SELECT count(*) FROM merimen_workshops w WHERE w.org_id = c.org_id) < 2
    AND (
      NOT EXISTS (SELECT 1 FROM merimen_workshops w WHERE w.org_id = c.org_id)
      OR EXISTS (
        SELECT 1 FROM merimen_workshops w WHERE w.org_id = c.org_id
          AND w.slot = COALESCE((SELECT cw.slot FROM merimen_case_workshop cw WHERE cw.case_id = c.id), 1)
      )
    )
  )
)
"""

CLAIM_SQL = _CLAIM_TEMPLATE.replace("{ws_gate}", "\n      ".join(WS_GATE.strip().splitlines()) + "\n")
# Before migration 0019 (or 0014) the gate's table or column is not there: the whole statement would fail and stop every job,
# not only Phase A. Without those there is nothing to confirm either, so the store falls back to the claim without the gate.
CLAIM_SQL_NO_WORKSHOPS = _CLAIM_TEMPLATE.replace("{ws_gate}", "")


# Another org with a verified Merimen login (or a Merimen step running) shares this org's Chrome port and has a Merimen step running (or, when neither or both
# have one, its first non-deleted case came earlier): that org "owns" the
# Chrome (one Chrome holds one Merimen login). Used by the claim (above, inline) and by the session sync (no re-login for this org,
# so the Chrome is never switched to this org's Merimen account under the owner's running cases). %(org)s = this org, %(port)s =
# the Chrome port this pass gives it (from the config, not the stored row, which can still be NULL).
CHROME_TAKEN_SQL = """
SELECT EXISTS (
  SELECT 1 FROM worker_sessions s6
  WHERE s6.org_id <> %(org)s
    AND (s6.port = %(port)s OR (s6.port IS NULL AND EXISTS (SELECT 1 FROM jobs jn6 JOIN cases jn6c ON jn6c.id = jn6.case_id WHERE jn6c.org_id = s6.org_id AND jn6.state = 'running' AND jn6.step IN ('phase_a', 'phase_b'))))
    AND (EXISTS (SELECT 1 FROM merimen_credentials m6 WHERE m6.org_id = s6.org_id AND m6.verify_state = 'ok' AND NOT m6.blocked)
         OR EXISTS (SELECT 1 FROM jobs jb6 JOIN cases jb6c ON jb6c.id = jb6.case_id WHERE jb6c.org_id = s6.org_id AND jb6.state = 'running' AND jb6.step IN ('phase_a', 'phase_b')))
    AND (NOT EXISTS (SELECT 1 FROM jobs jr6 JOIN cases jr6c ON jr6c.id = jr6.case_id WHERE jr6c.org_id = s6.org_id AND jr6.state = 'running' AND jr6.step IN ('phase_a', 'phase_b')), coalesce((SELECT min(c7.created_at) FROM cases c7 WHERE c7.org_id = s6.org_id AND c7.deleted_at IS NULL), 'infinity'), s6.org_id)
      < (NOT EXISTS (SELECT 1 FROM jobs jr8 JOIN cases jr8c ON jr8c.id = jr8.case_id WHERE jr8c.org_id = %(org)s AND jr8.state = 'running' AND jr8.step IN ('phase_a', 'phase_b')), coalesce((SELECT min(c8.created_at) FROM cases c8 WHERE c8.org_id = %(org)s AND c8.deleted_at IS NULL), 'infinity'), %(org)s::text)
)
"""


def claim_params(ext_connect: bool, org_limit: int = 1, worker_id: str = "worker", skip_orgs=(), one_chrome: bool = False,
                 no_create: bool = False) -> dict:
    """skip_orgs: orgs whose Merimen steps are not taken now (loop.paused_orgs). Org ids never hold a comma (they are generated ids).
    one_chrome (WORKER_SLOTS > 1): the one-login-per-Chrome-port rule; off, the claim is as before #150 for Merimen steps.
    no_create: a create is running in this process, so no other Phase A of a case without a Merimen case is taken now."""
    skip = ",".join(str(o) for o in skip_orgs if o and "," not in str(o))
    return {"merimen": ext_connect, "org_limit": int(org_limit), "worker": worker_id, "skip_orgs": skip, "one_chrome": bool(one_chrome),
            "no_create": bool(no_create)}


# A running job whose lease ran out goes back to the queue (or to failed after too many tries). One statement.
RECLAIM_SQL = """
UPDATE jobs SET state = CASE WHEN attempts >= %s THEN 'failed' ELSE 'queued' END, locked_by = NULL, locked_at = NULL
WHERE state = 'running' AND (locked_at IS NULL OR locked_at < now() - (%s || ' seconds')::interval)
  -- a job this worker process still runs keeps its row, however long the DB was away (WORKER_SLOTS > 1, plan #150 I2)
  AND NOT (id::text = ANY(string_to_array(%s, ',')))
RETURNING id
"""

# The worker that holds a job renews the lease. A renewal for a job another worker has since taken matches nothing.
# A claim of a job this process still has in a slot (it wrote its outcome and is still closing its tabs) is undone: queued again in
# 30 s, its try not counted (plan #150 I2)
GIVE_BACK_SQL = ("UPDATE jobs SET state = 'queued', locked_by = NULL, locked_at = NULL, attempts = GREATEST(attempts - 1, 0), "
                 "not_before = now() + interval '30 seconds' WHERE id = %s AND state = 'running' AND locked_by = %s RETURNING id")

TOUCH_SQL = "UPDATE jobs SET locked_at = now() WHERE id = %s AND state = 'running' AND locked_by = %s RETURNING id"
