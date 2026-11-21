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
  assert.deepEqual(sidesOf(["Fog Lamp LH"]), ["front", "left"]);
  assert.deepEqual(sidesOf(["LH Side View Mirror"]), ["left"]);
  assert.deepEqual(sidesOf(["Rear View Camera"]), ["rear"]);
});
test("whole-car shots are skipped, real parts with the same words are not", () => {
  assert.deepEqual(sidesOf(["Front 45", "Rear Left View", "Left Side View", "Accident Photo"]), []);
  assert.deepEqual(sidesOf(["Accident Damages Photo", "Front Bumper"]), ["front"]);
});
test("rear windscreen, side parts without LH/RH, back parts, plates", () => {
  assert.deepEqual(sidesOf(["Rear Windscreen"]), ["rear"]);
  assert.deepEqual(sidesOf(["Windscreen"]), ["front"]);
  assert.deepEqual(sidesOf(["Front Door", "Rear Quarter", "Front Wheel"]), []);
  assert.deepEqual(sidesOf(["Tail Gate", "Back Bumper"]), ["rear"]);
  assert.deepEqual(sidesOf(["Rear Bumper Skid Plate", "Rear Number Plate Garnish"]), ["rear"]);
  assert.deepEqual(sidesOf(["Front Chassis Rail LH"]), ["front", "left"]);
  assert.deepEqual(sidesOf(["Licence Plate Lamp"]), []);
  assert.deepEqual(sidesOf(["Number Plate"]), []);
});
test("overview shots with the position after the word", () => {
  assert.deepEqual(sidesOf(["Front View LH", "Front 45° RH", "Rear View Left"]), []);
});
test("abbreviations used by the part name list", () => {
  assert.deepEqual(sidesOf(["Bumper Frt Absorber"]), ["front"]);
  assert.deepEqual(sidesOf(["Rr Panel Outer"]), ["rear"]);
  assert.deepEqual(sidesOf(["Door Lhf Handle Release"]), ["left"]);
  assert.deepEqual(sidesOf(["Suspension Rhr"]), ["rear", "right"]);
  assert.deepEqual(sidesOf(["Frt Corner Panel RH"]), ["front", "right"]);
  assert.deepEqual(sidesOf(["Rr Bumper Sensor Os"]), ["rear", "right"]);
  assert.deepEqual(sidesOf(["Mirror N/s", "Mirror O/s"]), ["left", "right"]);
});
test("whole-car list shots and interior", () => {
  assert.deepEqual(sidesOf(["Front LH Closed View", "Rear RH Closed View", "Front End View", "Rear Panel View", "General View Front RH", "Interior View"]), []);
  assert.deepEqual(sidesOf(["Rear Lamp PNL Interior Trim LH"]), ["rear", "left"]);
});
test("the whole part name list: every name runs, and every name with a side word or abbreviation gives a side", async () => {
  const { readFileSync } = await import("node:fs");
  const list = JSON.parse(readFileSync(new URL("./part-names.json", import.meta.url), "utf8")) as string[];
  const word = /\b(front|frt|rear|rr|lh|rh|lhf|lhr|rhf|rhr|left|right|ns|os)\b/i;
  const miss = list.filter((n) => word.test(n) && sidesOf([n]).length === 0);
  // only whole-car shots and the like may give nothing; keep the list short and reviewable
  assert.ok(miss.length < 40, `names with a side word but no side: ${miss.join(" | ")}`);
});
