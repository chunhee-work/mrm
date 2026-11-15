import test from "node:test";
import assert from "node:assert/strict";
import { adminEmails, internalEmails, isAdmin, missingConfig, parseEmailList, REQUIRED_CONFIG } from "./config";

test("parseEmailList trims, lowercases, dedupes and drops empties", () => {
  assert.deepEqual(parseEmailList("  A@x.com, a@X.com ,, b@y.com ").emails, ["a@x.com", "b@y.com"]);
  assert.equal(parseEmailList("a@x.com").valid, true);
  assert.equal(parseEmailList("a@x.com, nope").valid, false);
});
test("ADMIN_EMAILS fails closed when missing, empty or malformed", () => {
  const e = console.error; console.error = () => {};
  try {
    assert.deepEqual(adminEmails(undefined), []);
    assert.deepEqual(adminEmails(""), []);
    assert.deepEqual(adminEmails("owner@x.com, broken"), []);
    assert.deepEqual(adminEmails(" Owner@X.com "), ["owner@x.com"]);
  } finally { console.error = e; }
});
test("internalEmails always holds the smoke account plus admins and extras", () => {
  const l = internalEmails("Owner@x.com", "tester@x.com");
  assert.ok(l.includes("smoke-tester@autoclaim.invalid") && l.includes("owner@x.com") && l.includes("tester@x.com"));
  assert.deepEqual(internalEmails(undefined, undefined), ["smoke-tester@autoclaim.invalid"]);
});
test("isAdmin needs listed + verified + session younger than 12 h", () => {
  const now = Date.parse("2026-11-15T12:00:00Z");
  const base = { email: "Owner@x.com", emailVerified: true, sessionCreatedAt: new Date(now - 3600_000), now, adminRaw: "owner@x.com" };
  assert.equal(isAdmin(base), true);
  assert.equal(isAdmin({ ...base, email: "other@x.com" }), false);
  assert.equal(isAdmin({ ...base, emailVerified: false }), false);
  assert.equal(isAdmin({ ...base, sessionCreatedAt: new Date(now - 13 * 3600_000) }), false);
});
test("health only ever names the fixed setting list", () => {
  assert.deepEqual(missingConfig({}), [...REQUIRED_CONFIG]);
  assert.deepEqual(missingConfig({ DATABASE_URL: "x", SOMETHING_ELSE: "y" }).includes("SOMETHING_ELSE" as never), false);
});
