-- Photo-model naming job state (plan chunhee-work/mrm#26). Additive and safe to run again.
ALTER TABLE "cases" ADD COLUMN IF NOT EXISTS "photo_model_job" jsonb;
