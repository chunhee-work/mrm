/**
 * R2-B12: one-off, safe-to-repeat clean-up of data made before PR #49 (the owner runs it; nothing runs it by itself).
 *   DATABASE_URL=… BLOB_READ_WRITE_TOKEN=… npx tsx --conditions=react-server scripts/backfill-qc.ts            (dry run: only counts)
 *   DATABASE_URL=… BLOB_READ_WRITE_TOKEN=… npx tsx --conditions=react-server scripts/backfill-qc.ts --apply    (does it)
 * 1. Photos that were uploaded with a case but never reached the photo desk are put on the desk (importCasePhotos skips what is there).
 * 2. `intake` jobs still queued for a case that has already been read are closed, so the worker never reads it a second time.
 * Writes nothing else. It does not touch Merimen and does not change any case status.
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "../src/db";
import { importCasePhotos } from "../src/lib/photos/import-files";

async function main() {
  const apply = process.argv.includes("--apply");
  const cases = await db.select({ id: schema.cases.id, orgId: schema.cases.orgId }).from(schema.cases)
    .where(sql`exists (select 1 from case_files f where f.case_id = ${schema.cases.id} and f.kind = 'photo')`);
  let photos = 0, caseCount = 0;
  for (const c of cases) {
    const [have] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.casePhotos).where(eq(schema.casePhotos.caseId, c.id));
    const [files] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.caseFiles).where(and(eq(schema.caseFiles.caseId, c.id), eq(schema.caseFiles.kind, "photo")));
    if (Number(have.n) >= Number(files.n)) continue;
    caseCount++;
    if (apply) photos += (await importCasePhotos(c.id, c.orgId)).added; else photos += Number(files.n) - Number(have.n);
  }
  const stale = db.select({ id: schema.cases.id }).from(schema.cases).where(inArray(schema.cases.status, ["uploaded", "reading"]));
  const queued = and(eq(schema.jobs.step, "intake"), eq(schema.jobs.state, "queued"), sql`${schema.jobs.caseId} not in (${stale})`);
  const [jobs] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.jobs).where(queued);
  if (apply) await db.update(schema.jobs).set({ state: "done" }).where(queued);
  console.log(`${apply ? "done" : "dry run"}: ${photos} photo(s) ${apply ? "added" : "would be added"} on ${caseCount} case(s); ${jobs.n} stale intake job(s) ${apply ? "closed" : "would be closed"}`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
