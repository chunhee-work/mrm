-- Linux worker, encrypted Merimen login, one-attempt check. Additive.
-- NOT applied in production until the owner approves.
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "not_before" timestamp;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "worker_runtimes" (
	"id" text PRIMARY KEY NOT NULL,
	"seen_at" timestamp DEFAULT now() NOT NULL,
	"photo_model" text,
	"chrome_ok" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "worker_sessions" (
	"org_id" text PRIMARY KEY NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
	"account_key" text DEFAULT 'default' NOT NULL,
	"port" integer,
	"status" text DEFAULT 'idle' NOT NULL,
	"wanted" text DEFAULT 'none' NOT NULL,
	"started_by" text,
	"last_seen_at" timestamp,
	"detail" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "merimen_credentials" (
	"org_id" text PRIMARY KEY NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
	"username_hint" text NOT NULL,
	"wrapped_dek" text NOT NULL,
	"dek_nonce" text NOT NULL,
	"username_ct" text NOT NULL,
	"username_nonce" text NOT NULL,
	"password_ct" text NOT NULL,
	"password_nonce" text NOT NULL,
	"verify_state" text DEFAULT 'queued' NOT NULL,
	"login_attempts" integer DEFAULT 0 NOT NULL,
	"blocked" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"updated_by" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "merimen_cred_audit" (
	"id" serial PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"user_id" text,
	"action" text NOT NULL,
	"at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "merimen_otp" (
	"id" serial PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
	"case_id" text REFERENCES "cases"("id") ON DELETE CASCADE,
	"state" text DEFAULT 'waiting' NOT NULL,
	"code_ct" text,
	"code_nonce" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL
);
