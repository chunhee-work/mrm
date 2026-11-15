CREATE TABLE "case_extras" (
	"id" serial PRIMARY KEY NOT NULL,
	"case_id" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "photo_uploads" (
	"path" text PRIMARY KEY NOT NULL,
	"case_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "case_photos" ADD COLUMN "orig_n" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "case_photos" ADD COLUMN "src_name" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "case_photos" ADD COLUMN "blob_path" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "case_photos" ADD COLUMN "thumb_path" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "case_photos" ADD COLUMN "name_state" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "case_photos" ADD COLUMN "claimed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "case_photos" ADD COLUMN "how" text;--> statement-breakpoint
ALTER TABLE "case_photos" ADD COLUMN "alts" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "case_photos" ADD COLUMN "name_error" text;--> statement-breakpoint
ALTER TABLE "case_photos" ADD COLUMN "named_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "case_photos" ADD COLUMN "version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "case_photos" ADD COLUMN "content_hash" text;--> statement-breakpoint
ALTER TABLE "cases" ADD COLUMN "photos_done_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "cases" ADD COLUMN "photos_rev" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "case_extras" ADD CONSTRAINT "case_extras_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photo_uploads" ADD CONSTRAINT "photo_uploads_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "case_extras_case_name" ON "case_extras" USING btree ("case_id",lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "case_photos_case_orig" ON "case_photos" USING btree ("case_id","orig_n");--> statement-breakpoint
CREATE INDEX "case_photos_case_pos" ON "case_photos" USING btree ("case_id","position");--> statement-breakpoint
CREATE INDEX "case_photos_case_state" ON "case_photos" USING btree ("case_id","name_state");--> statement-breakpoint
CREATE UNIQUE INDEX "case_photos_case_hash" ON "case_photos" USING btree ("case_id","content_hash") WHERE "case_photos"."content_hash" IS NOT NULL;