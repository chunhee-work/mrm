import { and, eq, inArray, lt } from "drizzle-orm";
import { del, list } from "@vercel/blob";
import { db, schema } from "@/db";
import { LOCK_MS } from "@/lib/split-marks";

/**
 * U7: files a zip split stored for a car whose case was then never made (the call was killed by its time limit, or a rollback
 * could not delete them) would stay in the store for ever: the next try makes new case ids, so nothing points at them.
 * A split therefore notes the case ids it is about to store files for (`case.split.try` in the audit log, removed when the
 * call ends cleanly), and a later split of the same organisation removes what such a note still points at.
 */
const audit = schema.auditLog;
const TRY = "case.split.try";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Notes the case ids a split will store files under (`<org>/<case id>/…`). Returns the function that removes the note. */
export async function noteSplitTry(orgId: string, userId: string, ids: string[]): Promise<() => Promise<void>> {
  const [mine] = await db.insert(audit).values({ orgId, userId, action: TRY, detail: ids.join(",") }).returning({ id: audit.id });
  return async () => { await db.delete(audit).where(eq(audit.id, mine.id)).catch((x) => console.error("split: removing the try note failed", x)); };
}

/**
 * Deletes the stored files of cars that were never made. Only notes older than LOCK_MS count: a split runs at most 300 s, so the
 * call that wrote such a note is over and a batch it sent has long been committed or not. A case that exists (also one the user
 * deleted) keeps its files. It runs inside a split's own 300 s, so it stops after `budgetMs`; a note it did not finish stays
 * for the next split. Returns how many files were removed.
 */
export async function sweepSplitLeftovers(orgId: string, budgetMs = 15_000): Promise<number> {
  const until = Date.now() + budgetMs;
  const notes = await db.select({ id: audit.id, detail: audit.detail }).from(audit)
    .where(and(eq(audit.orgId, orgId), eq(audit.action, TRY), lt(audit.at, new Date(Date.now() - LOCK_MS)))).limit(20);
  let removed = 0;
  for (const n of notes) {
    if (Date.now() > until) break;
    const ids = (n.detail ?? "").split(",").filter((x) => UUID.test(x));
    const made = ids.length ? new Set((await db.select({ id: schema.cases.id }).from(schema.cases).where(inArray(schema.cases.id, ids))).map((c) => c.id)) : new Set<string>();
    let finished = true;
    for (const id of ids.filter((x) => !made.has(x))) {
      if (Date.now() > until) { finished = false; break; }
      let cursor: string | undefined;
      do {
        const page = await list({ prefix: `${orgId}/${id}/`, cursor, limit: 1000 });
        if (page.blobs.length) { await del(page.blobs.map((b) => b.url)); removed += page.blobs.length; }
        cursor = page.hasMore ? page.cursor : undefined;
      } while (cursor);
    }
    if (finished) await db.delete(audit).where(eq(audit.id, n.id)); // only after its files are gone: a failure above keeps the note for the next try
  }
  return removed;
}
