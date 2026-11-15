CREATE TABLE "payment_orders" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"user_id" text,
	"provider" text NOT NULL,
	"checkout_ref" text,
	"provider_ref" text,
	"pack_id" text NOT NULL,
	"pack_title" text NOT NULL,
	"pack_version" integer NOT NULL,
	"credits" integer NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"test_mode" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"paid_at" timestamp,
	CONSTRAINT "payment_orders_status_chk" CHECK ("payment_orders"."status" IN ('pending','paid','failed','refunded'))
);
--> statement-breakpoint
ALTER TABLE "payment_orders" ADD CONSTRAINT "payment_orders_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_orders" ADD CONSTRAINT "payment_orders_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payment_orders_org_idx" ON "payment_orders" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_orders_provider_ref_uq" ON "payment_orders" USING btree ("provider","provider_ref") WHERE "payment_orders"."provider_ref" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "credits_ledger_order_reason_uq" ON "credits_ledger" USING btree ("reason") WHERE "credits_ledger"."reason" LIKE 'purchase:%' OR "credits_ledger"."reason" LIKE 'refund:%';