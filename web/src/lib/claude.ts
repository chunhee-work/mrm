import "server-only";
import { randomUUID } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import type { MessageCreateParamsNonStreaming } from "@anthropic-ai/sdk/resources/messages/messages";
import { parseMessage, type ExtractParsedContentFromParams, type ParsedMessage } from "@anthropic-ai/sdk/lib/parser";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { costOf, tokensOf } from "./pricing";
import { recordCall, type LedgerRow } from "./ledger";

// OWNERSHIP RULE: this is the only module that may import the Anthropic SDK at runtime or construct a client.
// Every billed Claude call goes through trackedParse() so it lands in the llm_calls ledger (shown in /admin). The free token count in documentRefusal() is not logged.
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

/**
 * Free check (no answer is written, nothing is billed): does the API take this document? null = yes, else the API's 400 error.
 * Short timeout and no retries: it only narrows down which PDF a refusal was about, inside the read's time limit.
 */
export async function documentRefusal(content: Anthropic.Messages.ContentBlockParam[]): Promise<unknown | null> {
  try {
    await client().messages.countTokens({ model: MODEL, messages: [{ role: "user", content }] }, { timeout: 30_000, maxRetries: 0 });
    return null;
  } catch (e) {
    if ((e as { status?: number }).status === 400) return e;
    throw e;
  }
}

/** Who and what a call is for. userId/orgId/caseId are null for system calls (cron, admin, webhooks). */
export type CallCtx = { userId: string | null; orgId: string | null; caseId: string | null; purpose: "read_docs" | "name_photos" | "system_other"; playbook?: string };
export type ParseParams = MessageCreateParamsNonStreaming;

/** request: per-call limits (a shorter timeout, fewer tries, a signal that ends the call and its retries at a set time) for calls that sit inside a time-boxed route. */
type Deps = { client?: { messages: { create: Anthropic["messages"]["create"] } }; record?: (row: LedgerRow) => Promise<unknown>; request?: { timeout?: number; maxRetries?: number; signal?: AbortSignal } };

/**
 * messages.create() + parseMessage() (what messages.parse() does) plus one ledger row per call. The row is written as soon as the
 * billed response arrives, from res.usage, so a refusal, a missing output or a parse failure is still counted: those rows keep
 * their tokens and cost but are ok=false with errorClass refusal | no_output | parse_error.
 * Success: usage from the response, keyed by the provider request id.
 * Failure (API error, network, timeout): zero tokens, ok=false, keyed by the error's request id or err:<call uuid>.
 * The call uuid is made once per invocation, so SDK retries or a rethrow cannot add a second failure row.
 */
export async function trackedParse<P extends ParseParams>(ctx: CallCtx, params: P, deps: Deps = {}): Promise<ParsedMessage<ExtractParsedContentFromParams<P>>> {
  const record = deps.record ?? recordCall;
  const callId = randomUUID();
  const started = Date.now();
  // which playbook the prompt carried, so a wrong answer can be traced to the rules that were in force (a log line, not a column)
  if (ctx.playbook) console.info(JSON.stringify({ ev: "ai_call", purpose: ctx.purpose, model: String(params.model), playbook: ctx.playbook, call: callId }));
  const base = { userId: ctx.userId, orgId: ctx.orgId, caseId: ctx.caseId, purpose: ctx.purpose, model: String(params.model) };
  let billed = false;
  try {
    const res = await (deps.client ?? client()).messages.create(params, deps.request);
    // Parse first but keep the outcome, so the ledger row is written once, from res.usage, whatever happens next.
    let parsed: ParsedMessage<ExtractParsedContentFromParams<P>> | null = null;
    let parseErr: unknown = null;
    try { parsed = parseMessage(res, params as never, { logger: console }) as ParsedMessage<ExtractParsedContentFromParams<P>>; } catch (pe) { parseErr = pe; }
    const wantsOutput = !!(params as { output_config?: { format?: unknown } }).output_config?.format;
    // A billed response that is unusable keeps its tokens and cost but is marked ok=false with a reason.
    const reason = parseErr ? "parse_error" : res.stop_reason === "refusal" ? "refusal" : wantsOutput && !parsed?.parsed_output ? "no_output" : null;
    const t = tokensOf(res.usage as never);
    const model = String(res.model || params.model);
    await record({
      ...base, model,
      requestId: ((res as { _request_id?: string | null })._request_id ?? `err:${callId}`).slice(0, 80),
      inputTokens: t.input, outputTokens: t.output, cacheReadTokens: t.cacheRead,
      cacheWrite5mTokens: t.cacheWrite5m, cacheWrite1hTokens: t.cacheWrite1h,
      costUsd: ((c) => (c === null ? null : c.toFixed(8)))(costOf(model, t)),
      latencyMs: Date.now() - started, ok: reason === null, errorClass: reason,
    });
    billed = true;
    if (parseErr) throw parseErr;
    return parsed as ParsedMessage<ExtractParsedContentFromParams<P>>;
  } catch (e) {
    if (billed) throw e; // usage is already in the ledger; a parse failure must not add a zero-cost row
    const rid = (e as { requestID?: string | null; request_id?: string | null }).requestID ?? (e as { request_id?: string | null }).request_id;
    await record({
      ...base, requestId: (rid || `err:${callId}`).slice(0, 80),
      costUsd: "0", latencyMs: Date.now() - started, ok: false, errorClass: (e as Error)?.name ?? "Error",
    });
    throw e;
  }
}
