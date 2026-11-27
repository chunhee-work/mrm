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
-- the one workshop typed so far becomes workshop 1
INSERT INTO "merimen_workshops" ("org_id", "slot", "name")
  SELECT "org_id", 1, btrim("workshop_name") FROM "merimen_credentials" WHERE btrim(coalesce("workshop_name", '')) <> ''
  ON CONFLICT DO NOTHING;
