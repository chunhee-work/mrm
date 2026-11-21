import { test } from "node:test";
import assert from "node:assert/strict";
import { runPool } from "./pool";

test("B12 pool: never more than 3 at once, every job runs once", async () => {
  let live = 0, peak = 0; const seen: number[] = [];
  await runPool(10, 3, async (i) => { live++; peak = Math.max(peak, live); seen.push(i); await new Promise((r) => setTimeout(r, 5)); live--; });
  assert.equal(peak, 3);
  assert.deepEqual([...seen].sort((a, b) => a - b), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
});

test("B12 pool: the first failure rejects and stops new jobs from starting", async () => {
  const started: number[] = [];
  await assert.rejects(runPool(10, 2, async (i) => { started.push(i); if (i === 1) throw new Error("boom"); await new Promise((r) => setTimeout(r, 5)); }), /boom/);
  assert.ok(started.length < 10);
});

test("B12 pool: fewer jobs than the limit, and zero jobs, are fine", async () => {
  await runPool(2, 4, async () => {});
  await runPool(0, 4, async () => {});
});
