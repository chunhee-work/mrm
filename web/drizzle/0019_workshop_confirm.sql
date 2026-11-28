-- Owner 2026-11-29: on an account with two or more workshops the user picks the case's workshop and presses Confirm once;
-- the worker does not start making the case in Merimen (Phase A) before that, and after it the workshop cannot be changed.
-- Additive: one new column. A case that has no row is workshop 1, not confirmed yet.
ALTER TABLE "merimen_case_workshop" ADD COLUMN IF NOT EXISTS "confirmed_at" timestamp;
--> statement-breakpoint
-- Every case that exists when this runs counts as confirmed, so cases already on their way (NCH5773, DCD4004, ...) are not stalled.
-- A case without a row gets one for workshop 1 (the same as no row). Only rows that are not confirmed yet are touched.
INSERT INTO "merimen_case_workshop" ("case_id", "slot", "confirmed_at")
  SELECT "id", 1, now() FROM "cases"
  ON CONFLICT ("case_id") DO NOTHING;
--> statement-breakpoint
UPDATE "merimen_case_workshop" SET "confirmed_at" = now() WHERE "confirmed_at" IS NULL;
