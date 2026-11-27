import test from "node:test";
import assert from "node:assert/strict";
import { canSwitchWorkshop } from "./workshop-rules";

test("a case can change workshop only before it is made in Merimen", () => {
  for (const status of ["uploaded", "reading", "naming", "pending_doc", "failed"]) assert.equal(canSwitchWorkshop({ status, merimenCaseId: null }), true, status);
  for (const status of ["phase_a", "waiting_user", "phase_b", "checking", "done"]) assert.equal(canSwitchWorkshop({ status, merimenCaseId: null }), false, status);
  assert.equal(canSwitchWorkshop({ status: "naming", merimenCaseId: "123" }), false);
});
