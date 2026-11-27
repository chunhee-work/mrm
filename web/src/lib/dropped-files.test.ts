import { test } from "node:test";
import assert from "node:assert/strict";
import { holdDropped, takeDropped } from "./dropped-files";

const f = (n: string) => new File(["x"], n);

test("files dropped on the first page are handed over once", () => {
  holdDropped([f("a.pdf")]);
  assert.deepEqual(takeDropped().map((x) => x.name), ["a.pdf"]);
  assert.equal(takeDropped().length, 0, "a second take gets nothing (StrictMode runs the effect twice)");
});

test("a second drop replaces the first", () => {
  holdDropped([f("a.pdf")]);
  holdDropped([f("b.pdf")]);
  assert.deepEqual(takeDropped().map((x) => x.name), ["b.pdf"]);
});

test("a hold not taken within 15 s is let go", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  holdDropped([f("late.pdf")]);
  t.mock.timers.tick(14_999);
  holdDropped([f("again.pdf")]); // a new drop starts a new 15 s
  t.mock.timers.tick(14_999);
  assert.deepEqual(takeDropped().map((x) => x.name), ["again.pdf"]);
  holdDropped([f("late.pdf")]);
  t.mock.timers.tick(15_000);
  assert.equal(takeDropped().length, 0, "nothing for a visit after 15 s");
});
