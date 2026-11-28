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
      -- owner 2026-11-29: with two or more workshops the user confirms the case's workshop first (migration 0019),
      -- a workshop the worker already locked (the case was made) needs nothing more
      AND (
        EXISTS (
          SELECT 1 FROM merimen_case_workshop cw
          WHERE cw.case_id = c.id AND (cw.confirmed_at IS NOT NULL OR cw.locked_at IS NOT NULL)
        )
        OR (SELECT count(*) FROM merimen_workshops w WHERE w.org_id = c.org_id) < 2
      )
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
ORDER BY j.created_at
FOR NO KEY UPDATE OF j, c SKIP LOCKED
LIMIT 1
)
RETURNING id, case_id, step, attempts, (SELECT c3.org_id FROM cases c3 WHERE c3.id = jobs.case_id)
"""


def claim_params(ext_connect: bool, org_limit: int = 1, worker_id: str = "worker") -> dict:
    return {"merimen": ext_connect, "org_limit": int(org_limit), "worker": worker_id}


# A running job whose lease ran out goes back to the queue (or to failed after too many tries). One statement.
RECLAIM_SQL = """
UPDATE jobs SET state = CASE WHEN attempts >= %s THEN 'failed' ELSE 'queued' END, locked_by = NULL, locked_at = NULL
WHERE state = 'running' AND (locked_at IS NULL OR locked_at < now() - (%s || ' seconds')::interval)
RETURNING id
"""

# The worker that holds a job renews the lease. A renewal for a job another worker has since taken matches nothing.
TOUCH_SQL = "UPDATE jobs SET locked_at = now() WHERE id = %s AND state = 'running' AND locked_by = %s RETURNING id"
