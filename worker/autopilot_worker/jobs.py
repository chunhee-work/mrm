"""Job claim: ONE statement. The inner SELECT locks the row with SKIP LOCKED, the outer UPDATE marks it running and
returns it, so two workers (or two HTTP requests) cannot take the same job and no session has to stay open."""

from __future__ import annotations

CLAIM_SQL = """
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
        JOIN worker_sessions s6 ON s6.port = s0.port AND s6.org_id <> s0.org_id
        JOIN merimen_credentials m6 ON m6.org_id = s6.org_id AND m6.verify_state = 'ok' AND NOT m6.blocked
        WHERE s0.org_id = c.org_id AND s0.port IS NOT NULL
          -- the owner: first live case first (an org without a live case comes last), ties by org id
          AND (coalesce((SELECT min(c7.created_at) FROM cases c7 WHERE c7.org_id = s6.org_id AND c7.deleted_at IS NULL), 'infinity'), s6.org_id)
            < (coalesce((SELECT min(c8.created_at) FROM cases c8 WHERE c8.org_id = c.org_id AND c8.deleted_at IS NULL), 'infinity'), c.org_id)
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
RETURNING id, case_id, step, attempts, (SELECT c3.org_id FROM cases c3 WHERE c3.id = jobs.case_id)
"""


# Another org with a verified Merimen login shares this org's Chrome port and its first live case came earlier: that org "owns" the
# Chrome (one Chrome holds one Merimen login). Used by the claim (above, inline) and by the session sync (no re-login for this org,
# so the Chrome is never switched to this org's Merimen account under the owner's running cases). %(org)s = this org, %(port)s =
# the Chrome port this pass gives it (from the config, not the stored row, which can still be NULL).
CHROME_TAKEN_SQL = """
SELECT EXISTS (
  SELECT 1 FROM worker_sessions s6
  JOIN merimen_credentials m6 ON m6.org_id = s6.org_id AND m6.verify_state = 'ok' AND NOT m6.blocked
  WHERE s6.port = %(port)s AND s6.org_id <> %(org)s
    AND (coalesce((SELECT min(c7.created_at) FROM cases c7 WHERE c7.org_id = s6.org_id AND c7.deleted_at IS NULL), 'infinity'), s6.org_id)
      < (coalesce((SELECT min(c8.created_at) FROM cases c8 WHERE c8.org_id = %(org)s AND c8.deleted_at IS NULL), 'infinity'), %(org)s::text)
)
"""


def claim_params(ext_connect: bool, org_limit: int = 1, worker_id: str = "worker", skip_orgs=(), one_chrome: bool = False) -> dict:
    """skip_orgs: orgs whose Merimen steps are not taken now (loop.paused_orgs). Org ids never hold a comma (they are generated ids).
    one_chrome (WORKER_SLOTS > 1): the one-login-per-Chrome-port rule; off, the claim is as before #150 for Merimen steps."""
    skip = ",".join(str(o) for o in skip_orgs if o and "," not in str(o))
    return {"merimen": ext_connect, "org_limit": int(org_limit), "worker": worker_id, "skip_orgs": skip, "one_chrome": bool(one_chrome)}


# A running job whose lease ran out goes back to the queue (or to failed after too many tries). One statement.
RECLAIM_SQL = """
UPDATE jobs SET state = CASE WHEN attempts >= %s THEN 'failed' ELSE 'queued' END, locked_by = NULL, locked_at = NULL
WHERE state = 'running' AND (locked_at IS NULL OR locked_at < now() - (%s || ' seconds')::interval)
RETURNING id
"""

# The worker that holds a job renews the lease. A renewal for a job another worker has since taken matches nothing.
TOUCH_SQL = "UPDATE jobs SET locked_at = now() WHERE id = %s AND state = 'running' AND locked_by = %s RETURNING id"
