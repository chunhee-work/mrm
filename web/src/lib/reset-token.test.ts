import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { isLive, resetIdentifier, storedResetIdentifiers, tokenLooksRight } from "./reset-token";

test("B14 reset token: only a stored, unexpired token is live; junk is refused before the database is asked", () => {
  const now = new Date("2026-11-21T10:00:00Z");
  assert.equal(isLive(null, now), false);
  assert.equal(isLive({ expiresAt: new Date("2026-11-21T09:59:59Z") }, now), false);
  assert.equal(isLive({ expiresAt: new Date("2026-11-21T10:00:01Z") }, now), true);
  assert.equal(tokenLooksRight("bogus"), false);
  assert.equal(tokenLooksRight("x".repeat(129)), false);
  assert.equal(tokenLooksRight("aB3dE6gH9jK2mN5pQ8sT1vW4"), true);
  assert.equal(resetIdentifier("abc"), "reset-password:abc");
});

test("a reset token's row is looked up by the hash of its name first (as the auth server stores it), then by the plain name of an older link", () => {
  const [hashed, plain] = storedResetIdentifiers("aB3dE6gH9jK2mN5pQ8sT1vW4");
  assert.equal(plain, "reset-password:aB3dE6gH9jK2mN5pQ8sT1vW4");
  assert.equal(hashed, createHash("sha256").update(plain).digest("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""));
  assert.match(hashed, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(hashed.includes("aB3dE6gH9jK2mN5pQ8sT1vW4"), false);
});
