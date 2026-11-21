-- B03: one debit per case, even when two requests race. Idempotent; NOT applied to production by this PR.
CREATE UNIQUE INDEX IF NOT EXISTS credits_ledger_case_once ON credits_ledger (reason) WHERE reason LIKE 'case:%';
