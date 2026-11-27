-- The worker reads the photo desk's Space-added parts (case_extras) when it runs a job, and prod had no grant for it:
-- "tick DbError step=job code=42501 msg=permission denied for table case_extras". SELECT only: the worker never writes it.
-- Audit 2026-11-27 of every table the worker's SQL touches: case_extras was the only one missing a grant on prod.
-- Idempotent (re-granting is a no-op), no schema change, skipped where the role does not exist (local, CI).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'autopilot_worker') THEN
    GRANT SELECT ON "case_extras" TO autopilot_worker;
  END IF;
END
$$;
