-- QC round 4: the worker role could not add photos because it had no right on the case_photos id sequence.
-- Idempotent; does nothing when the role does not exist (local and test databases).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'autopilot_worker') THEN
    GRANT USAGE, SELECT ON SEQUENCE "case_photos_id_seq" TO autopilot_worker;
  END IF;
END
$$;
