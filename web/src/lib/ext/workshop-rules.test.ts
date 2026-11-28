import test from "node:test";
import assert from "node:assert/strict";
import { canSwitchWorkshop, workshopState } from "./workshop-rules";

test("a case can change workshop until it has its Merimen number, whatever its status", () => {
  for (const status of ["uploaded", "reading", "naming", "pending_doc", "failed", "phase_a", "waiting_user", "phase_b"]) assert.equal(canSwitchWorkshop({ status, merimenCaseId: null }), true, status);
  assert.equal(canSwitchWorkshop({ status: "naming", merimenCaseId: "123" }), false);
  assert.equal(canSwitchWorkshop({ status: "done", merimenCaseId: "123" }), false);
});

test("workshop: chosen freely until Confirm, then fixed; a removed workshop can be replaced and confirmed again", () => {
  const list = [{ slot: 1 }, { slot: 2 }];
  const base = { slot: 2, locked: false, fixed: false, confirmed: false };
  assert.deepEqual(workshopState(base, list, null), { slot: 2, locked: false, confirmed: false, needsConfirm: true });
  assert.deepEqual(workshopState({ ...base, confirmed: true }, list, null), { slot: 2, locked: true, confirmed: true, needsConfirm: false });
  // the confirmed workshop was removed since: the case can be moved (then it asks for Confirm again)
  assert.equal(workshopState({ ...base, slot: 3, confirmed: true }, list, null).locked, false);
  // made in Merimen, or fixed by the worker: never changeable, and nothing left to confirm
  assert.deepEqual(workshopState(base, list, "M1"), { slot: 2, locked: true, confirmed: false, needsConfirm: false });
  assert.equal(workshopState({ ...base, locked: true, fixed: true }, list, null).needsConfirm, false);
  // a case finished (by hand) never asks
  assert.equal(workshopState(base, list, null, "done").needsConfirm, false);
});
