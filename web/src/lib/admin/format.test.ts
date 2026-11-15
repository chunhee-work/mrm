import { test } from "node:test";
import assert from "node:assert/strict";
import { ago, day, usd, when, words } from "./format";

test("money is written to the cent", () => {
  assert.equal(usd(0.94), "$0.94");
  assert.equal(usd(0.9625), "$0.96");
  assert.equal(usd(1234.5), "$1,234.50");
  assert.equal(usd(0), "$0");
  assert.equal(usd(0.001), "<$0.01");
  assert.equal(usd(null), "no price");
});

test("times are Malaysia time, short", () => {
  assert.equal(when("2026-11-14T21:21:00.000Z"), "15 Nov, 05:21");
  assert.equal(when(null), "–");
  assert.equal(day("2026-10-17"), "17 Oct");
});

test("last seen counts back from now", () => {
  const now = Date.parse("2026-11-15T12:00:00Z");
  assert.equal(ago(null, now), "Never");
  assert.equal(ago("2026-11-15T11:59:50Z", now), "Just now");
  assert.equal(ago("2026-11-15T11:15:00Z", now), "45 min ago");
  assert.equal(ago("2026-11-15T02:00:00Z", now), "10 h ago");
  assert.equal(ago("2026-11-09T12:00:00Z", now), "6 d ago");
  assert.equal(ago("2026-09-01T00:00:00Z", now), "1 Sept, 08:00");
});

test("database codes read as words", () => {
  assert.equal(words("read_docs"), "Read docs");
  assert.equal(words("bad_json"), "Bad json");
  assert.equal(words(null), "–");
});
