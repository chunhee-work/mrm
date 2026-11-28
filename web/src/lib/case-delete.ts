import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { refundCase } from "@/lib/payments/case-credit";
import { userFixable, zipRefunded } from "@/lib/case-text";

/** The condition every read of a case adds: a case the user deleted is hidden everywhere (the row, files and audit stay). */
export const notDeleted = isNull(schema.cases.deletedAt);

/**
 * Where a case may be deleted (plan #159, owner 2026-11-29: "only if there come out issue on our part"): an open case that hit a
 * problem on our side, with nothing working on it now. Our side = the read failed (`failed`: set by scan-case.ts, and by the worker when case details are missing) or the
 * worker crashed on it and that step did not go on ("Worker error"; see faultedSql), minus a customer's own bad file (customerFile).
 * Not counted: "Stopped after N tries" and "Scan failed" (also written for login waits, person stops and a customer's bad file),
 * jobs' `failed` state (also a stop meant for a person). A case made
 * in Merimen may be deleted too: only our copy is hidden, nothing is sent to Merimen. Never `done`; never while a read (`reading`) or a
 * worker job (`running`) is on it. Queued and paused jobs do not block: they are cancelled with the delete.
 */
export const FAULT_LINE = "Worker error"; // = WORKER_ERROR in worker/autopilot_worker/jobs.py (loop.py crash, lease give-up); both sides pin it in a test

/**
 * SQL: the case (`c`, an alias of cases) has an unresolved crash. A crash line belongs to the newest job of its step made at or before
 * the line (the job that was running; jobs.id is serial). It is resolved when that job or a later one of the same step went on
 * (done, queued, running or paused), so a case that crashed once and then carried on normally shows no delete icon, and a later
 * unrelated stop of that step (a person stop, a cancel) does not bring an old, mended crash back.
 */
export const faultedSql = (c = sql.raw("c")) => sql`EXISTS (SELECT 1 FROM case_events e WHERE e.case_id = ${c}.id AND e.message = ${FAULT_LINE}
  AND NOT EXISTS (SELECT 1 FROM jobs j WHERE j.case_id = ${c}.id AND j.step = e.step AND j.state IN ('done', 'queued', 'running', 'paused')
    AND j.id >= COALESCE((SELECT max(k.id) FROM jobs k WHERE k.case_id = ${c}.id AND k.step = e.step AND k.created_at <= e.at), 0)))`;
/** SQL: something works on the case now: a document read, or a worker job. */
export const busySql = (c = sql.raw("c")) => sql`(${c}.status = 'reading' OR EXISTS (SELECT 1 FROM jobs j WHERE j.case_id = ${c}.id AND j.state = 'running'))`;
/** SQL: the whole rule, one boolean per case, used by the list (no join, so no duplicate rows) and by deleteCase. */
export const canDeleteSql = (c = sql.raw("c")) => sql`(${c}.status <> 'done' AND NOT ${busySql(c)} AND (${c}.status = 'failed' OR ${faultedSql(c)}))`;

/**
 * A `failed` read the customer can fix by sending other files (a bad or empty PDF, a zip the reader refuses): not our side, so no
 * delete; the case page offers "Replace files". The same for a worker stop that waits for case details (pipeline.py run_phase:
 * error "missing <what>"): a person fills them in, nothing of ours broke. A zip with several cars is ours (its credit goes back), and so is any case that also
 * has an unresolved crash. The error texts are matched in TypeScript (case-text.ts), the same helpers the case page uses.
 */
export const customerFile = (r: { status: string; error: string | null; wasRead: boolean; faulted: boolean }) =>
  r.status === "failed" && !r.faulted && ((userFixable(r.error) && !zipRefunded(r.error, r.wasRead)) || r.error?.startsWith("missing ") === true);

/** SQL columns the list and deleteCase read for one case: the rule plus what customerFile needs. */
const flagCols = (c = sql.raw("c")) => sql`${canDeleteSql(c)} AS ok, ${faultedSql(c)} AS faulted, ${c}.status AS status, ${c}.error AS error, (${c}.case_data IS NOT NULL) AS was_read`;
type FlagRow = { id: string; ok: boolean; faulted: boolean; status: string; error: string | null; was_read: boolean };
const rowsOf = <T,>(r: unknown) => (Array.isArray(r) ? r : (r as { rows?: unknown[] }).rows ?? []) as T[];
const allowed = (x: FlagRow) => x.ok && !customerFile({ status: x.status, error: x.error, wasRead: x.was_read, faulted: x.faulted });

/** The delete flag of each case id (the list): the SQL rule, minus a customer's own bad file. */
export async function deletableIds(ids: string[]): Promise<Set<string>> {
  if (!ids.length) return new Set();
  const r = await db.execute(sql`SELECT c.id, ${flagCols()} FROM cases c WHERE c.id IN (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})`);
  return new Set(rowsOf<FlagRow>(r).filter(allowed).map((x) => x.id));
}

/**
 * Cases where the worker pressed Create in Merimen but no Merimen case id came back yet (store.py writes `create_submitted`, then
 * `create_cleared` when Merimen made nothing). A Merimen case may exist, so the delete pop-up warns as for a case with an id.
 */
export async function createPendingIds(ids: string[]): Promise<Set<string>> {
  if (!ids.length) return new Set();
  const r = await db.execute(sql`SELECT DISTINCT s.case_id AS id FROM case_events s WHERE s.step = 'create_submitted'
    AND s.case_id IN (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})
    AND NOT EXISTS (SELECT 1 FROM case_events x WHERE x.case_id = s.case_id AND x.step = 'create_cleared' AND x.id > s.id)`);
  return new Set(rowsOf<{ id: string }>(r).map((x) => x.id));
}

export type DeleteResult = { ok: true; refunded: boolean } | { ok: false; reason: "not_found" | "busy" | "not_allowed" };

/**
 * Soft delete, one statement for the decision: the rule above (status, our failure lines, no active job) is checked inside one UPDATE
 * that locks the case row, so a status change in between cannot slip past it. (The worker's claim locks the case row too (FOR NO KEY UPDATE OF j, c SKIP LOCKED), so a claim skips a case this
 * UPDATE holds; a claim that commits while the UPDATE waits is caught by the undo below; queued and paused jobs are cancelled after.)
 * 0 rows: a re-read says why (missing / deleted or another organisation's, something working on it, or no problem of ours).
 * The case's credit is given back once (refundCase counts debits against refunds).
 */
export async function deleteCase(orgId: string, userId: string, caseId: string): Promise<DeleteResult> {
  // A customer's bad file is checked first (its error texts are matched in TypeScript); the UPDATE then only goes through while the
  // status, error and the crash answer are still the ones checked, so a change in between cannot slip past it.
  const pre = rowsOf<FlagRow>(await db.execute(sql`SELECT c.id, ${flagCols()} FROM cases c WHERE c.id = ${caseId} AND c.org_id = ${orgId} AND c.deleted_at IS NULL`))[0];
  if (pre?.ok && !allowed(pre)) return { ok: false, reason: "not_allowed" };
  const res = await db.execute(sql`UPDATE cases c SET deleted_at = now()
    FROM (SELECT id, status, (case_data IS NOT NULL) AS was_read FROM cases WHERE id = ${caseId} AND org_id = ${orgId} FOR UPDATE) o
    WHERE c.id = o.id AND c.deleted_at IS NULL AND ${canDeleteSql(sql.raw("c"))} AND c.status = ${pre?.status ?? ""} AND c.error IS NOT DISTINCT FROM ${pre?.error ?? null} AND ${faultedSql(sql.raw("c"))} = ${pre?.faulted ?? false}
    RETURNING o.status AS was, o.was_read AS was_read`);
  const hit = rowsOf<{ was: string; was_read: boolean }>(res);
  const was = hit[0]?.was;
  if (!was) {
    const why = await db.execute(sql`SELECT ${busySql(sql.raw("c"))} AS active FROM cases c WHERE c.id = ${caseId} AND c.org_id = ${orgId} AND c.deleted_at IS NULL`);
    const row = ((Array.isArray(why) ? why : (why as { rows?: unknown[] }).rows ?? []) as { active: boolean }[])[0];
    return { ok: false, reason: !row ? "not_found" : row.active ? "busy" : "not_allowed" };
  }
  // A worker claim that held the case row when the UPDATE started commits first; the UPDATE then waits for it, but its job check
  // still reads the old snapshot and misses the job now running (review of plan #159). A new statement sees it: undo and say busy.
  // (A claim that starts after this point skips the case: it rechecks deleted_at on the row it locks.)
  const back = await db.execute(sql`UPDATE cases c SET deleted_at = NULL WHERE c.id = ${caseId} AND c.org_id = ${orgId} AND c.deleted_at IS NOT NULL
    AND EXISTS (SELECT 1 FROM jobs j WHERE j.case_id = c.id AND j.state = 'running') RETURNING c.id`);
  if (((Array.isArray(back) ? back : (back as { rows?: unknown[] }).rows ?? []) as unknown[]).length) return { ok: false, reason: "busy" };
  await db.update(schema.jobs).set({ state: "cancelled" }).where(and(eq(schema.jobs.caseId, caseId), inArray(schema.jobs.state, ["queued", "paused"]))).catch((e) => console.error("cancel jobs after delete failed", caseId, e));
  await db.insert(schema.auditLog).values({ orgId, userId, action: "case.delete", detail: caseId }).catch((e) => console.error("audit row for delete failed", caseId, e));
  // Owner 2026-11-28: every case deleted here broke on our side, so its credit goes back (Merimen cases too). refundCase gives back
  // only a debit not yet refunded, so a read that was already refunded when it failed, or a case never charged, gets nothing.
  const refunded = await refundCase(orgId, caseId, "deleted").catch((e) => { console.error("refund after delete failed", caseId, e); return false; }); // logged: the owner can give it back by hand
  return { ok: true, refunded };
}
