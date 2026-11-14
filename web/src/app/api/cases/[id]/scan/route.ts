import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getUserOrNull } from "@/lib/session";
import { readCaseDocs } from "@/lib/read-docs";

export const maxDuration = 300;

// POST /api/cases/:id/scan  — step 1 "System scans it": Claude reads the uploaded documents.
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await getUserOrNull();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const [c] = await db.select().from(schema.cases).where(and(eq(schema.cases.id, id), eq(schema.cases.orgId, me.orgId))).limit(1);
  if (!c) return NextResponse.json({ error: "not found" }, { status: 404 });
  await db.update(schema.cases).set({ status: "reading", error: null }).where(eq(schema.cases.id, id));
  try {
    const files = await db.select().from(schema.caseFiles).where(eq(schema.caseFiles.caseId, id));
    const { data, usage, costUsd } = await readCaseDocs(files);
    await db.update(schema.cases).set({
      status: data.missing.length ? "pending_doc" : "phase_a",
      pendingDoc: data.missing.join("; ") || null,
      caseData: data,
      insurer: data.client_policy?.insurer ?? null,
      carModel: data.client_vehicle.model ?? null,
    }).where(eq(schema.cases.id, id));
    await db.insert(schema.usage).values({
      caseId: id, inputTokens: usage.input_tokens, outputTokens: usage.output_tokens,
      cacheTokens: usage.cache_read_input_tokens ?? 0, costUsd: costUsd.toFixed(4),
    });
    await db.insert(schema.caseEvents).values({ caseId: id, step: "read_docs", message: data.missing.length ? `Pending: ${data.missing.join("; ")}` : "Documents read" });
    return NextResponse.json({ ok: true, missing: data.missing });
  } catch (e) {
    await db.update(schema.cases).set({ status: "failed", error: (e as Error).message.slice(0, 500) }).where(eq(schema.cases.id, id));
    await db.insert(schema.caseEvents).values({ caseId: id, step: "read_docs", message: "Scan failed" });
    return NextResponse.json({ error: "scan failed" }, { status: 500 });
  }
}
