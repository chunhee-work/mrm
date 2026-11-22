import test from "node:test";
import assert from "node:assert/strict";
import { ADMIN_KEY_MIN_LENGTH, ADMIN_SESSION_MAX_AGE_MS, adminKey, signSession, verifySession } from "./key";
import { clearFails, keyMatches, recordFail, resetThrottleForTests, throttled } from "./key-node";

const KEY = "k".repeat(ADMIN_KEY_MIN_LENGTH) + "-test-only";
const quiet = async (f: () => unknown) => { const e = console.error; console.error = () => {}; try { return await f(); } finally { console.error = e; } };

test("the key fails closed when missing or too short", async () => {
  await quiet(() => {
    assert.equal(adminKey(undefined), null);
    assert.equal(adminKey(""), null);
    assert.equal(adminKey("short"), null);
    assert.equal(adminKey("x".repeat(ADMIN_KEY_MIN_LENGTH - 1)), null);
  });
  assert.equal(adminKey(KEY), KEY);
});

test("keyMatches accepts only the exact key, whatever the length", () => {
  assert.equal(keyMatches(KEY, KEY), true);
  assert.equal(keyMatches(KEY + "x", KEY), false);
  assert.equal(keyMatches(KEY.slice(0, -1), KEY), false);
  assert.equal(keyMatches("", KEY), false);
  assert.equal(keyMatches(KEY.toUpperCase(), KEY), false);
});

test("a session cookie verifies, expires after 12 h, and never contains the key", async () => {
  const now = Date.parse("2026-11-22T00:00:00Z");
  const t = await signSession(KEY, now);
  assert.equal(t.includes(KEY), false);
  assert.equal(await verifySession(t, KEY, now + 1000), true);
  assert.equal(await verifySession(t, KEY, now + ADMIN_SESSION_MAX_AGE_MS - 1), true);
  assert.equal(await verifySession(t, KEY, now + ADMIN_SESSION_MAX_AGE_MS + 1), false);
});

test("forged, tampered, empty or other-key cookies are refused", async () => {
  const now = Date.now();
  const t = await signSession(KEY, now);
  const [v, exp, mac] = t.split(".");
  assert.equal(await verifySession(undefined, KEY, now), false);
  assert.equal(await verifySession("", KEY, now), false);
  assert.equal(await verifySession("garbage", KEY, now), false);
  assert.equal(await verifySession(t, null, now), false); // no key configured
  assert.equal(await verifySession(t, KEY + "2", now), false); // key was changed: everyone is signed out
  assert.equal(await verifySession(`${v}.${Number(exp) + 3600_000}.${mac}`, KEY, now), false); // expiry stretched
  assert.equal(await verifySession(`${v}.${exp}.${"0".repeat(64)}`, KEY, now), false);
  assert.equal(await verifySession(`${v}.${now + 10 * ADMIN_SESSION_MAX_AGE_MS}.${mac}`, KEY, now), false);
});

test("five wrong keys lock a visitor for 15 minutes; a right key clears it", () => {
  resetThrottleForTests();
  const t0 = 1_000_000;
  for (let i = 0; i < 4; i++) recordFail("1.2.3.4", t0 + i);
  assert.equal(throttled("1.2.3.4", t0 + 10), false);
  recordFail("1.2.3.4", t0 + 5);
  assert.equal(throttled("1.2.3.4", t0 + 10), true);
  assert.equal(throttled("5.6.7.8", t0 + 10), false);
  assert.equal(throttled("1.2.3.4", t0 + 16 * 60_000), false);
  recordFail("9.9.9.9", t0); clearFails("9.9.9.9");
  assert.equal(throttled("9.9.9.9", t0), false);
});
