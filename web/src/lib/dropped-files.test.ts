import { test } from "node:test";
import assert from "node:assert/strict";
import { holdDropped, takeDropped } from "./dropped-files";

const f = (n: string) => new File(["x"], n);

test("files dropped on the first page are handed over once", () => {
  holdDropped([f("a.pdf")], 1000);
  assert.deepEqual(takeDropped(2000).map((x) => x.name), ["a.pdf"]);
  assert.equal(takeDropped(2000).length, 0, "a second take gets nothing (StrictMode runs the effect twice)");
});

test("files held too long are thrown away, so a later New case never gets another claim's files", () => {
  holdDropped([f("a.pdf")], 1000);
  assert.equal(takeDropped(1000 + 16_000).length, 0);
  assert.equal(takeDropped(1000 + 16_000).length, 0, "and they are gone");
});

test("a second drop replaces the first", () => {
  holdDropped([f("a.pdf")], 1000);
  holdDropped([f("b.pdf")], 1100);
  assert.deepEqual(takeDropped(1200).map((x) => x.name), ["b.pdf"]);
});
