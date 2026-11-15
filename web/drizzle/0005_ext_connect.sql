-- Plan #38 (Merimen connection by browser extension), P1. Additive only, safe to run again.
-- NOT applied in production until the owner approves. Nothing reads these tables while EXT_CONNECT is off.
CREATE TABLE IF NOT EXISTS "ext_org_settings" (
	"org_id" text PRIMARY KEY NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
	"enabled" boolean DEFAULT false NOT NULL,
	"consent_authority" text,
	"consent_reference" text,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ext_consents" (
	"id" serial PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
	"user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
	"wording_version" text NOT NULL,
	"firm_label" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ext_pairing_codes" (
	"id" serial PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
	"user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
	"code_hash" text NOT NULL UNIQUE,
	"attempts" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp NOT NULL,
	"used_at" timestamp,
	"hour_bucket" bigint NOT NULL,
	"slot" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ext_pairing_user_slot" ON "ext_pairing_codes" ("user_id","hour_bucket","slot");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ext_installs" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
	"user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
	"refresh_hash" text NOT NULL,
	"revoked_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_seen_at" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ext_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
	"case_id" text NOT NULL REFERENCES "cases"("id") ON DELETE CASCADE,
	"state" text DEFAULT 'queued' NOT NULL,
	"lease_id" text,
	"install_id" text,
	"tab_id" text,
	"lease_until" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ext_job_steps" (
	"id" serial PRIMARY KEY NOT NULL,
	"job_id" text NOT NULL REFERENCES "ext_jobs"("id") ON DELETE CASCADE,
	"step_code" text NOT NULL,
	"status" text NOT NULL,
	"error_code" text,
	"actor_user_id" text,
	"at" timestamp DEFAULT now() NOT NULL
);
