import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getUserOrNull } from "@/lib/session";
import { scanCase } from "@/lib/scan-case";

export const maxDuration = 300;

// POST /api/cases/:id/scan  — manual retry of step 1 (the first run starts by itself after upload).
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await getUserOrNull();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const [c] = await db.select({ id: schema.cases.id }).from(schema.cases).where(and(eq(schema.cases.id, id), eq(schema.cases.orgId, me.orgId))).limit(1);
  if (!c) return NextResponse.json({ error: "not found" }, { status: 404 });
  const r = await scanCase(id);
  return r.ok ? NextResponse.json({ ok: true, missing: r.missing }) : NextResponse.json({ error: "scan failed" }, { status: 500 });
}
