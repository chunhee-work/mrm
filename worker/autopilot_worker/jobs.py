"""Job claim. The SELECT is the only place a job is taken, and two workers cannot take the same row."""

from __future__ import annotations

CLAIM_SQL = """
SELECT j.id, j.case_id, j.step, j.attempts, c.org_id
FROM jobs j
JOIN cases c ON c.id = j.case_id
WHERE j.state = 'queued'
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
FOR UPDATE OF j SKIP LOCKED
LIMIT 1
"""


def claim_params(ext_connect: bool, org_limit: int = 1) -> dict:
    return {"merimen": ext_connect, "org_limit": int(org_limit)}
