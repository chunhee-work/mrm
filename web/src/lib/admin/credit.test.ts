import test from "node:test";
import assert from "node:assert/strict";
import { creditLeft, creditPeriod } from "./credit";

const cfg = { total: 200, resetDay: 20 };
test("period starts on the last reset day", () => {
  assert.deepEqual(creditPeriod(new Date("2026-11-27T05:00:00Z"), 20), { since: "2026-11-20", renews: "2026-12-20" });
  assert.deepEqual(creditPeriod(new Date("2026-11-20T00:00:00Z"), 20), { since: "2026-11-20", renews: "2026-12-20" });
  assert.deepEqual(creditPeriod(new Date("2026-11-19T23:59:00Z"), 20), { since: "2026-10-20", renews: "2026-11-20" });
  assert.deepEqual(creditPeriod(new Date("2027-01-05T00:00:00Z"), 20), { since: "2026-12-20", renews: "2027-01-20" });
});
test("counts only days inside this period", () => {
  const c = creditLeft([{ date: "2026-11-19", usd: 56 }, { date: "2026-11-21", usd: 1.5 }, { date: "2026-11-27", usd: 1.14 }], new Date("2026-11-27T08:00:00Z"), cfg);
  assert.equal(+c.used.toFixed(2), 2.64); assert.equal(+c.left.toFixed(2), 197.36); assert.equal(c.since, "2026-11-20");
});
test("never below zero", () => {
  assert.equal(creditLeft([{ date: "2026-11-25", usd: 500 }], new Date("2026-11-27T00:00:00Z"), cfg).left, 0);
});
