import "server-only";
import { randomUUID } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import type { MessageCreateParamsNonStreaming } from "@anthropic-ai/sdk/resources/messages/messages";
import type { ExtractParsedContentFromParams, ParsedMessage } from "@anthropic-ai/sdk/lib/parser";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { costOf, tokensOf } from "./pricing";
import { recordCall, type LedgerRow } from "./ledger";

// OWNERSHIP RULE: this is the only module that may import the Anthropic SDK at runtime or construct a client.
// Every Claude call goes through trackedParse() so it lands in the llm_calls ledger (shown in /admin).
// A new helper for another call type belongs in this file. web/src/lib/claude.test.ts enforces it.
// The key lives ONLY in the server environment (Vercel env var ANTHROPIC_API_KEY_APP).

export { zodOutputFormat };
export const MODEL = process.env.CLAUDE_MODEL || "claude-opus-5-5";

let _client: Anthropic | null = null;
function client(): Anthropic {
  if (!_client) {
    const apiKey = process.env.ANTHROPIC_API_KEY_APP || process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY_APP is not set");
    _client = new Anthropic({ apiKey, maxRetries: 3 });
  }
  return _client;
}

/** Who and what a call is for. userId/orgId/caseId are null for system calls (cron, admin, webhooks). */
export type CallCtx = { userId: string | null; orgId: string | null; caseId: string | null; purpose: "read_docs" | "system_other" };
export type ParseParams = MessageCreateParamsNonStreaming;

type Deps = { client?: Pick<Anthropic, "messages">; record?: (row: LedgerRow) => Promise<unknown> };

/**
 * messages.parse() plus one ledger row per call. Success: usage from the response, keyed by the provider request id.
 * Failure (API error, network, timeout): zero tokens, ok=false, keyed by the error's request id or err:<call uuid>.
 * The call uuid is made once per invocation, so SDK retries or a rethrow cannot add a second failure row.
 */
export async function trackedParse<P extends ParseParams>(ctx: CallCtx, params: P, deps: Deps = {}): Promise<ParsedMessage<ExtractParsedContentFromParams<P>>> {
  const record = deps.record ?? recordCall;
  const callId = randomUUID();
  const started = Date.now();
  const base = { userId: ctx.userId, orgId: ctx.orgId, caseId: ctx.caseId, purpose: ctx.purpose, model: String(params.model) };
  try {
    const res = await (deps.client ?? client()).messages.parse(params);
    const t = tokensOf(res.usage as never);
    const model = String(res.model || params.model);
    await record({
      ...base, model,
      requestId: ((res as { _request_id?: string | null })._request_id ?? `err:${callId}`).slice(0, 80),
      inputTokens: t.input, outputTokens: t.output, cacheReadTokens: t.cacheRead,
      cacheWrite5mTokens: t.cacheWrite5m, cacheWrite1hTokens: t.cacheWrite1h,
      costUsd: ((c) => (c === null ? null : c.toFixed(8)))(costOf(model, t)),
      latencyMs: Date.now() - started, ok: true,
    });
    return res;
  } catch (e) {
    const rid = (e as { requestID?: string | null; request_id?: string | null }).requestID ?? (e as { request_id?: string | null }).request_id;
    await record({
      ...base, requestId: (rid || `err:${callId}`).slice(0, 80),
      costUsd: "0", latencyMs: Date.now() - started, ok: false, errorClass: (e as Error)?.name ?? "Error",
    });
    throw e;
  }
}
