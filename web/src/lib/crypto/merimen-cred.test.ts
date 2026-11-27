import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { cleanPassword, cleanSecret, masterKey, seal, usernameHint } from "./merimen-cred";

test("a sealed login does not contain the user name or the password", () => {
  const key = randomBytes(32);
  const sealed = seal(key, "org-1", "workshop.user", "correct-horse");
  const blob = JSON.stringify(sealed);
  assert.equal(blob.includes("workshop.user"), false);
  assert.equal(blob.includes("correct-horse"), false);
  assert.equal(sealed.usernameHint, "wo…");
  assert.equal(usernameHint("ab"), "••");
});

test("the master key must be 32 bytes", () => {
  assert.equal(masterKey(undefined), null);
  assert.equal(masterKey(Buffer.from("short").toString("base64")), null);
  assert.ok(masterKey(randomBytes(32).toString("base64")));
});

test("secrets reject empty and control characters", () => {
  assert.equal(cleanSecret("  ok  ", 10), "ok");
  assert.equal(cleanSecret("a\nb", 10), "ab");
  assert.equal(cleanSecret("", 10), null);
  assert.equal(cleanSecret(12, 10), null);
});

test("cleanPassword keeps spaces, refuses control characters and long input", () => {
  assert.equal(cleanPassword(" pa ss ", 200), " pa ss ");
  assert.equal(cleanPassword("a\nb", 200), null);
  assert.equal(cleanPassword("", 200), null);
  assert.equal(cleanPassword("x".repeat(201), 200), null);
  assert.equal(cleanPassword(5, 200), null);
});
