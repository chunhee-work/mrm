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
 * Soft delete, one statement for the decision: the status and "never sent to Merimen" are checked inside the UPDATE, so a worker
 * that has just taken the case cannot race it. Then queued jobs are cancelled (the worker skips them) and the credit is given
 * back once, for a case still unread (refundCase counts debits against refunds).
 */
export async function deleteCase(orgId: string, userId: string, caseId: string): Promise<DeleteResult> {
  const [was] = await db.select({ status: schema.cases.status }).from(schema.cases).where(and(eq(schema.cases.id, caseId), eq(schema.cases.orgId, orgId))).limit(1);
  const hit = await db.update(schema.cases).set({ deletedAt: new Date() })
    .where(and(eq(schema.cases.id, caseId), eq(schema.cases.orgId, orgId), notDeleted, inArray(schema.cases.status, [...DELETABLE]), isNull(schema.cases.merimenCaseId),
      // a job the worker has already claimed is running on this case: not now
      sql`NOT EXISTS (SELECT 1 FROM jobs j WHERE j.case_id = ${schema.cases.id} AND j.state = 'running')`))
    .returning({ id: schema.cases.id });
  if (!hit.length) {
    const [c] = await db.select({ id: schema.cases.id }).from(schema.cases).where(and(eq(schema.cases.id, caseId), eq(schema.cases.orgId, orgId), notDeleted)).limit(1);
    return { ok: false, reason: c ? "busy" : "not_found" };
  }
  await db.update(schema.jobs).set({ state: "cancelled" }).where(and(eq(schema.jobs.caseId, caseId), inArray(schema.jobs.state, ["queued", "paused"]))).catch(() => {});
  await db.insert(schema.auditLog).values({ orgId, userId, action: "case.delete", detail: caseId }).catch(() => {});
  // Only a case whose documents were never read gets its credit back: a read costs us money, and a bad file is the customer's to replace,
  // so delete must not become a free way to get a read. (A failure on our side was already refunded when it happened.)
  if (was?.status !== "uploaded") return { ok: true, refunded: false };
  const refunded = await refundCase(orgId, caseId, "deleted").catch((e) => { console.error("refund after delete failed", caseId, e); return false; }); // logged: the owner can give it back by hand
  return { ok: true, refunded };
}
