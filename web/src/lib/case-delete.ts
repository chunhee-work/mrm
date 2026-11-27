import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { refundCase } from "@/lib/payments/case-credit";

/** The condition every read of a case adds: a case the user deleted is hidden everywhere (the row, files and audit stay). */
export const notDeleted = isNull(schema.cases.deletedAt);

/**
 * Where a case may be deleted: before the worker has it. `reading` is a read in progress (it would write back into the case),
 * `phase_a`..`checking` means the worker is in Merimen (or the case is already made there), `done` was sent to Merimen.
 */
export const DELETABLE = ["uploaded", "naming", "pending_doc", "failed"] as const;
export const canDelete = (c: { status: string; merimenCaseId?: string | null }) => (DELETABLE as readonly string[]).includes(c.status) && !c.merimenCaseId;

export type DeleteResult = { ok: true; refunded: boolean } | { ok: false; reason: "not_found" | "busy" };

/**
 * Soft delete, one statement for the decision: the old status, "never sent to Merimen" and "no running job" are checked inside one
 * UPDATE that locks the case row, so a read or a status change in between cannot slip past it and the refund rule below uses the status
 * the UPDATE really matched. (The worker's claim locks the case row too (FOR UPDATE OF j, c SKIP LOCKED), so a claim skips a case this UPDATE holds; but if a claim commits first, the UPDATE's running-job check reads its own snapshot and can still miss it: the job then runs on a hidden case, whose write-backs the worker skips, and later claims skip it.) Then queued jobs are cancelled and an unread case's credit is
 * given back once (refundCase counts debits against refunds).
 */
export async function deleteCase(orgId: string, userId: string, caseId: string): Promise<DeleteResult> {
  const res = await db.execute(sql`UPDATE cases c SET deleted_at = now()
    FROM (SELECT id, status, (case_data IS NOT NULL) AS was_read FROM cases WHERE id = ${caseId} AND org_id = ${orgId} FOR UPDATE) o
    WHERE c.id = o.id AND c.deleted_at IS NULL AND o.status IN (${sql.join(DELETABLE.map((d) => sql`${d}`), sql`, `)}) AND c.merimen_caseid IS NULL
      AND NOT EXISTS (SELECT 1 FROM jobs j WHERE j.case_id = c.id AND j.state = 'running')
    RETURNING o.status AS was, o.was_read AS was_read`);
  const hit = (Array.isArray(res) ? res : (res as { rows?: unknown[] }).rows ?? []) as { was: string; was_read: boolean }[];
  const was = hit[0]?.was;
  if (!was) {
    const [c] = await db.select({ id: schema.cases.id }).from(schema.cases).where(and(eq(schema.cases.id, caseId), eq(schema.cases.orgId, orgId), notDeleted)).limit(1);
    return { ok: false, reason: c ? "busy" : "not_found" };
  }
  await db.update(schema.jobs).set({ state: "cancelled" }).where(and(eq(schema.jobs.caseId, caseId), inArray(schema.jobs.state, ["queued", "paused"]))).catch((e) => console.error("cancel jobs after delete failed", caseId, e));
  await db.insert(schema.auditLog).values({ orgId, userId, action: "case.delete", detail: caseId }).catch((e) => console.error("audit row for delete failed", caseId, e));
  // Only a case whose documents were never read gets its credit back: a read costs us money, and a bad file is the customer's to replace,
  // so delete must not become a free way to get a read. (A failure on our side was already refunded when it happened.)
  // (`uploaded` can also be a case that was read and then got more files, so the saved read must be absent too.)
  if (was !== "uploaded" || hit[0].was_read) return { ok: true, refunded: false };
  const refunded = await refundCase(orgId, caseId, "deleted").catch((e) => { console.error("refund after delete failed", caseId, e); return false; }); // logged: the owner can give it back by hand
  return { ok: true, refunded };
}
