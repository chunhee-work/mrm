-- The details a user types once on the front page besides the Merimen login: workshop, manager, adjuster. Additive only.
-- profile_version goes up by one on every save, so the worker knows it must replace what it remembered for this user.
-- NOT applied in production until the owner approves.
ALTER TABLE "merimen_credentials" ADD COLUMN IF NOT EXISTS "workshop_name" text;
--> statement-breakpoint
ALTER TABLE "merimen_credentials" ADD COLUMN IF NOT EXISTS "manager_name" text;
--> statement-breakpoint
ALTER TABLE "merimen_credentials" ADD COLUMN IF NOT EXISTS "adjuster_name" text;
--> statement-breakpoint
ALTER TABLE "merimen_credentials" ADD COLUMN IF NOT EXISTS "profile_version" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
-- profile_version comes from this sequence: atomic under two saves at once, and it keeps rising after a delete and a new first save
CREATE SEQUENCE IF NOT EXISTS "merimen_profile_seq";
