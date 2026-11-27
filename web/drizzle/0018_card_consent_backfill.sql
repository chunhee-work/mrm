-- Option B (owner 2026-11-27): ticking the box on the details card is the consent the worker's gate needs.
-- New saves write these rows in the app. This backfills organisations that already saved a login before that.
-- Additive and idempotent: inserts only; never touches an org that already has a row (hand-written operator rows stay as they are).
INSERT INTO "ext_org_settings" ("org_id", "enabled", "consent_authority", "consent_reference")
SELECT c."org_id", true, 'details_card', 'details-card:backfill:' || to_char(now(), 'YYYY-MM-DD')
FROM "merimen_credentials" c
ON CONFLICT ("org_id") DO NOTHING;
--> statement-breakpoint
INSERT INTO "ext_consents" ("org_id", "user_id", "wording_version")
SELECT c."org_id", c."updated_by", 'details-card-1'
FROM "merimen_credentials" c
WHERE c."updated_by" IS NOT NULL
  AND EXISTS (SELECT 1 FROM "user" u WHERE u."id" = c."updated_by")
  AND NOT EXISTS (SELECT 1 FROM "ext_consents" k WHERE k."org_id" = c."org_id");
