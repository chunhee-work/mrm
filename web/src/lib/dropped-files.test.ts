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
