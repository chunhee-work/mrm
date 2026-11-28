import test from "node:test";
import assert from "node:assert/strict";
import { merimenDone, stepTasks } from "./step-tasks";

const flat = (t: ReturnType<typeof stepTasks>) => Object.entries(t).map(([s, l]) => `${s}:${l.map((x) => (x.done ? "+" : "-")).join("")}`).join(" ");

test("reading: only files received", () => assert.equal(flat(stepTasks({ status: "reading" }, null)), "docs:+-- photos:--- merimen:------- done:-"));
test("missing document: read, not all in", () => assert.equal(flat(stepTasks({ status: "pending_doc", deskTotal: 8, deskConfirm: 3 }, null)), "docs:++- photos:+-- merimen:------- done:-"));
test("photos all named, Done not pressed", () => assert.equal(flat(stepTasks({ status: "waiting_user", deskTotal: 8, deskConfirm: 0 }, null)), "docs:+++ photos:++- merimen:------- done:-"));
test("in Merimen: the worker lines tick the Merimen jobs", () => {
  const ev = [{ message: "Case created in Merimen. check by hand: the manager; Adjuster Report saved: check by hand: PIAM IPD code; Documents uploaded: 3" }];
  assert.equal(flat(stepTasks({ status: "phase_a", deskTotal: 8, photosDone: true, inMerimen: true }, ev)), "docs:+++ photos:+++ merimen:++++--- done:-");
});
test("finished: everything done", () => assert.equal(flat(stepTasks({ status: "done" }, [])), "docs:+++ photos:+++ merimen:+++++++ done:+"));
test("a practice run ticks nothing", () => assert.deepEqual(merimenDone("Phase A dry-run only. Merimen was not changed. Photos, dry run (Merimen not changed): would upload 78 · relabel 0 · reorder 0 Adjuster Report saved"), []));
test("photo and parts lines", () => {
  assert.deepEqual(merimenDone("Phase B: Photos: upload 0 · relabel 4 · reorder 2; Parts and labour: 12 parts; Estimate details set"), ["photosUp", "parts", "estimate"]);
  assert.deepEqual(merimenDone("Phase B stopped. Photos not touched: after the upload Merimen has 85 photos and 33 mismatches (plan 78)"), []);
});
test("a failed read is not read", () => assert.equal(flat(stepTasks({ status: "failed" }, [{ message: "Scan failed" }])), "docs:+-- photos:--- merimen:------- done:-"));
test("the workshop waits for Confirm", () => {
  assert.equal(flat(stepTasks({ status: "phase_a", deskTotal: 8, photosDone: true, wsAsk: true }, null)), "docs:+++ photos:+++ merimen:------- done:-");
  assert.equal(flat(stepTasks({ status: "phase_a", deskTotal: 8, photosDone: true, wsAsk: false }, null)), "docs:+++ photos:+++ merimen:+------ done:-");
});
