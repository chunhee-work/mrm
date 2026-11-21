-- Photo naming desk -> Merimen (photo sync). Idempotent and additive. NOT applied in production until the owner approves.
-- photos_snapshot: fingerprint of the names, order and extra parts at the moment the adjuster pressed 完成 (null = not done).
-- photos_arranged_at: the opening order (corners, interior, odometer, chassis, engine) was applied once after naming.
ALTER TABLE "cases" ADD COLUMN IF NOT EXISTS "photos_snapshot" text;
--> statement-breakpoint
ALTER TABLE "cases" ADD COLUMN IF NOT EXISTS "photos_arranged_at" timestamp with time zone;
--> statement-breakpoint
-- One row per photo step of Phase A / Phase B. mode 'live' = the photos really went into Merimen (Phase A: the list that was uploaded);
-- mode 'dry' = a dry run that only records what it WOULD do ("would upload N, relabel N, reorder N").
CREATE TABLE IF NOT EXISTS "photo_upload_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"case_id" text NOT NULL REFERENCES "cases"("id") ON DELETE CASCADE,
	"phase" text NOT NULL,
	"mode" text NOT NULL,
	"action" text NOT NULL,
	"merimen_count" integer,
	"photos" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"would" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"corrections" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"snapshot" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "photo_upload_log_case_idx" ON "photo_upload_log" ("case_id", "created_at");
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'autopilot_worker') THEN
    GRANT SELECT, INSERT, UPDATE ON "photo_upload_log" TO autopilot_worker;
    GRANT USAGE, SELECT ON SEQUENCE "photo_upload_log_id_seq" TO autopilot_worker;
  END IF;
END
$$;
--> statement-breakpoint
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "step2_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"case_id" text NOT NULL REFERENCES "cases"("id") ON DELETE cascade,
	"mode" text NOT NULL,
	"action" text NOT NULL,
	"plan" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"check" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ai" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"playbook" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "step2_log_case_idx" ON "step2_log" ("case_id", "created_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "photo_learning" (
	"id" serial PRIMARY KEY NOT NULL,
	"case_id" text NOT NULL REFERENCES "cases"("id") ON DELETE cascade,
	"org_id" text NOT NULL,
	"photo_id" integer NOT NULL,
	"content_hash" text,
	"blob_path" text DEFAULT '' NOT NULL,
	"model_name" text,
	"label" text NOT NULL,
	"changed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"exported_at" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "photo_learning_case_photo" ON "photo_learning" ("case_id", "photo_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "photo_learning_open" ON "photo_learning" ("exported_at");
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'autopilot_worker') THEN
    GRANT SELECT, INSERT ON "step2_log" TO autopilot_worker;
    GRANT USAGE, SELECT ON SEQUENCE "step2_log_id_seq" TO autopilot_worker;
    GRANT SELECT, INSERT, UPDATE ON "photo_learning" TO autopilot_worker;
    GRANT USAGE, SELECT ON SEQUENCE "photo_learning_id_seq" TO autopilot_worker;
  END IF;
END
$$;
