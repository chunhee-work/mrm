import { test } from "node:test";
import assert from "node:assert/strict";
import { guarded, stallTimer, UploadStalled } from "./upload-guard";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

test("stallTimer fires once nothing has moved for the whole window", async () => {
  let fired = 0;
  stallTimer(40, () => fired++);
  await wait(90);
  assert.equal(fired, 1);
});

test("stallTimer: progress keeps it quiet, stop() cancels it", async () => {
  let fired = 0;
  const t = stallTimer(60, () => fired++);
  for (let i = 0; i < 4; i++) { await wait(30); t.touch(); }
  assert.equal(fired, 0);
  t.stop();
  await wait(100);
  assert.equal(fired, 0);
});

test("guarded: a run that never settles and ignores the abort still ends with UploadStalled", async () => {
  let aborted = false;
  const never = (signal: AbortSignal) => { signal.addEventListener("abort", () => { aborted = true; }); return new Promise<string>(() => {}); };
  await assert.rejects(guarded(never, 40), UploadStalled);
  assert.equal(aborted, true);
});

test("guarded: progress keeps a slow run alive, and its result comes back", async () => {
  const slow = async (_s: AbortSignal, touch: () => void) => { for (let i = 0; i < 4; i++) { await wait(30); touch(); } return "done"; };
  assert.equal(await guarded(slow, 60), "done");
});

test("guarded: a run that fails by itself passes its own error on", async () => {
  await assert.rejects(guarded(async () => { throw new Error("network"); }, 60), /network/);
});
