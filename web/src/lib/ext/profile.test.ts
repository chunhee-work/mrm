import test from "node:test";
import assert from "node:assert/strict";
import { cleanProfile, cleanText, profileComplete } from "./profile";

test("a profile needs all three names", () => {
  assert.deepEqual(cleanProfile({ workshop: " Bengkel  Ali ", manager: "Ali", adjuster: "Siti" }), { workshop: "Bengkel Ali", manager: "Ali", adjuster: "Siti" });
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
