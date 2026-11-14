import { eq } from "drizzle-orm";
import { db as defaultDb, schema } from "@/db";

export type LedgerRow = typeof schema.llmCalls.$inferInsert;
type Db = typeof defaultDb;

const SAME_TEXT = ["userId", "caseId", "model"] as const;
const SAME_NUM = ["inputTokens", "outputTokens", "cacheReadTokens", "cacheWrite5mTokens", "cacheWrite1hTokens"] as const;
// Omitted fields are the column defaults (null / 0), so a replay that leaves them out still matches.
function same(a: Partial<LedgerRow>, b: Partial<LedgerRow>) {
  return SAME_TEXT.every((k) => (a[k] ?? null) === (b[k] ?? null)) && SAME_NUM.every((k) => (a[k] ?? 0) === (b[k] ?? 0));
}

/**
 * Writes one llm_calls row. request_id is unique, so a replay is a no-op. If the same request_id arrives with
 * different attribution or tokens, the first row stays authoritative and the conflict is logged in audit_log.
 * Never throws: a ledger problem must not fail the user's request.
 */
export async function recordCall(row: LedgerRow, db: Db = defaultDb): Promise<"inserted" | "replay" | "conflict" | "error"> {
  try {
    const ins = await db.insert(schema.llmCalls).values(row).onConflictDoNothing({ target: schema.llmCalls.requestId }).returning({ id: schema.llmCalls.id });
    if (ins.length) return "inserted";
    const [old] = await db.select().from(schema.llmCalls).where(eq(schema.llmCalls.requestId, row.requestId)).limit(1);
    const differs = !old || !same(old, row);
    if (!differs) return "replay";
    console.error("llm_calls conflict for request", row.requestId);
    await db.insert(schema.auditLog).values({ action: "llm_calls_conflict", detail: row.requestId });
    return "conflict";
  } catch (e) {
    console.error("llm ledger write failed:", (e as Error).name);
    return "error";
  }
}

export async function recordEmail(row: typeof schema.emailLog.$inferInsert, db: Db = defaultDb) {
  try { await db.insert(schema.emailLog).values(row); } catch (e) { console.error("email log write failed:", (e as Error).name); }
}
