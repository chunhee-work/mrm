import { test } from "node:test";
import assert from "node:assert/strict";
import { logWhen, whenOf } from "./fmt-when";

// Malaysia is UTC+8: 2026-11-27 02:00 UTC is 10:00 on the 27th there
const now = new Date("2026-11-27T02:00:00Z");

test("D16 activity time: today shows the hour only", () => {
  assert.equal(logWhen("2026-11-27T01:05:00Z", "en", now), "09:05");
  // 16:30 UTC the day before is already 00:30 today in Malaysia
  assert.equal(logWhen("2026-11-26T16:30:00Z", "en", now), "00:30");
});

test("D16 activity time: another day says which day, in the page language", () => {
  assert.equal(logWhen("2026-11-21T15:44:00Z", "en", now), "21 Nov, 23:44");
  assert.equal(logWhen("2026-11-21T15:44:00Z", "ms", now), "21 Nov, 23:44");
  assert.equal(logWhen("2026-11-21T15:44:00Z", "zh", now), "11月21日 23:44");
  // 15:59 UTC on the 26th is 23:59 on the 26th in Malaysia: yesterday, although less than a day ago
  assert.equal(logWhen("2026-11-26T15:59:00Z", "en", now), "26 Nov, 23:59");
});

test("D16 activity time: another year shows the full date", () => {
  assert.equal(logWhen("2025-12-31T10:00:00Z", "en", now), whenOf("2025-12-31T10:00:00Z", "en"));
  assert.match(logWhen("2025-12-31T10:00:00Z", "en", now), /2025/);
});
