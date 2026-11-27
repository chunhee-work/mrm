-- The worker asks TypeSafe (Jev) to clear false alarms in the Step 2 check and writes one llm_calls row per call, like the web app.
-- It only needs INSERT. Not applied to production yet: the owner OKs it first. Until then the worker skips the row (nothing else changes).
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'autopilot_worker') THEN
    GRANT INSERT ON "llm_calls" TO autopilot_worker;
    GRANT USAGE, SELECT ON SEQUENCE "llm_calls_id_seq" TO autopilot_worker;
  END IF;
END $$;
