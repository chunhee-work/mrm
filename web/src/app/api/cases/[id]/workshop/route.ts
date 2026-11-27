import { NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { getUserOrNull } from "@/lib/session";
import { orgWorkshops } from "@/lib/ext/workshops";
import { missingRelation } from "@/lib/ext/worker-gate";
import { canSwitchWorkshop } from "@/lib/ext/workshop-rules";

const Body = z.object({ workshop: z.number().int().min(1).max(3) });

// PATCH /api/cases/:id/workshop  — the user moves a case to another of the account's workshops, until the case is made in Merimen.
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await getUserOrNull();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const slot = parsed.data.workshop;
  const [c] = await db.select({ status: schema.cases.status, merimenCaseId: schema.cases.merimenCaseId }).from(schema.cases)
    .where(and(eq(schema.cases.id, id), eq(schema.cases.orgId, me.orgId))).limit(1);
  if (!c) return NextResponse.json({ error: "not found" }, { status: 404 });
  const ws = await orgWorkshops(me.orgId);
  if (!canSwitchWorkshop(c)) return NextResponse.json({ error: "too_late" }, { status: 409 });
  const target = ws.find((w) => w.slot === slot);
  if (!target) return NextResponse.json({ error: "workshop_unknown" }, { status: 400 });
  try {
    // one conditional statement: it writes only while the worker has not locked the workshop (it locks it the moment it makes the case)
    const done = await db.insert(schema.merimenCaseWorkshop).values({ caseId: id, slot })
      .onConflictDoUpdate({ target: schema.merimenCaseWorkshop.caseId, set: { slot, lockedAt: null, lockedName: null, updatedAt: new Date() },
        // open, or locked without a name on a workshop that has since disappeared (the worker could not use it and stopped the case); a lock that has a name is final
        setWhere: sql`${schema.merimenCaseWorkshop.lockedAt} IS NULL OR (${schema.merimenCaseWorkshop.lockedName} IS NULL AND NOT EXISTS (SELECT 1 FROM merimen_workshops w JOIN cases cc ON cc.org_id = w.org_id WHERE cc.id = ${id} AND w.slot = ${schema.merimenCaseWorkshop.slot}))` })
      .returning({ caseId: schema.merimenCaseWorkshop.caseId });
    if (!done.length) return NextResponse.json({ error: "too_late" }, { status: 409 });
    await db.insert(schema.caseEvents).values({ caseId: id, step: "workshop", message: `Workshop ${slot}: ${target.name}` });
    await db.insert(schema.auditLog).values({ orgId: me.orgId, userId: me.user.id, action: "case.workshop", detail: `${id}|${slot}` });
  } catch (e) { if (missingRelation(e)) return NextResponse.json({ error: "not_configured" }, { status: 503 }); throw e; }
  return NextResponse.json({ workshop: slot, name: target.name });
}
