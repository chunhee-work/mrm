import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { readCaseDocs } from "@/lib/read-docs";

export const STALE_MS = 6 * 60_000; // one read runs at most 5 minutes; a "reading" case with no news for 6 is dead
const MAX_ATTEMPTS = 3; // automatic recovery gives up after this many reads of the same case

export type ScanMode = "auto" | "retry" | "recover";

/**
 * Step 1 "System scans it": Claude reads the uploaded documents of one case.
 * Status flow: reading -> phase_a (nothing missing) | pending_doc (documents missing) | failed.
 * One claim rule for every caller: a conditional UPDATE from an allowed source status, so two triggers can never both read.
 *   auto    (after upload)            uploaded
 *   retry   (the "Read again" button) failed | pending_doc
 *   recover (case page, self-heal)    reading with no case event for STALE_MS, and fewer than MAX_ATTEMPTS reads so far
 * A new attempt clears the old error and missing list; the old case_data stays until the new read succeeds.
 * Each attempt appends a "Reading documents" event; each successful read appends one usage row.
 */
export async function scanCase(id: string, mode: ScanMode = "retry"): Promise<{ ok: boolean; missing: string[]; claimed: boolean }> {
  const cid = schema.cases.id;
  const fresh = sql`not exists (select 1 from ${schema.caseEvents} e where e.case_id = ${cid} and e.at > now() - make_interval(secs => ${sql.raw(String(STALE_MS / 1000))}))`;
  const tries = sql`(select count(*) from ${schema.caseEvents} e where e.case_id = ${cid} and e.step = 'read_docs' and e.message = 'Reading documents') < ${sql.raw(String(MAX_ATTEMPTS))}`;
  const where =
    mode === "auto" ? and(eq(cid, id), eq(schema.cases.status, "uploaded")) :
    mode === "retry" ? and(eq(cid, id), inArray(schema.cases.status, ["failed", "pending_doc"])) :
    and(eq(cid, id), eq(schema.cases.status, "reading"), fresh, tries);
  const claimed = await db.update(schema.cases).set({ status: "reading", error: null, pendingDoc: null }).where(where).returning({ id: cid });
  if (!claimed.length) {
    if (mode === "recover") { // out of attempts: stop waiting, show Failed + the retry button
      await db.update(schema.cases).set({ status: "failed", error: "Reading timed out" })
        .where(and(eq(cid, id), eq(schema.cases.status, "reading"), fresh, sql`not ${tries}`));
    }
    return { ok: false, missing: [], claimed: false };
  }
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
    return { ok: true, missing: data.missing, claimed: true };
  } catch (e) {
    await db.update(schema.cases).set({ status: "failed", error: (e as Error).message.slice(0, 500) }).where(eq(schema.cases.id, id));
    await db.insert(schema.caseEvents).values({ caseId: id, step: "read_docs", message: "Scan failed" });
    return { ok: false, missing: [], claimed: true };
  }
}
