import { and, eq, inArray, isNotNull, lt, sql } from "drizzle-orm";
import { db, schema } from "@/db";

/** How long the files of a case the user deleted are kept (the user can still be helped meanwhile; owner 2026-11-27: 7 days). */
export const DELETED_KEEP_DAYS = 7;

export type PurgeResult = { cases: number; files: number; failed: number; skipped?: number };

const BUDGET_MS = 45_000; // the route may run 60 s: no new case is started after this
const PARALLEL = 5;

const bareOf = (p: string) => { try { return /^https?:\/\//.test(p) ? decodeURIComponent(new URL(p).pathname.replace(/^\//, "")) : p; } catch { return p; } };

/** Of these stored paths, the ones another case (alive or not) still points at: two cases can be made from the same uploaded URL. One query. */
async function usedElsewhere(paths: string[], caseId: string): Promise<Set<string>> {
  if (!paths.length) return new Set();
  const rows = paths.map((p) => { const b = bareOf(p); return sql`(${p}, ${b}, ${encodeURI(b)})`; });
  const r = await db.execute(sql`
    SELECT t.p FROM (VALUES ${sql.join(rows, sql`, `)}) AS t(p, b, e) WHERE
      EXISTS (SELECT 1 FROM case_files f WHERE f.case_id <> ${caseId} AND (f.blob_url IN (t.p, t.b, t.e) OR right(f.blob_url, length(t.b) + 1) = '/' || t.b OR right(f.blob_url, length(t.e) + 1) = '/' || t.e))
      OR EXISTS (SELECT 1 FROM case_photos p WHERE p.case_id <> ${caseId} AND (p.blob_path IN (t.p, t.b) OR p.thumb_path IN (t.p, t.b)))
      OR EXISTS (SELECT 1 FROM case_screenshots s WHERE s.case_id <> ${caseId} AND s.blob_pathname IN (t.p, t.b))`);
  return new Set(((r as unknown as { rows?: { p: string }[] }).rows ?? (r as unknown as { p: string }[])).map((x) => x.p));
}

/**
 * Removes the stored files of cases that were deleted more than DELETED_KEEP_DAYS ago, then forgets them: the file, photo and screenshot
 * rows go and the text read from the documents (case_data) is cleared. The case row itself and the audit rows stay (the credit ledger
 * still points at the case). Nothing is left to find for a purged case, so a second run does nothing for it.
 * `remove` deletes one stored file (a missing file counts as removed). A case with a file that cannot be removed is left whole for the next
 * run (its rows are what point at the file), and counted in `failed`.
 */
export async function purgeDeletedCases(remove: (path: string) => Promise<void>, opts: { now?: Date; limit?: number; listPrefix?: (prefix: string) => Promise<string[]> } = {}): Promise<PurgeResult> {
  const cutoff = new Date((opts.now ?? new Date()).getTime() - DELETED_KEEP_DAYS * 86_400_000);
  const c = schema.cases;
  const due = await db.select({ id: c.id, orgId: c.orgId }).from(c)
    .where(and(isNotNull(c.deletedAt), lt(c.deletedAt, cutoff), sql`(
      EXISTS (SELECT 1 FROM case_files f WHERE f.case_id = ${c.id}) OR EXISTS (SELECT 1 FROM case_photos p WHERE p.case_id = ${c.id})
      OR EXISTS (SELECT 1 FROM case_screenshots s WHERE s.case_id = ${c.id}) OR EXISTS (SELECT 1 FROM photo_uploads u WHERE u.case_id = ${c.id})
      OR EXISTS (SELECT 1 FROM case_events e WHERE e.case_id = ${c.id}) OR EXISTS (SELECT 1 FROM step2_log l WHERE l.case_id = ${c.id})
      OR EXISTS (SELECT 1 FROM photo_upload_log g WHERE g.case_id = ${c.id}) OR EXISTS (SELECT 1 FROM photo_learning n WHERE n.case_id = ${c.id})
      OR EXISTS (SELECT 1 FROM case_extras x WHERE x.case_id = ${c.id})
      OR (${c.caseData} IS NOT NULL AND ${c.caseData} <> 'null'::jsonb))
      AND NOT EXISTS (SELECT 1 FROM jobs j WHERE j.case_id = ${c.id} AND j.state = 'running')`))
    .orderBy(sql`random()`).limit(opts.limit ?? 50); // random: a case that keeps failing cannot starve the others
  const out: PurgeResult = { cases: 0, files: 0, failed: 0 };
  const t0 = Date.now();
  for (const k of due) {
    if (Date.now() - t0 > BUDGET_MS) break; // the rest is picked up by the next run
    try {
      // the rows read now are the rows deleted below (by id): a row that appears meanwhile stays for the next run, with its file
      const files = await db.select({ id: schema.caseFiles.id, p: schema.caseFiles.blobUrl }).from(schema.caseFiles).where(eq(schema.caseFiles.caseId, k.id));
      const photos = await db.select({ id: schema.casePhotos.id, p: schema.casePhotos.blobPath, t: schema.casePhotos.thumbPath }).from(schema.casePhotos).where(eq(schema.casePhotos.caseId, k.id));
      const shots = await db.select({ id: schema.caseScreenshots.id, p: schema.caseScreenshots.blobPathname }).from(schema.caseScreenshots).where(eq(schema.caseScreenshots.caseId, k.id));
      const ups = await db.select({ p: schema.photoUploads.path }).from(schema.photoUploads).where(eq(schema.photoUploads.caseId, k.id));
      const stray = opts.listPrefix ? await opts.listPrefix(`${k.orgId}/${k.id}/`) : []; // files that never got a row
      const paths = [...new Set([...stray, ...files.map((f) => f.p), ...photos.flatMap((p) => [p.p, p.t]), ...shots.map((s) => s.p), ...ups.map((u) => u.p)].filter(Boolean))];
      const used = await usedElsewhere(paths, k.id);
      const mine = paths.filter((p) => !used.has(p));
      if (paths.length > mine.length) out.skipped = (out.skipped ?? 0) + (paths.length - mine.length);
      for (let i = 0; i < mine.length; i += PARALLEL) {
        if (Date.now() - t0 > BUDGET_MS + 10_000) throw new Error("time budget used up inside a case"); // the case stays whole for the next run
        await Promise.all(mine.slice(i, i + PARALLEL).map(remove));
      }
      if (files.length) await db.delete(schema.caseFiles).where(inArray(schema.caseFiles.id, files.map((f) => f.id)));
      if (photos.length) await db.delete(schema.casePhotos).where(inArray(schema.casePhotos.id, photos.map((p) => p.id)));
      if (shots.length) await db.delete(schema.caseScreenshots).where(inArray(schema.caseScreenshots.id, shots.map((x) => x.id)));
      await db.delete(schema.photoUploads).where(eq(schema.photoUploads.caseId, k.id));
      // what else the case holds of the customer's documents: the worker's event texts, the plans, the photo upload log, the training
      // labels (their photos are gone) and the extra part names. The case row (plate, car, insurer), usage, jobs and the credit/audit rows stay.
      for (const t of ["case_events", "step2_log", "photo_upload_log", "photo_learning", "case_extras"]) await db.execute(sql`DELETE FROM ${sql.raw(t)} WHERE case_id = ${k.id}`);
      await db.update(schema.jobs).set({ state: "cancelled" }).where(and(eq(schema.jobs.caseId, k.id), inArray(schema.jobs.state, ["queued", "paused"])));
      // the case row keeps plate, car and insurer (owner's choice); the text a bad file's name or a missing-document note can carry goes
      await db.update(c).set({ caseData: null, error: null, pendingDoc: null, photosSnapshot: null }).where(and(eq(c.id, k.id), isNotNull(c.deletedAt)));
      await db.insert(schema.auditLog).values({ orgId: k.orgId, userId: null, action: "case.purge", detail: `${k.id}|${mine.length}` }); // last: a retry never writes a second row
      out.cases++; out.files += mine.length;
    } catch (e) {
      out.failed++;
      console.error("purge of a deleted case failed", k.id, e);
    }
  }
  return out;
}
