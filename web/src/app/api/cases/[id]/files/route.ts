import { NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { badFileRows } from "@/lib/drop-bad-files";
import { db, schema } from "@/db";
import { getUserOrNull } from "@/lib/session";
import { CaseBody, bodyProblem } from "@/lib/case-body";
import { userFixable, zipRefunded } from "@/lib/case-text";
import { debitRetry, refundCase } from "@/lib/payments/case-credit";
import { notDeleted } from "@/lib/case-delete";
import { errLine, writeTogether, type Batch } from "@/lib/db-batch";

// The same file rules as a new case (names, kinds, sizes, at least one file, and every URL https on our file store under the
// organisation's own folder: bodyProblem). "Read again" is /scan, not an empty list here: an empty list would put a failed
// case back in the queue without paying for the read.
const Body = CaseBody.pick({ files: true });

const rowsOf = (res: unknown): unknown[] => { const r = res as { rows?: unknown[] } | unknown[]; return Array.isArray(r) ? r : (r.rows ?? []); };

// POST /api/cases/:id/files — add the missing document(s) to a case that stopped, and put it back in the queue.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await getUserOrNull();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const [c] = await db.select().from(schema.cases).where(and(eq(schema.cases.id, id), eq(schema.cases.orgId, me.orgId), notDeleted)).limit(1);
  if (!c) return NextResponse.json({ error: "not found" }, { status: 404 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const { files } = parsed.data;
  // the case already holds its documents, so a set of photos alone is fine here ("no_docs" is for a new case)
  const problem = bodyProblem({ files }, me.orgId);
  if (problem && problem !== "no_docs") return NextResponse.json({ error: problem }, { status: 400 });
  // Only a case that waits for the user's files takes more: a missing document, or a failure the user fixes with other files.
  // A failure on our side was refunded and is read again from the case page, not re-queued here for free.
  // The status (and the error) is checked again in the write itself, so two requests at once cannot queue the case twice.
  const waiting = c.status === "pending_doc" || (c.status === "failed" && userFixable(c.error));
  if (!waiting) return NextResponse.json({ error: "not waiting" }, { status: 409 });
  // A zip of several cars (or of cars at different levels) that reached the one-case path got its credit back (scan-case),
  // so a read with new files takes one again.
  const refunded = c.status === "failed" && zipRefunded(c.error, c.caseData != null);
  const paid = refunded ? await debitRetry(me.orgId, id) : "free";
  if (paid === false) return NextResponse.json({ error: "no_credits" }, { status: 402 });
  const giveBack = () => (paid === "charged" ? refundCase(me.orgId, id, "add_files").catch(() => false) : Promise.resolve(false));
  // U12: one statement moves the case to "uploaded", takes out the file(s) the last read could not open and adds the new ones.
  // So the case is never "uploaded" without its new files (a reader could start on it), and a failure leaves it just as it was.
  // The status (and the error) the case had is checked inside the statement: a second request, or a delete in another tab,
  // between the read above and this write finds nothing to move and changes nothing.
  // R2-B02: "Replace files" must replace. Without taking the bad file out, the same file failed every read.
  const bad = await badFileRows(id, c.status, c.error).catch(() => [] as number[]);
  const waitingStill = c.status === "failed" ? sql`status = 'failed' AND error = ${c.error}` : sql`status = 'pending_doc'`;
  const gone = bad.length ? sql`, gone AS (DELETE FROM case_files WHERE case_id = ${id} AND id IN (${sql.join(bad.map((x) => sql`${x}`), sql`, `)}) AND EXISTS (SELECT 1 FROM moved))` : sql``;
  const added = sql.join(files.map((f) => sql`(${f.kind}, ${f.url}, ${f.name}, ${f.size}::bigint)`), sql`, `);
  let moved: unknown[];
  try {
    moved = rowsOf(await db.execute(sql`
      WITH moved AS (
        UPDATE cases SET status = 'uploaded', pending_doc = NULL, error = NULL
        WHERE id = ${id} AND deleted_at IS NULL AND ${waitingStill} RETURNING id)${gone}
      INSERT INTO case_files (case_id, kind, blob_url, original_name, size)
      SELECT moved.id, v.kind, v.url, v.name, v.size FROM moved CROSS JOIN (VALUES ${added}) AS v(kind, url, name, size)
      RETURNING id`));
  } catch (e) {
    await giveBack(); // nothing was written: the case is as it was
    throw e;
  }
  if (!moved.length) { await giveBack(); return NextResponse.json({ error: "not waiting" }, { status: 409 }); }

  // The case now waits to be read with its new files. These rows are the worker's queue entry and the activity line: a failure
  // here is logged, never undone and never shown as "not saved" (the case page starts a waiting case by itself).
  await writeTogether([
    db.insert(schema.jobs).values({ caseId: id, step: "intake", state: "queued" }),
    db.insert(schema.caseEvents).values({ caseId: id, step: "upload", message: `Received ${files.length} more file(s)` }),
    db.insert(schema.auditLog).values({ orgId: me.orgId, userId: me.user.id, action: "case.add_files", detail: id }),
  ] as Batch).catch((e) => console.error("add files: queue and activity rows failed", id, errLine(e)));
  return NextResponse.json({ ok: true });
}
