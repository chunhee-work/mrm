import test from "node:test";
import assert from "node:assert/strict";
import { trackedJev } from "./jev-ledger";

test("records one jev row and returns the result", async () => {
  const rows: Record<string, unknown>[] = [];
  const out = await trackedJev({ purpose: "insurer", caseId: "c1" }, async () => 42, async (r) => { rows.push(r); });
  assert.equal(out, 42); assert.equal(rows.length, 1);
  assert.equal(rows[0].model, "jev-latest"); assert.equal(rows[0].purpose, "jev_insurer"); assert.equal(rows[0].ok, true); assert.equal(rows[0].caseId, "c1");
});
test("a failed call is recorded as failed and still throws", async () => {
  const rows: Record<string, unknown>[] = [];
  await assert.rejects(trackedJev({ purpose: "x" }, async () => { throw new TypeError("no"); }, async (r) => { rows.push(r); }), /no/);
  assert.equal(rows[0].ok, false); assert.equal(rows[0].errorClass, "TypeError"); assert.equal(rows[0].costUsd, null);
});
test("a ledger error never breaks the call", async () => {
  assert.equal(await trackedJev({ purpose: "x" }, async () => "fine", async () => { throw new Error("db down"); }), "fine");
});
test("tokens come from the usage field", async () => {
  const rows: Record<string, unknown>[] = [];
  await trackedJev({ purpose: "jev_rc_check" }, async () => ({ usage: { input_tokens: 120, output_tokens: 7 } }), async (r) => { rows.push(r); });
  assert.equal(rows[0].inputTokens, 120); assert.equal(rows[0].outputTokens, 7); assert.equal(rows[0].purpose, "jev_rc_check");
});
