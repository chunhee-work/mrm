import test from "node:test";
import assert from "node:assert/strict";
import { orgSpend, _resetCache } from "./anthropic-admin";

const ok = (cents: string) => new Response(JSON.stringify({ data: [{ starting_at: "2026-11-14T00:00:00Z", ending_at: "2026-11-15T00:00:00Z", results: [{ amount: cents, currency: "USD" }] }], has_more: false }), { status: 200 });
const f = (r: () => Response | Promise<Response>) => (async () => r()) as unknown as typeof fetch;
const T = 1_000_000_000_000;

test("no key: not connected, no request", async () => {
  _resetCache();
  let called = false;
  const r = await orgSpend({ key: "", fetchImpl: f(() => { called = true; return ok("1"); }) });
  assert.equal(r.state, "not_connected"); assert.equal(called, false);
});
test("200 parses cents to USD and is cached for 60 s", async () => {
  _resetCache();
  let n = 0;
  const impl = f(() => { n++; return ok("1250"); });
  const a = await orgSpend({ key: "k", fetchImpl: impl, now: T });
  assert.equal(a.state, "ok"); assert.equal(a.state === "ok" && a.days[0].usd, 12.5);
  await orgSpend({ key: "k", fetchImpl: impl, now: T + 30_000 });
  assert.equal(n, 1);
  await orgSpend({ key: "k", fetchImpl: impl, now: T + 61_000 });
  assert.equal(n, 2);
});
for (const [status, text] of [[401, "Admin key rejected"], [403, "Admin key rejected"], [429, "retry later"], [500, "retry later"]] as const) {
  test(`${status}: unavailable, never throws`, async () => {
    _resetCache();
    const r = await orgSpend({ key: "k", fetchImpl: f(() => new Response("{}", { status })), now: T });
    assert.equal(r.state, "unavailable"); assert.ok(r.state === "unavailable" && r.reason.includes(text)); assert.equal(r.state === "unavailable" && r.staleAt, null);
  });
}
test("timeout and bad shape are unavailable", async () => {
  _resetCache();
  const t = await orgSpend({ key: "k", fetchImpl: f(() => { throw new Error("timeout"); }), now: T });
  assert.equal(t.state, "unavailable");
  const s = await orgSpend({ key: "k", fetchImpl: f(() => new Response(JSON.stringify({ nope: 1 }), { status: 200 })), now: T });
  assert.ok(s.state === "unavailable" && s.reason.includes("Unexpected"));
});
test("after a good answer, a failure shows the last good one (up to 1 h)", async () => {
  _resetCache();
  await orgSpend({ key: "k", fetchImpl: f(() => ok("100")), now: T });
  const r = await orgSpend({ key: "k", fetchImpl: f(() => new Response("", { status: 500 })), now: T + 120_000 });
  assert.ok(r.state === "unavailable" && r.staleAt === T && r.days?.length === 1);
  const old = await orgSpend({ key: "k", fetchImpl: f(() => new Response("", { status: 500 })), now: T + 2 * 3600_000 });
  assert.ok(old.state === "unavailable" && old.staleAt === null);
});
