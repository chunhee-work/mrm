-- A user can remove a line from a case's Activity list (plan #148). Hide only: the row stays, every backend reader (worker,
-- scan-case de-dupe and read-try count) keeps reading it; only the Activity list on the case page and the first page skips it.
-- Additive only (two nullable columns, no default, so no table rewrite). hidden_by = users.id.
ALTER TABLE "case_events" ADD COLUMN IF NOT EXISTS "hidden_at" timestamptz;
--> statement-breakpoint
ALTER TABLE "case_events" ADD COLUMN IF NOT EXISTS "hidden_by" text;
