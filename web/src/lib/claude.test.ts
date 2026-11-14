import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { trackedParse, type CallCtx } from "./claude";
import type { LedgerRow } from "./ledger";

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? walk(p) : [p]; });
}

test("only claude.ts touches the Anthropic SDK at runtime", () => {
  const bad: string[] = [];
  for (const f of walk("src").filter((p) => /\.(ts|tsx)$/.test(p) && !p.endsWith("claude.ts") && !p.endsWith(".test.ts"))) {
    for (const line of readFileSync(f, "utf8").split("\n")) {
      if (/@anthropic-ai\/sdk/.test(line) && !/^\s*import type\b/.test(line)) bad.push(`${f}: ${line.trim()}`);
      if (/new Anthropic\(/.test(line)) bad.push(`${f}: ${line.trim()}`);
    }
  }
  assert.deepEqual(bad, []);
});

const ctx: CallCtx = { userId: "u1", orgId: "o1", caseId: "c1", purpose: "read_docs" };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const P: any = { model: "claude-opus-5-5", max_tokens: 10, messages: [] };

test("success writes exactly one row with tokens and priced cost", async () => {
  const rows: LedgerRow[] = [];
  const client = { messages: { parse: async () => ({ _request_id: "req_1", model: "claude-opus-5-5", usage: { input_tokens: 1000, output_tokens: 100, cache_read_input_tokens: 500, cache_creation: { ephemeral_5m_input_tokens: 10, ephemeral_1h_input_tokens: 20 } } }) } };
  await trackedParse(ctx, P, { client: client as never, record: async (r) => { rows.push(r); } });
  assert.equal(rows.length, 1);
  const r = rows[0];
  assert.equal(r.requestId, "req_1"); assert.equal(r.ok, true); assert.equal(r.userId, "u1"); assert.equal(r.caseId, "c1");
  assert.deepEqual([r.inputTokens, r.outputTokens, r.cacheReadTokens, r.cacheWrite5mTokens, r.cacheWrite1hTokens], [1000, 100, 500, 10, 20]);
  assert.equal(Number(r.costUsd), (1000 * 4 + 100 * 20 + 500 * 0.2 + 10 * 5 + 20 * 8) / 1e6);
});
test("unknown model is stored unpriced (null cost)", async () => {
  const rows: LedgerRow[] = [];
  const client = { messages: { parse: async () => ({ _request_id: "req_2", model: "mystery-1", usage: { input_tokens: 5, output_tokens: 5 } }) } };
  await trackedParse(ctx, P, { client: client as never, record: async (r) => { rows.push(r); } });
  assert.equal(rows[0].costUsd, null);
});
test("terminal failure writes one ok=false row, zero tokens, and rethrows", async () => {
  const rows: LedgerRow[] = [];
  const err = Object.assign(new Error("boom"), { name: "APIConnectionError" });
  const client = { messages: { parse: async () => { throw err; } } };
  await assert.rejects(trackedParse({ ...ctx, userId: null }, P, { client: client as never, record: async (r) => { rows.push(r); } }), /boom/);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].ok, false); assert.equal(rows[0].inputTokens ?? 0, 0); assert.equal(rows[0].userId, null);
  assert.match(rows[0].requestId, /^err:/); assert.equal(rows[0].errorClass, "APIConnectionError");
});
test("an API error with a request id uses it", async () => {
  const rows: LedgerRow[] = [];
  const client = { messages: { parse: async () => { throw Object.assign(new Error("x"), { requestID: "req_err" }); } } };
  await assert.rejects(trackedParse(ctx, P, { client: client as never, record: async (r) => { rows.push(r); } }));
  assert.equal(rows[0].requestId, "req_err");
});
