import { test } from "node:test";
import assert from "node:assert/strict";
import { keepOrder } from "./line-order";

const rows = (...ids: string[]) => ids.map((id) => ({ id }));
const ids = (r: { id: string }[]) => r.map((x) => x.id).join(" ");

test("D8 a line is open: the lines on screen keep their places, whatever the fresh order says", () => {
  assert.equal(ids(keepOrder(rows("a", "b", "c"), ["c", "a", "b"])), "c a b");
});

test("D8 a case made while a line is open goes where a fresh page shows it, not to the bottom", () => {
  // fresh page: NEW first, then a, b, c
  assert.equal(ids(keepOrder(rows("NEW", "a", "b", "c"), ["a", "b", "c"])), "NEW a b c");
  // in the middle of the fresh order: in front of the line that follows it there
  assert.equal(ids(keepOrder(rows("a", "NEW", "b", "c"), ["c", "b", "a"])), "c NEW b a");
  // two new ones keep their own order; the last of the fresh page stays last
  assert.equal(ids(keepOrder(rows("N1", "N2", "a", "b", "N3"), ["b", "a"])), "b N1 N2 a N3");
});

test("D8 a case that left the list is dropped; the open line a search hides keeps its place", () => {
  assert.equal(ids(keepOrder(rows("a", "c"), ["a", "b", "c"])), "a c");
  assert.equal(ids(keepOrder(rows("NEW", "c"), ["a", "b", "c"], rows("b"))), "b NEW c");
  assert.equal(ids(keepOrder(rows("a"), ["a"], rows("x"))), "a x");
});
