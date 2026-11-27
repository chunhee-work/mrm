import { and, eq, isNotNull, lt, sql } from "drizzle-orm";
import { db, schema } from "@/db";

/** How long the files of a case the user deleted are kept (the user can still be helped meanwhile; owner 2026-11-27: 7 days). */
export const DELETED_KEEP_DAYS = 7;

export type PurgeResult = { cases: number; files: number; failed: number };

/**
 * Removes the stored files of cases that were deleted more than DELETED_KEEP_DAYS ago, then forgets them: the file, photo and screenshot
 * rows go and the text read from the documents (case_data) is cleared. The case row itself and the audit rows stay (the credit ledger
 * still points at the case). Nothing is left to find for a purged case, so a second run does nothing for it.
 * `remove` deletes one stored file (a missing file counts as removed). A case with a file that cannot be removed is left whole for the next
 * run (its rows are what point at the file), and counted in `failed`.
 */
export async function purgeDeletedCases(remove: (path: string) => Promise<void>, opts: { now?: Date; limit?: number } = {}): Promise<PurgeResult> {
  const cutoff = new Date((opts.now ?? new Date()).getTime() - DELETED_KEEP_DAYS * 86_400_000);
  const c = schema.cases;
  const due = await db.select({ id: c.id, orgId: c.orgId }).from(c)
    .where(and(isNotNull(c.deletedAt), lt(c.deletedAt, cutoff), sql`(
      EXISTS (SELECT 1 FROM case_files f WHERE f.case_id = ${c.id}) OR EXISTS (SELECT 1 FROM case_photos p WHERE p.case_id = ${c.id})
      OR EXISTS (SELECT 1 FROM case_screenshots s WHERE s.case_id = ${c.id}) OR ${c.caseData} IS NOT NULL)`))
    .orderBy(c.deletedAt).limit(opts.limit ?? 20);
  const out: PurgeResult = { cases: 0, files: 0, failed: 0 };
  for (const k of due) {
    try {
      const files = await db.select({ p: schema.caseFiles.blobUrl }).from(schema.caseFiles).where(eq(schema.caseFiles.caseId, k.id));
      const photos = await db.select({ p: schema.casePhotos.blobPath, t: schema.casePhotos.thumbPath }).from(schema.casePhotos).where(eq(schema.casePhotos.caseId, k.id));
      const shots = await db.select({ p: schema.caseScreenshots.blobPathname }).from(schema.caseScreenshots).where(eq(schema.caseScreenshots.caseId, k.id));
      const paths = [...new Set([...files.map((f) => f.p), ...photos.flatMap((p) => [p.p, p.t]), ...shots.map((s) => s.p)].filter(Boolean))];
      for (const p of paths) await remove(p);
      await db.delete(schema.caseFiles).where(eq(schema.caseFiles.caseId, k.id));
      await db.delete(schema.casePhotos).where(eq(schema.casePhotos.caseId, k.id));
      await db.delete(schema.caseScreenshots).where(eq(schema.caseScreenshots.caseId, k.id));
      await db.update(c).set({ caseData: null }).where(and(eq(c.id, k.id), isNotNull(c.deletedAt)));
      await db.insert(schema.auditLog).values({ orgId: k.orgId, userId: null, action: "case.purge", detail: `${k.id}|${paths.length}` });
      out.cases++; out.files += paths.length;
    } catch (e) {
      out.failed++;
      console.error("purge of a deleted case failed", k.id, e);
    }
  }
  return out;
}
