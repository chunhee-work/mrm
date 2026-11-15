import test from "node:test";
import assert from "node:assert/strict";
import { decideGate, envOn } from "./gate";
import { newCode, hashCode, codeUsable, cleanFirmLabel, CODE_ALPHABET, CODE_LENGTH, CODE_TTL_MS, MAX_ATTEMPTS_PER_CODE, hourBucket, isUniqueViolation } from "./pairing";

const on = { enabled: true, consentReference: "MERIMEN-2026-001" };

test("env switch unset or anything but 'on': always off", () => {
  for (const v of [undefined, "", "1", "true", "ON", "off"]) assert.equal(envOn({ EXT_CONNECT: v }), false, String(v));
  assert.equal(envOn({ EXT_CONNECT: "on" }), true);
});
test("env off: disabled even with an enabled org, a consent reference and a consent record", () => {
  assert.equal(decideGate({ envOn: false, setting: on, consented: true }), "off");
});
test("org not set up, or switched off: disabled", () => {
  assert.equal(decideGate({ envOn: true, setting: null, consented: true }), "off");
  assert.equal(decideGate({ envOn: true, setting: undefined, consented: true }), "off");
  assert.equal(decideGate({ envOn: true, setting: { enabled: false, consentReference: "x" }, consented: true }), "off");
});
test("flag on without a consent reference stays disabled", () => {
  for (const ref of [null, "", "   "]) assert.equal(decideGate({ envOn: true, setting: { enabled: true, consentReference: ref }, consented: true }), "off");
});
test("enabled with a reference: customer must acknowledge first, then ready", () => {
  assert.equal(decideGate({ envOn: true, setting: on, consented: false }), "needs_consent");
  assert.equal(decideGate({ envOn: true, setting: on, consented: true }), "ready");
});

test("pairing code: 8 characters from the unambiguous alphabet, and different every time", () => {
  const seen = new Set<string>();
  for (let i = 0; i < 200; i++) {
    const c = newCode();
    assert.equal(c.length, CODE_LENGTH);
    for (const ch of c) assert.ok(CODE_ALPHABET.includes(ch), c);
    seen.add(c);
  }
  assert.ok(seen.size > 190);
  assert.ok(!/[01OIL]/.test(CODE_ALPHABET));
});
test("pairing code is stored hashed and matches regardless of case and spaces", () => {
  const c = "ABCD2345";
  assert.notEqual(hashCode(c), c);
  assert.equal(hashCode(c), hashCode(" abcd2345 "));
  assert.notEqual(hashCode(c), hashCode("ABCD2346"));
});
test("a code is usable once, for 10 minutes, and for 5 wrong tries", () => {
  const now = new Date("2026-11-15T12:00:00Z");
  const fresh = { usedAt: null, expiresAt: new Date(now.getTime() + CODE_TTL_MS), attempts: 0 };
  assert.equal(codeUsable(fresh, now), true);
  assert.equal(codeUsable({ ...fresh, usedAt: now }, now), false);
  assert.equal(codeUsable({ ...fresh, expiresAt: new Date(now.getTime() - 1) }, now), false);
  assert.equal(codeUsable({ ...fresh, attempts: MAX_ATTEMPTS_PER_CODE - 1 }, now), true);
  assert.equal(codeUsable({ ...fresh, attempts: MAX_ATTEMPTS_PER_CODE }, now), false);
});
test("firm label: optional, 80 characters at most, control characters removed, never a non-string", () => {
  assert.equal(cleanFirmLabel(undefined), null);
  assert.equal(cleanFirmLabel(42), null);
  assert.equal(cleanFirmLabel("   "), null);
  assert.equal(cleanFirmLabel("Ah Seng\n\tAdjusters"), "Ah Seng Adjusters");
  assert.equal(cleanFirmLabel("x".repeat(200))?.length, 80);
});

test("rate-limit window is the clock hour, and unique violations are recognised however they are wrapped", () => {
  const h = Date.UTC(2026, 10, 15, 12, 0, 0);
  assert.equal(hourBucket(h), hourBucket(h + 3599_999));
  assert.equal(hourBucket(h) + 1, hourBucket(h + 3600_000));
  assert.equal(isUniqueViolation({ code: "23505" }), true);
  assert.equal(isUniqueViolation({ cause: { code: "23505" } }), true);
  assert.equal(isUniqueViolation({ code: "23503" }), false);
  assert.equal(isUniqueViolation(null), false);
});
