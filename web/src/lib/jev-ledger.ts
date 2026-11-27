import "server-only";
import { randomUUID } from "node:crypto";
import { recordCall, type LedgerRow } from "./ledger";

// Every TypeSafe ("Jev") call goes through trackedJev() so it lands in the llm_calls ledger next to the Anthropic calls
// (the Cost page keeps the two apart: model "jev-latest" is not on the Anthropic bill). Price per call is a plain env setting,
// TYPESAFE_COST_PER_CALL_USD; without it the call is counted but "unpriced". Never throws and never changes the call's result.
export type JevCtx = { purpose: string; userId?: string | null; caseId?: string | null };

const price = (): string | null => { const n = Number(process.env.TYPESAFE_COST_PER_CALL_USD); return Number.isFinite(n) && n > 0 ? String(n) : null; };

export async function trackedJev<T>(ctx: JevCtx, call: () => Promise<T>, record: (r: LedgerRow) => Promise<unknown> = recordCall): Promise<T> {
  const t0 = Date.now();
  let ok = true, errorClass: string | undefined, inputTokens = 0, outputTokens = 0;
  try { const out = await call(); const u = (out as { usage?: { input_tokens?: unknown; output_tokens?: unknown } } | null)?.usage; inputTokens = Number(u?.input_tokens) || 0; outputTokens = Number(u?.output_tokens) || 0; return out; }
  catch (e) { ok = false; errorClass = e instanceof Error ? e.name : "Error"; throw e; }
  finally {
    await record({
      requestId: `jev:${randomUUID()}`, purpose: (ctx.purpose.startsWith("jev_") ? ctx.purpose : `jev_${ctx.purpose}`).slice(0, 60), model: "jev-latest",
      userId: ctx.userId ?? null, caseId: ctx.caseId ?? null, costUsd: ok ? price() : null, inputTokens, outputTokens, latencyMs: Date.now() - t0, ok, errorClass,
    }).catch(() => undefined);
  }
}
