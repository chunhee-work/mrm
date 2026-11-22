import { test } from "node:test";
import assert from "node:assert/strict";
import { loginUrl, safeNext } from "./next-path";

test("hard test: after logging in, a signed-out link to a case comes back to that case", () => {
  assert.equal(safeNext("/cases/abc-123"), "/cases/abc-123");
  assert.equal(safeNext("/cases/abc-123/photos?tab=edited"), "/cases/abc-123/photos?tab=edited");
  assert.equal(safeNext("/settings"), "/settings");
  assert.equal(loginUrl("/cases/abc/photos"), "/login?next=%2Fcases%2Fabc%2Fphotos");
  assert.equal(loginUrl("/dashboard"), "/login");
});

test("next never leaves the app or points at a page without an account", () => {
  for (const bad of ["//evil.example/x", "https://evil.example/cases/1", "/\\evil.example", "/login", "/", "/admin", "javascript:alert(1)", "", null, undefined, "/cases/" + "x".repeat(600), "/%2F%2Fevil.example"])
    assert.equal(safeNext(bad as string), null, String(bad));
  assert.equal(loginUrl("/admin"), "/login");
});
