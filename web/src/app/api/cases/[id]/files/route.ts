import { NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { getUserOrNull } from "@/lib/session";

const Body = z.object({
  // none at all is "try again": the case goes back in the queue with the files it already has
  files: z.array(z.object({
    kind: z.enum(["bundle_zip", "pdf", "photo"]),
    url: z.string().url(), name: z.string().max(300), size: z.number().int().nonnegative(),
  })).max(300),
});

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
  // Only a case that stopped (a document missing, or failed) takes more files; anything else is being worked on or finished.
  // The status is checked again in the update itself, so two requests at once cannot queue the case twice.
  if (c.status !== "pending_doc" && c.status !== "failed") return NextResponse.json({ error: "not waiting" }, { status: 409 });
  const moved = await db.update(schema.cases).set({ status: "uploaded", pendingDoc: null, error: null })
    .where(and(eq(schema.cases.id, id), inArray(schema.cases.status, ["pending_doc", "failed"]))).returning({ id: schema.cases.id });
  if (!moved.length) return NextResponse.json({ error: "not waiting" }, { status: 409 });

  if (files.length) {
    await db.insert(schema.caseFiles).values(files.map((f) => ({ caseId: id, kind: f.kind, blobUrl: f.url, originalName: f.name, size: f.size })));
  }
  await db.insert(schema.jobs).values({ caseId: id, step: "intake", state: "queued" });
  await db.insert(schema.caseEvents).values({ caseId: id, step: "upload", message: files.length ? `Received ${files.length} more file(s)` : "Queued again" });
  await db.insert(schema.auditLog).values({ orgId: me.orgId, userId: me.user.id, action: "case.add_files", detail: id });
  return NextResponse.json({ ok: true });
}
