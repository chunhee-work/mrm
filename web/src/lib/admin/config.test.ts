import test from "node:test";
import assert from "node:assert/strict";
import { internalEmails, missingConfig, parseEmailList, REQUIRED_CONFIG } from "./config";

test("parseEmailList trims, lowercases, dedupes and drops empties", () => {
  assert.deepEqual(parseEmailList("  A@x.com, a@X.com ,, b@y.com ").emails, ["a@x.com", "b@y.com"]);
  assert.equal(parseEmailList("a@x.com").valid, true);
  assert.equal(parseEmailList("a@x.com, nope").valid, false);
});
test("internalEmails always holds the smoke account plus admins and extras", () => {
  const l = internalEmails("Owner@x.com", "tester@x.com");
  assert.ok(l.includes("smoke-tester@autoclaim.invalid") && l.includes("owner@x.com") && l.includes("tester@x.com"));
  assert.deepEqual(internalEmails(undefined, undefined), ["smoke-tester@autoclaim.invalid"]);
});
test("health only ever names the fixed setting list", () => {
  assert.deepEqual(missingConfig({}), [...REQUIRED_CONFIG]);
  assert.deepEqual(missingConfig({ DATABASE_URL: "x", SOMETHING_ELSE: "y" }).includes("SOMETHING_ELSE" as never), false);
});
