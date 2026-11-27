-- Up to three workshops per account (owner 2026-11-27) and which workshop each case belongs to. Additive only: two new tables.
-- A case without a row in merimen_case_workshop belongs to workshop 1. NOT applied in production until the owner approves.
CREATE TABLE IF NOT EXISTS "merimen_workshops" (
  "org_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "slot" smallint NOT NULL CHECK ("slot" BETWEEN 1 AND 3),
  "name" text NOT NULL,
  "updated_at" timestamp NOT NULL DEFAULT now(),
  PRIMARY KEY ("org_id", "slot")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "merimen_case_workshop" (
  "case_id" text PRIMARY KEY REFERENCES "cases"("id") ON DELETE CASCADE,
  "slot" smallint NOT NULL CHECK ("slot" BETWEEN 1 AND 3),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
-- set by the worker the moment it uses the workshop to make the case in Merimen: from then on the user cannot switch it
ALTER TABLE "merimen_case_workshop" ADD COLUMN IF NOT EXISTS "locked_at" timestamp;
--> statement-breakpoint
-- the workshop name the worker used when it locked the case (a later rename of the workshop does not change what the case used)
ALTER TABLE "merimen_case_workshop" ADD COLUMN IF NOT EXISTS "locked_name" text;
--> statement-breakpoint
-- the worker reads the workshops and claims (locks) the one a case uses
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'autopilot_worker') THEN
    GRANT SELECT ON "merimen_workshops" TO autopilot_worker;
    GRANT SELECT, INSERT, UPDATE ON "merimen_case_workshop" TO autopilot_worker;
  END IF;
END $$;
--> statement-breakpoint
-- the one workshop typed so far becomes workshop 1
INSERT INTO "merimen_workshops" ("org_id", "slot", "name")
  SELECT "org_id", 1, btrim("workshop_name") FROM "merimen_credentials" WHERE btrim(coalesce("workshop_name", '')) <> ''
  ON CONFLICT DO NOTHING;
