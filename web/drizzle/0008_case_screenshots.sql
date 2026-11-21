-- Progress screenshots of the Merimen tab, one row per picture. Idempotent and additive.
-- NOT applied in production until the owner approves. The picture itself lives in the PRIVATE Vercel Blob store
-- at screenshots/<user_id>/<case_id>/<step>-<time>.jpg; this table only holds the pathname.
-- user_id is the user who submitted the case. Only that user may see a row (the web route checks it; there is no org-wide read).
CREATE TABLE IF NOT EXISTS "case_screenshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
	"user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
	"case_id" text NOT NULL REFERENCES "cases"("id") ON DELETE CASCADE,
	"job_id" integer,
	"step" text NOT NULL,
	"caption_zh" text NOT NULL,
	"caption_en" text NOT NULL,
	"blob_pathname" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "case_screenshots_case_idx" ON "case_screenshots" ("case_id", "user_id", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "case_screenshots_expiry_idx" ON "case_screenshots" ("created_at") WHERE "deleted_at" IS NULL;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'autopilot_worker') THEN
    GRANT SELECT, INSERT, UPDATE ON "case_screenshots" TO autopilot_worker;
  END IF;
END
$$;
