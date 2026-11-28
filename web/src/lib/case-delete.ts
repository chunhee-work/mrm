import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { refundCase } from "@/lib/payments/case-credit";

/** The condition every read of a case adds: a case the user deleted is hidden everywhere (the row, files and audit stay). */
export const notDeleted = isNull(schema.cases.deletedAt);

/**
 * Where a case may be deleted (plan #159, owner 2026-11-29: "only if there come out issue on our part"): an open case that hit a
 * problem on our side, with nothing working on it now. Our side = the read failed (`failed`; every setter is in scan-case.ts) or the
 * worker crashed on it and that step did not go on (worker/loop.py writes exactly "Worker error"; see faultedSql). Not counted: "Stopped after N tries" and "Scan failed" (also
 * written for login waits, person stops and a customer's bad file), jobs' `failed` state (also a stop meant for a person). A case made
 * in Merimen may be deleted too: only our copy is hidden, nothing is sent to Merimen. Never `done`; never while a read (`reading`) or a
 * worker job (`running`) is on it. Queued and paused jobs do not block: they are cancelled with the delete.
 */
export const FAULT_LINE = "Worker error";

/** The same rule in TypeScript, for a case whose fault line and running job are already known (tests). */
export const canDelete = (c: { status: string; faulted: boolean; running: boolean }) =>
  c.status !== "done" && c.status !== "reading" && !c.running && (c.status === "failed" || c.faulted);

/**
 * SQL: the case (`c`, an alias of cases) has an unresolved crash: a crash line whose step's newest job did not go on (it ended failed or
 * cancelled). A crash that the retry got past (the same job, or a later one of that step, is done, queued, running or paused) is not
 * counted, so a case that crashed once and then carried on normally shows no delete icon.
 */
export const faultedSql = (c = sql.raw("c")) => sql`EXISTS (SELECT 1 FROM case_events e WHERE e.case_id = ${c}.id AND e.message = ${FAULT_LINE}
  AND COALESCE((SELECT j.state FROM jobs j WHERE j.case_id = ${c}.id AND j.step = e.step ORDER BY j.id DESC LIMIT 1), 'failed') NOT IN ('done', 'queued', 'running', 'paused'))`;
/** SQL: something works on the case now: a document read, or a worker job. */
export const busySql = (c = sql.raw("c")) => sql`(${c}.status = 'reading' OR EXISTS (SELECT 1 FROM jobs j WHERE j.case_id = ${c}.id AND j.state = 'running'))`;
/** SQL: the whole rule, one boolean per case, used by the list (no join, so no duplicate rows) and by deleteCase. */
export const canDeleteSql = (c = sql.raw("c")) => sql`(${c}.status <> 'done' AND NOT ${busySql(c)} AND (${c}.status = 'failed' OR ${faultedSql(c)}))`;

export type DeleteResult = { ok: true; refunded: boolean } | { ok: false; reason: "not_found" | "busy" | "not_allowed" };

/**
 * Soft delete, one statement for the decision: the rule above (status, our failure lines, no active job) is checked inside one UPDATE
 * that locks the case row, so a status change in between cannot slip past it and the refund rule below uses the status the UPDATE
 * really matched. (The worker's claim locks the case row too (FOR NO KEY UPDATE OF j, c SKIP LOCKED), so a claim skips a case this
 * UPDATE holds; a claim or an enqueue that commits first can be missed by the UPDATE's snapshot (accepted, as before): queued and
 * paused jobs are cancelled right after, and a job that still runs on a hidden case has its write-backs skipped by the worker.)
 * 0 rows: a re-read says why (missing / deleted or another organisation's, something working on it, or no problem of ours).
 * An unread case's credit is given back once (refundCase counts debits against refunds).
 */
export async function deleteCase(orgId: string, userId: string, caseId: string): Promise<DeleteResult> {
  const res = await db.execute(sql`UPDATE cases c SET deleted_at = now()
    FROM (SELECT id, status, (case_data IS NOT NULL) AS was_read FROM cases WHERE id = ${caseId} AND org_id = ${orgId} FOR UPDATE) o
    WHERE c.id = o.id AND c.deleted_at IS NULL AND ${canDeleteSql(sql.raw("c"))}
    RETURNING o.status AS was, o.was_read AS was_read`);
  const hit = (Array.isArray(res) ? res : (res as { rows?: unknown[] }).rows ?? []) as { was: string; was_read: boolean }[];
  const was = hit[0]?.was;
  if (!was) {
    const why = await db.execute(sql`SELECT ${busySql(sql.raw("c"))} AS active FROM cases c WHERE c.id = ${caseId} AND c.org_id = ${orgId} AND c.deleted_at IS NULL`);
    const row = ((Array.isArray(why) ? why : (why as { rows?: unknown[] }).rows ?? []) as { active: boolean }[])[0];
    return { ok: false, reason: !row ? "not_found" : row.active ? "busy" : "not_allowed" };
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
