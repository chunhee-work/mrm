import { test } from "node:test";
import assert from "node:assert/strict";
import { TODO, openItems, type TodoGroup } from "./todo";

const all = TODO.flatMap((g) => g.items);

test("to-do ids are unique", () => {
  assert.equal(new Set(all.map((i) => i.id)).size, all.length);
  assert.equal(new Set(TODO.map((g) => g.id)).size, TODO.length);
});

test("every to-do says what to do and why", () => {
  for (const i of all) {
    assert.ok(i.title.trim().length > 5, i.id);
    assert.ok(i.note.trim().length > 10, i.id);
  }
});

test("only open to-dos are counted", () => {
  const groups: TodoGroup[] = [{ id: "g", title: "G", items: [
    { id: "a", title: "A thing", note: "why it matters", who: "you" },
    { id: "b", title: "B thing", note: "why it matters", who: "build", done: true },
  ] }];
  assert.deepEqual(openItems(groups).map((i) => i.id), ["a"]);
});
