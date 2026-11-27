import test from "node:test";
import assert from "node:assert/strict";
import { cleanProfile, cleanText, cleanWorkshops, profileComplete } from "./profile";

test("a profile needs all three names", () => {
  assert.deepEqual(cleanProfile({ workshop: " Bengkel  Ali ", manager: "Ali", adjuster: "Siti" }), { workshops: [{ slot: 1, name: "Bengkel Ali" }], workshop: "Bengkel Ali", manager: "Ali", adjuster: "Siti" });
  assert.equal(cleanProfile({ workshop: "A", manager: "", adjuster: "C" }), null);
  assert.equal(cleanProfile({ workshop: "A", manager: "B" }), null);
  assert.equal(cleanProfile(null), null);
});
test("text is cleaned and capped", () => {
  assert.equal(cleanText("a\u0000b"), "a b");
  assert.equal(cleanText("x".repeat(121)), null);
  assert.equal(cleanText(5), null);
});
test("complete means login saved and every name filled", () => {
  assert.equal(profileComplete({ saved: true, workshop: "W", manager: "M", adjuster: "A" }), true);
  assert.equal(profileComplete({ saved: false, workshop: "W", manager: "M", adjuster: "A" }), false);
  assert.equal(profileComplete({ saved: true, workshop: "W", manager: " ", adjuster: "A" }), false);
  assert.equal(profileComplete({ saved: true, workshop: null, manager: "M", adjuster: "A" }), false);
});

test("up to three workshops, workshop 1 required, slots unique, names different", () => {
  assert.deepEqual(cleanWorkshops({ workshops: [{ slot: 2, name: "B" }, { slot: 1, name: "A" }, { slot: 3, name: " " }] }), [{ slot: 1, name: "A" }, { slot: 2, name: "B" }]);
  assert.equal(cleanWorkshops({ workshops: [{ slot: 2, name: "B" }] }), null); // no workshop 1
  assert.equal(cleanWorkshops({ workshops: [{ slot: 1, name: "A" }, { slot: 1, name: "B" }] }), null); // slot twice
  assert.equal(cleanWorkshops({ workshops: [{ slot: 1, name: "A" }, { slot: 2, name: "a" }] }), null); // same name
  assert.equal(cleanWorkshops({ workshops: [{ slot: 4, name: "D" }, { slot: 1, name: "A" }] }), null); // slot out of range
  assert.equal(cleanWorkshops({ workshops: [1, 2, 3, 4].map((slot) => ({ slot, name: `W${slot}` })) }), null); // four
  assert.equal(cleanWorkshops({ workshops: [{ slot: 1, name: "A" }, { slot: 2, name: "x".repeat(121) }] }), null); // too long is refused, not dropped
  assert.equal(profileComplete({ saved: true, workshops: [{ slot: 2, name: "B" }], manager: "M", adjuster: "A" }), false);
  assert.equal(profileComplete({ saved: true, workshops: [{ slot: 1, name: "A" }], manager: "M", adjuster: "A" }), true);
});
