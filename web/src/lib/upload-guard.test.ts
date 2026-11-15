import { test } from "node:test";
import assert from "node:assert/strict";
import { stallTimer } from "./upload-guard";

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
