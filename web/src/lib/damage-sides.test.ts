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
test("overview and angle shots are not damage", () => {
  assert.deepEqual(sidesOf(["Front View", "Rear 45", "Left Side View", "Overview Front"]), []);
  assert.deepEqual(sidesOf(["Front View", "Bonnet"]), ["front"]);
});
test("Malay words, mixed case and separators; no match inside other words", () => {
  assert.deepEqual(sidesOf(["bumper depan", "PINTU KIRI", "Door-RH"]), ["front", "left", "right"]);
  assert.deepEqual(sidesOf(["Rightful", "Leftover", "Bright Trim"]), []);
});
test("every label key exists in EN, 中文 and BM", async () => {
  const { DICTS } = await import("./i18n");
  for (const k of ["dash.total", "dash.hit", "side.front", "side.rear", "side.left", "side.right", "side.none", "case.result"]) {
    for (const l of ["en", "zh", "ms"] as const) assert.ok(DICTS[l][k], `${l} ${k}`);
  }
});
