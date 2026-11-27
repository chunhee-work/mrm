import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getUserOrNull } from "@/lib/session";
import { scanCase } from "@/lib/scan-case";
import { debitRetry } from "@/lib/payments/case-credit";
import { splitRunning } from "@/lib/split-marks";
import { notDeleted } from "@/lib/case-delete";
import { readCapHit } from "@/lib/read-cap";

export const maxDuration = 300;

// POST /api/cases/:id/scan  — manual retry of step 1 (the first run starts by itself after upload).
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await getUserOrNull();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const [c] = await db.select({ id: schema.cases.id, status: schema.cases.status, error: schema.cases.error, pendingDoc: schema.cases.pendingDoc }).from(schema.cases).where(and(eq(schema.cases.id, id), eq(schema.cases.orgId, me.orgId), notDeleted)).limit(1);
  if (!c) return NextResponse.json({ error: "not found" }, { status: 404 });
  // a case still `uploaded` while a zip split of the organisation runs may be rolled back (deleted): it is read once the split ends
  if (c.status === "uploaded" && (await splitRunning(me.orgId))) return NextResponse.json({ error: "busy" }, { status: 409 });
  // S-U1: a read costs us a model call whether or not it costs the user a credit, so one case and one organisation can only
  // start so many in an hour (read-cap.ts). Asked before a credit is taken; the claim in scanCase holds the same limits.
  if (await readCapHit(id, me.orgId)) return NextResponse.json({ error: "too_many" }, { status: 429 });
  // S-U1b: the credit for this press is taken inside scanCase, by the one request that wins the case, after it has won it.
  // (Taken here first, two presses at the same moment read the case for free: one was charged, the other read, and the
  // charged one, finding the case busy, took its credit back.) A press that does not get the case is charged nothing, so
  // there is nothing to give back here; a read that then fails on our side gets its credit back inside scanCase, as before.
  const r = await scanCase(id, "retry", null, { was: { status: c.status, error: c.error, pendingDoc: c.pendingDoc }, pay: () => debitRetry(me.orgId, id) });
  if (r.noCredits) return NextResponse.json({ error: "no_credits" }, { status: 402 });
  // already reading (a double press, a second tab), changed since it was looked at, or nothing to retry
  if (!r.claimed) return NextResponse.json({ error: "busy" }, { status: 409 });
  return r.ok ? NextResponse.json({ ok: true, missing: r.missing }) : NextResponse.json({ ok: false, failed: true }) /* the read ran and failed: the page shows the new state, this is not a server error */;
}
