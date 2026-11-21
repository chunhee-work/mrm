-- Plan #40 (Merimen login in a browser inside the app). Additive only, safe to run again.
-- NOT applied in production until the owner approves. merimen_connections is unused so far (no rows).
ALTER TABLE "merimen_connections" ADD COLUMN IF NOT EXISTS "opened_by" text;--> statement-breakpoint
ALTER TABLE "merimen_connections" ADD COLUMN IF NOT EXISTS "opened_at" timestamp;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "merimen_conn_org" ON "merimen_connections" ("org_id");
