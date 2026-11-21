import test from "node:test";
import assert from "node:assert/strict";
import { sidesOf } from "./damage-sides";

test("front and rear words", () => {
  assert.deepEqual(sidesOf(["Front Bumper", "Bonnet"]), ["front"]);
  assert.deepEqual(sidesOf(["Rear Bumper", "Tail Lamp LH"]), ["rear", "left"]);
});
test("LH and RH are left and right, all sides listed in a fixed order", () => {
  assert.deepEqual(sidesOf(["RH Rear Door", "Headlamp LH", "Bonnet"]), ["front", "rear", "left", "right"]);
});
test("names without a side, empty names and documents add nothing", () => {
  assert.deepEqual(sidesOf(["Battery", "", null, undefined, "Accident Photo", "Rear Seat", "Odometer"]), []);
});
