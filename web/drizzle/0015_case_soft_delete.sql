-- A user can delete a case from the case list. Soft delete: the row, its files in Blob and the audit rows stay; the case is only hidden.
-- Additive only (one nullable column, no default, so no table rewrite). Applied to production 2026-11-27 (backup branch pre-0015-backup).
ALTER TABLE "cases" ADD COLUMN IF NOT EXISTS "deleted_at" timestamptz;
