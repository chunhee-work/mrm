import { NextResponse } from "next/server";
import { and, asc, desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getUserOrNull } from "@/lib/session";
import { notDeleted } from "@/lib/case-delete";
import { caseSlot, orgWorkshops } from "@/lib/ext/workshops";
import { canSwitchWorkshop } from "@/lib/ext/workshop-rules";
import { missingRelation } from "@/lib/ext/worker-gate";

// GET /api/cases/:id/brief — what an open line on the Cases page shows under the job: the activity, the files and the
// workshop. The first page never sends the user to the case page (owner 2026-11-27: "all stay in the first page").
// ?status=1: only what the case is doing now (asked after "Read again" got no answer: did the server take it?).
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await getUserOrNull();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const [c] = await db.select({ status: schema.cases.status, merimenCaseId: schema.cases.merimenCaseId }).from(schema.cases)
    .where(and(eq(schema.cases.id, id), eq(schema.cases.orgId, me.orgId), notDeleted)).limit(1);
  if (!c) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (new URL(req.url).searchParams.has("status")) return NextResponse.json({ status: c.status }, { headers: { "cache-control": "no-store" } });
  // the newest 30 events, shown oldest first like the case page
  const ev = await db.select({ at: schema.caseEvents.at, message: schema.caseEvents.message }).from(schema.caseEvents)
    .where(eq(schema.caseEvents.caseId, id)).orderBy(desc(schema.caseEvents.at), desc(schema.caseEvents.id)).limit(30);
  const files = await db.select({ id: schema.caseFiles.id, name: schema.caseFiles.originalName, size: schema.caseFiles.size }).from(schema.caseFiles)
    .where(eq(schema.caseFiles.caseId, id)).orderBy(asc(schema.caseFiles.id)).limit(400);
  // which uploaded pictures are on the photo desk: the first page lists only the others beside the desk (a picture the desk
  // left out, too large or unreadable, must stay reachable)
  // A name only counts when one uploaded file has it: two files with the same name (two zips) cannot be told apart by name,
  // so both stay listed rather than risk hiding the one the desk left out.
  const deskNames = new Set((await db.select({ n: schema.casePhotos.srcName }).from(schema.casePhotos).where(eq(schema.casePhotos.caseId, id))).map((p) => p.n));
  const seen = new Map<string, number>();
  for (const f of files) { const k = f.name.slice(0, 200); seen.set(k, (seen.get(k) ?? 0) + 1); }
  const onDesk = new Set([...deskNames].filter((n) => seen.get(n) === 1));
  // the workshop tables come with migration 0014: without them there is no choice to show
  const ws = await Promise.all([caseSlot(id), orgWorkshops(me.orgId)]).catch((e) => { if (missingRelation(e)) return null; throw e; });
  const workshop = ws && {
    slot: ws[0].slot,
    locked: !canSwitchWorkshop({ status: c.status, merimenCaseId: c.merimenCaseId }) || (ws[0].locked && (ws[0].fixed || ws[1].some((w) => w.slot === ws[0].slot))),
  };
  return NextResponse.json({
    events: ev.reverse().map((e) => ({ at: e.at.toISOString(), message: e.message })),
    files: files.map((f) => ({ id: f.id, name: f.name, size: Number(f.size), ...(onDesk.has(f.name.slice(0, 200)) ? { onDesk: true } : {}) })),
    workshop,
  }, { headers: { "cache-control": "no-store" } });
}
