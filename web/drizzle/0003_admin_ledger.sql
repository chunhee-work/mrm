CREATE TABLE "email_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"at" timestamp DEFAULT now() NOT NULL,
	"kind" text NOT NULL,
	"recipient_domain" text NOT NULL,
	"status" text NOT NULL,
	"error_class" text
);
--> statement-breakpoint
CREATE TABLE "llm_calls" (
	"id" serial PRIMARY KEY NOT NULL,
	"at" timestamp DEFAULT now() NOT NULL,
	"request_id" text NOT NULL,
	"user_id" text,
	"org_id" text,
	"case_id" text,
	"purpose" text NOT NULL,
	"model" text NOT NULL,
	"input_tokens" bigint DEFAULT 0 NOT NULL,
	"output_tokens" bigint DEFAULT 0 NOT NULL,
	"cache_read_tokens" bigint DEFAULT 0 NOT NULL,
	"cache_write_5m_tokens" bigint DEFAULT 0 NOT NULL,
	"cache_write_1h_tokens" bigint DEFAULT 0 NOT NULL,
	"cost_usd" numeric(14, 8),
	"latency_ms" integer,
	"ok" boolean DEFAULT true NOT NULL,
	"error_class" text,
	CONSTRAINT "llm_calls_request_id_unique" UNIQUE("request_id"),
	CONSTRAINT "llm_calls_request_id_len" CHECK (char_length("llm_calls"."request_id") <= 80)
);
--> statement-breakpoint
CREATE INDEX "email_log_at_idx" ON "email_log" USING btree ("at");--> statement-breakpoint
CREATE INDEX "llm_calls_at_idx" ON "llm_calls" USING btree ("at");--> statement-breakpoint
CREATE INDEX "llm_calls_user_at_idx" ON "llm_calls" USING btree ("user_id","at");--> statement-breakpoint
CREATE INDEX "llm_calls_case_idx" ON "llm_calls" USING btree ("case_id");