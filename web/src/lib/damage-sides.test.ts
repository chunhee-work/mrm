import test from "node:test";
import assert from "node:assert/strict";
import { sidesOf } from "./damage-sides";

test("front and rear words", () => {
  assert.deepEqual(sidesOf(["Front Bumper", "Bonnet"]), ["front"]);
  assert.deepEqual(sidesOf(["Rear Bumper", "Tail Lamp LH"]), ["rear", "left"]);
});
test("LH and RH are left and right, all sides listed in a fixed order", () => {
  assert.deepEqual(sidesOf(["Rear Bumper", "Headlamp LH", "Bonnet", "Door RH"]), ["front", "rear", "left", "right"]);
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
  for (const k of ["dash.total", "dash.hit", "side.front", "side.rear", "side.left", "side.right", "side.none", "side.unavailable", "case.result"]) {
    for (const l of ["en", "zh", "ms"] as const) assert.ok(DICTS[l][k], `${l} ${k}`);
  }
});
test("a position word on a side part is not an end: door swipe is left/right only", () => {
  assert.deepEqual(sidesOf(["RH Rear Door", "RH Front Fender", "RH Rear Quarter"]), ["right"]);
  assert.deepEqual(sidesOf(["LH Front Door", "Front Wheel LH"]), ["left"]);
});
test("fog lamps and mirrors", () => {
  assert.deepEqual(sidesOf(["Rear Fog Lamp"]), ["rear"]);
  assert.deepEqual(sidesOf(["LH Side View Mirror"]), ["left"]);
  assert.deepEqual(sidesOf(["Rear View Camera"]), ["rear"]);
});
test("whole-car shots are skipped, real parts with the same words are not", () => {
  assert.deepEqual(sidesOf(["Front 45", "Rear Left View", "Left Side View", "Accident Photo"]), []);
  assert.deepEqual(sidesOf(["Accident Damages Photo", "Front Bumper"]), ["front"]);
});
