import { test } from "node:test";
import assert from "node:assert/strict";
import { credForSide } from "./side-facts";

test("side bar: details that cannot be read (or no key) are unknown, so no dot", () => {
  const c = { storageOk: true, keyOk: true, complete: false };
  assert.equal(credForSide(c), c);
  assert.equal(credForSide({ ...c, storageOk: false }), null);
  assert.equal(credForSide({ ...c, keyOk: false }), null);
});
