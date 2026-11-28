-- Plan #159 review (Codex on PR #169): two refunds of one case at the same moment (a failed read and a delete) could both pass
-- refundCase's count check. Each refund now carries its number for that case (":#1", ":#2" ...), and this index lets only one
-- row per case and number in. Additive; older refund rows have no number and are not covered.
CREATE UNIQUE INDEX IF NOT EXISTS credits_ledger_case_refund_once ON credits_ledger (case_id, (substring(reason from ':#([0-9]+)$')))
  WHERE reason LIKE 'case-refund:%:#%';
--> statement-breakpoint
-- The case list checks the delete rule for each shown case (case-delete.ts canDeleteSql): look up a case's events and jobs by index.
CREATE INDEX IF NOT EXISTS case_events_case_id_idx ON case_events (case_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS jobs_case_id_idx ON jobs (case_id);
