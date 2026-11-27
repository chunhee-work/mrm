import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getUserOrNull } from "@/lib/session";
import { scanCase } from "@/lib/scan-case";
import { debitRetry, refundCase } from "@/lib/payments/case-credit";
import { splitRunning } from "@/lib/split-marks";

export const maxDuration = 300;

// POST /api/cases/:id/scan  — manual retry of step 1 (the first run starts by itself after upload).
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await getUserOrNull();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const [c] = await db.select({ id: schema.cases.id, status: schema.cases.status, error: schema.cases.error }).from(schema.cases).where(and(eq(schema.cases.id, id), eq(schema.cases.orgId, me.orgId))).limit(1);
  if (!c) return NextResponse.json({ error: "not found" }, { status: 404 });
  // a case still `uploaded` while a zip split of the organisation runs may be rolled back (deleted): it is read once the split ends
  if (c.status === "uploaded" && (await splitRunning(me.orgId))) return NextResponse.json({ error: "busy" }, { status: 409 });
  const paid = await debitRetry(me.orgId, id);
  if (!paid) return NextResponse.json({ error: "no_credits" }, { status: 402 });
  const r = await scanCase(id, "retry").catch(async (e) => {
    // failed before the read could start (database, network): the case is just as it was, so a credit taken for this press
    // goes back. Once the read has started, its own failure handling decides.
    const [now] = await db.select({ status: schema.cases.status, error: schema.cases.error }).from(schema.cases).where(eq(schema.cases.id, id)).limit(1).catch(() => []);
    if (paid === "charged" && now && now.status === c.status && now.error === c.error) await refundCase(me.orgId, id, "busy").catch(() => {});
    throw e;
  });
  if (!r.claimed) {
    // already reading (a double press, a second tab) or nothing to retry: a credit taken for this press goes back
    if (paid === "charged") await refundCase(me.orgId, id, "busy").catch(() => {});
    return NextResponse.json({ error: "busy" }, { status: 409 });
  }
  return r.ok ? NextResponse.json({ ok: true, missing: r.missing }) : NextResponse.json({ ok: false, failed: true }) /* the read ran and failed: the page shows the new state, this is not a server error */;
}
