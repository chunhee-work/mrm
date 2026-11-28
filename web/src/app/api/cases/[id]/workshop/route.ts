import { notDeleted } from "@/lib/case-delete";
import { NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { getUserOrNull } from "@/lib/session";
import { orgWorkshops } from "@/lib/ext/workshops";
import { missingRelation } from "@/lib/ext/worker-gate";
import { canSwitchWorkshop } from "@/lib/ext/workshop-rules";

const Body = z.object({ workshop: z.number().int().min(1).max(3), confirm: z.boolean().optional() });

// PATCH /api/cases/:id/workshop  — the user moves a case to another of the account's workshops, until they confirm it.
// { workshop, confirm: true } = the Confirm press (owner 2026-11-29): the workshop is then fixed and the worker may start the case
// in Merimen. Moving a case leaves it unconfirmed. A confirmed workshop that was removed since may be replaced (then confirmed again).
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await getUserOrNull();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const slot = parsed.data.workshop;
  const confirm = parsed.data.confirm === true;
  const [c] = await db.select({ status: schema.cases.status, merimenCaseId: schema.cases.merimenCaseId }).from(schema.cases)
    .where(and(eq(schema.cases.id, id), eq(schema.cases.orgId, me.orgId), notDeleted)).limit(1);
  if (!c) return NextResponse.json({ error: "not found" }, { status: 404 });
  const ws = await orgWorkshops(me.orgId);
  // a finished case cannot be moved or confirmed either (workshopState shows it read-only)
  if (!canSwitchWorkshop(c) || c.status === "done") return NextResponse.json({ error: "too_late" }, { status: 409 });
  const target = ws.find((w) => w.slot === slot);
  if (!target) return NextResponse.json({ error: "workshop_unknown" }, { status: 400 });
  try {
    // one conditional statement: it writes only while the worker has not locked the workshop (it locks it the moment it makes the case)
    const now = new Date();
    const done = await db.insert(schema.merimenCaseWorkshop).values({ caseId: id, slot, confirmedAt: confirm ? now : null })
      .onConflictDoUpdate({ target: schema.merimenCaseWorkshop.caseId, set: { slot, lockedAt: null, lockedName: null, confirmedAt: confirm ? now : null, updatedAt: now },
        // open (neither confirmed nor locked by the worker), or its workshop has since disappeared and the worker never used it by name
        // (it could not, and stopped the case); a lock that has a name is final, and so is a confirmed workshop that still exists
        setWhere: sql`(${schema.merimenCaseWorkshop.lockedAt} IS NULL AND ${schema.merimenCaseWorkshop.confirmedAt} IS NULL) OR (${schema.merimenCaseWorkshop.lockedName} IS NULL AND NOT EXISTS (SELECT 1 FROM merimen_workshops w JOIN cases cc ON cc.org_id = w.org_id WHERE cc.id = ${id} AND w.slot = ${schema.merimenCaseWorkshop.slot}))` })
      .returning({ caseId: schema.merimenCaseWorkshop.caseId });
    if (!done.length) return NextResponse.json({ error: "too_late" }, { status: 409 });
    await db.insert(schema.caseEvents).values({ caseId: id, step: "workshop", message: confirm ? `Workshop confirmed ${slot}: ${target.name}` : `Workshop ${slot}: ${target.name}` });
    await db.insert(schema.auditLog).values({ orgId: me.orgId, userId: me.user.id, action: confirm ? "case.workshop_confirm" : "case.workshop", detail: `${id}|${slot}` });
  } catch (e) { if (missingRelation(e)) return NextResponse.json({ error: "not_configured" }, { status: 503 }); throw e; }
  return NextResponse.json({ workshop: slot, name: target.name, confirmed: confirm });
}
