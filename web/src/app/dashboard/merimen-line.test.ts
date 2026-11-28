import { test } from "node:test";
import assert from "node:assert/strict";
import { merimenLine } from "./merimen-line";

test("the other car's plate and the at-fault insurer come from the extracted documents", () => {
  assert.deepEqual(merimenLine({ at_fault: { plate: "TDG1378", policy: { insurer: "Allianz General Insurance Company (Malaysia) Berhad" } }, client_policy: { insurer: "Zurich" } }),
    { tpPlate: "TDG1378", tpInsurer: "Allianz General Insurance Company (Malaysia) Berhad" });
});
test("no at-fault plate: the police report's blamed plate", () => {
  assert.deepEqual(merimenLine({ police: { blamed_plate: " VQY1950 " } }), { tpPlate: "VQY1950", tpInsurer: null });
});
test("nothing read yet, or odd values: nulls, never a crash", () => {
  assert.deepEqual(merimenLine(null), { tpPlate: null, tpInsurer: null });
  assert.deepEqual(merimenLine({ at_fault: { plate: "", policy: "x" }, police: [] }), { tpPlate: null, tpInsurer: null });
});
