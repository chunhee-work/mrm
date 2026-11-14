import "server-only";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { readCaseDocs } from "@/lib/read-docs";

/**
 * Step 1 "System scans it": Claude reads the uploaded documents of one case.
 * Status flow: reading -> phase_a (nothing missing) | pending_doc (documents missing) | failed.
 * `onlyIfUploaded` (the automatic run after upload) claims the case atomically, so a double trigger reads once.
 * The manual retry passes false and always re-runs.
 */
export async function scanCase(id: string, opts: { onlyIfUploaded?: boolean } = {}): Promise<{ ok: boolean; missing: string[] }> {
  const where = opts.onlyIfUploaded ? and(eq(schema.cases.id, id), eq(schema.cases.status, "uploaded")) : eq(schema.cases.id, id);
  const claimed = await db.update(schema.cases).set({ status: "reading", error: null }).where(where).returning({ id: schema.cases.id });
  if (!claimed.length) return { ok: false, missing: [] };
  await db.insert(schema.caseEvents).values({ caseId: id, step: "read_docs", message: "Reading documents" });
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
    return { ok: true, missing: data.missing };
  } catch (e) {
    await db.update(schema.cases).set({ status: "failed", error: (e as Error).message.slice(0, 500) }).where(eq(schema.cases.id, id));
    await db.insert(schema.caseEvents).values({ caseId: id, step: "read_docs", message: "Scan failed" });
    return { ok: false, missing: [] };
  }
}
