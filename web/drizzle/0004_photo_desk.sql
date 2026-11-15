-- Same statements as the first photo desk migration, written so they can run again safely:
-- production already has them (applied 2026-11-15 with the owner's approval).
CREATE TABLE IF NOT EXISTS "case_extras" (
	"id" serial PRIMARY KEY NOT NULL,
	"case_id" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "photo_uploads" (
	"path" text PRIMARY KEY NOT NULL,
	"case_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "case_photos" ADD COLUMN IF NOT EXISTS "orig_n" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "case_photos" ADD COLUMN IF NOT EXISTS "src_name" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "case_photos" ADD COLUMN IF NOT EXISTS "blob_path" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "case_photos" ADD COLUMN IF NOT EXISTS "thumb_path" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "case_photos" ADD COLUMN IF NOT EXISTS "name_state" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "case_photos" ADD COLUMN IF NOT EXISTS "claimed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "case_photos" ADD COLUMN IF NOT EXISTS "how" text;--> statement-breakpoint
ALTER TABLE "case_photos" ADD COLUMN IF NOT EXISTS "alts" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "case_photos" ADD COLUMN IF NOT EXISTS "name_error" text;--> statement-breakpoint
ALTER TABLE "case_photos" ADD COLUMN IF NOT EXISTS "named_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "case_photos" ADD COLUMN IF NOT EXISTS "version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "case_photos" ADD COLUMN IF NOT EXISTS "content_hash" text;--> statement-breakpoint
ALTER TABLE "cases" ADD COLUMN IF NOT EXISTS "photos_done_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "cases" ADD COLUMN IF NOT EXISTS "photos_rev" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "case_extras" ADD CONSTRAINT "case_extras_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "photo_uploads" ADD CONSTRAINT "photo_uploads_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "case_extras_case_name" ON "case_extras" USING btree ("case_id",lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "case_photos_case_orig" ON "case_photos" USING btree ("case_id","orig_n");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "case_photos_case_pos" ON "case_photos" USING btree ("case_id","position");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "case_photos_case_state" ON "case_photos" USING btree ("case_id","name_state");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "case_photos_case_hash" ON "case_photos" USING btree ("case_id","content_hash") WHERE "case_photos"."content_hash" IS NOT NULL;