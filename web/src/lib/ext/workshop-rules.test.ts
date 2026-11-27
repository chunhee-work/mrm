import test from "node:test";
import assert from "node:assert/strict";
import { canSwitchWorkshop } from "./workshop-rules";

test("a case can change workshop until it has its Merimen number, whatever its status", () => {
  for (const status of ["uploaded", "reading", "naming", "pending_doc", "failed", "phase_a", "waiting_user", "phase_b"]) assert.equal(canSwitchWorkshop({ status, merimenCaseId: null }), true, status);
  assert.equal(canSwitchWorkshop({ status: "naming", merimenCaseId: "123" }), false);
  assert.equal(canSwitchWorkshop({ status: "done", merimenCaseId: "123" }), false);
});
