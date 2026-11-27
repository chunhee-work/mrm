-- A user can delete a case from the case list. Soft delete: the row, its files in Blob and the audit rows stay; the case is only hidden.
-- Additive only (one nullable column, no default, so no table rewrite). NOT applied to production until the owner approves.
ALTER TABLE "cases" ADD COLUMN IF NOT EXISTS "deleted_at" timestamptz;
