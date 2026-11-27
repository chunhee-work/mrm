import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { dropBadFiles } from "@/lib/drop-bad-files";
import { db, schema } from "@/db";
import { getUserOrNull } from "@/lib/session";
import { CaseBody, bodyProblem } from "@/lib/case-body";
import { userFixable, zipRefunded } from "@/lib/case-text";
import { debitRetry, refundCase } from "@/lib/payments/case-credit";

// The same file rules as a new case (names, kinds, sizes, at least one file). "Read again" is /scan, not an empty list here:
// an empty list would put a failed case back in the queue without paying for the read.
const Body = CaseBody.pick({ files: true });

/** A blob of the caller's own organisation: https, on the blob store, and stored under `<orgId>/…` (the upload route only signs such paths). */
function ownBlob(url: string, orgId: string) {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && u.hostname.endsWith(".blob.vercel-storage.com") && u.pathname.startsWith(`/${orgId}/`);
  } catch {
    return false;
  }
}

// POST /api/cases/:id/files — add the missing document(s) to a case that stopped, and put it back in the queue.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await getUserOrNull();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const [c] = await db.select().from(schema.cases).where(and(eq(schema.cases.id, id), eq(schema.cases.orgId, me.orgId))).limit(1);
  if (!c) return NextResponse.json({ error: "not found" }, { status: 404 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const { files } = parsed.data;
  if (!files.every((f) => ownBlob(f.url, me.orgId))) return NextResponse.json({ error: "invalid" }, { status: 400 });
  // the case already holds its documents, so a set of photos alone is fine here ("no_docs" is for a new case)
  const problem = bodyProblem({ files }, me.orgId);
  if (problem && problem !== "no_docs") return NextResponse.json({ error: problem }, { status: 400 });
  // Only a case that waits for the user's files takes more: a missing document, or a failure the user fixes with other files.
  // A failure on our side was refunded and is read again from the case page, not re-queued here for free.
  // The status (and the error) is checked again in the update itself, so two requests at once cannot queue the case twice.
  const waiting = c.status === "pending_doc" || (c.status === "failed" && userFixable(c.error));
  if (!waiting) return NextResponse.json({ error: "not waiting" }, { status: 409 });
  // A zip of several cars (or of cars at different levels) that reached the one-case path got its credit back (scan-case),
  // so a read with new files takes one again.
  const refunded = c.status === "failed" && zipRefunded(c.error, c.caseData != null);
  const paid = refunded ? await debitRetry(me.orgId, id) : "free";
  if (paid === false) return NextResponse.json({ error: "no_credits" }, { status: 402 });
  const giveBack = () => (paid === "charged" ? refundCase(me.orgId, id, "add_files").catch(() => false) : Promise.resolve(false));
  const still = c.status === "failed" ? and(eq(schema.cases.status, "failed"), eq(schema.cases.error, c.error ?? "")) : eq(schema.cases.status, "pending_doc");
  const moved = await db.update(schema.cases).set({ status: "uploaded", pendingDoc: null, error: null })
    .where(and(eq(schema.cases.id, id), still)).returning({ id: schema.cases.id });
  if (!moved.length) { await giveBack(); return NextResponse.json({ error: "not waiting" }, { status: 409 }); }

  // R2-B02: "Replace files" must replace. The file the last read could not open is taken out of the case (the blob stays), so the
  // new read starts from the good files plus what was just sent. Without this the same bad file failed every read.
  await dropBadFiles(id, c.status, c.error).catch(() => {});

  // The driver in production has no transactions, so if any insert fails the case goes back to how it was and can be retried.
  try {
    await db.insert(schema.caseFiles).values(files.map((f) => ({ caseId: id, kind: f.kind, blobUrl: f.url, originalName: f.name, size: f.size })));
    await db.insert(schema.jobs).values({ caseId: id, step: "intake", state: "queued" });
    await db.insert(schema.caseEvents).values({ caseId: id, step: "upload", message: `Received ${files.length} more file(s)` });
    await db.insert(schema.auditLog).values({ orgId: me.orgId, userId: me.user.id, action: "case.add_files", detail: id });
  } catch (e) {
    await db.update(schema.cases).set({ status: c.status, pendingDoc: c.pendingDoc, error: c.error }).where(eq(schema.cases.id, id)).catch(() => {});
    await db.delete(schema.jobs).where(and(eq(schema.jobs.caseId, id), eq(schema.jobs.step, "intake"), eq(schema.jobs.state, "queued"))).catch(() => {});
    await giveBack();
    throw e;
  }
  return NextResponse.json({ ok: true });
}
