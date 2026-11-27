import test from "node:test";
import assert from "node:assert/strict";
import { orgSpend, hintMatches, _resetCache } from "./anthropic-admin";

const T = Date.parse("2026-11-27T10:00:00Z");
const row = (day: string, key: string | null, cents: string) => ({ starting_at: `${day}T00:00:00Z`, ending_at: `${day}T23:59:59Z`, group: { api_key_id: key, model: "m" }, cost: { currency: "USD", amount: cents } });
const analytics = (rows: unknown[], extra: object = {}) => new Response(JSON.stringify({ data: rows, has_more: false, data_refreshed_at: "2026-11-27T08:00:00Z", ...extra }), { status: 200 });
const keysOk = () => new Response(JSON.stringify({ data: [{ id: "apikey_app", name: "autopilot app", partial_key_hint: "sk-ant-api03-Abc...WXYZ" }, { id: "apikey_other", name: "dev", partial_key_hint: "sk-ant-api03-Zzz...1234" }] }), { status: 200 });
type Handler = (url: string) => Response | Promise<Response>;
const f = (h: Handler) => (async (u: string) => h(String(u))) as unknown as typeof fetch;
const APP = "sk-ant-api03-Abc-middle-part-WXYZ";

test("no key: not connected, no request", async () => {
  _resetCache();
  let called = false;
  const r = await orgSpend({ key: "", fetchImpl: f(() => { called = true; return analytics([]); }) });
  assert.equal(r.state, "not_connected"); assert.equal(called, false);
});

test("splits spend per API key, converts cents, finds the app's own key, today's share, refresh time", async () => {
  _resetCache();
  const r = await orgSpend({ key: "k", appKey: APP, now: T, fetchImpl: f((u) => u.includes("/analytics/cost") ? analytics([
    row("2026-11-26", "apikey_app", "1000"), row("2026-11-27", "apikey_app", "250"), row("2026-11-27", "apikey_other", "50"), row("2026-11-26", null, "10"),
  ]) : keysOk()) });
  assert.equal(r.state, "ok");
  if (r.state !== "ok") return;
  assert.equal(r.split, true);
  assert.equal(r.refreshedAt, "2026-11-27T08:00:00Z");
  assert.deepEqual(r.days.map((d) => [d.date, +d.usd.toFixed(2)]), [["2026-11-26", 10.1], ["2026-11-27", 3]]);
  const app = r.keys.find((k) => k.isApp);
  assert.equal(app?.id, "apikey_app"); assert.equal(app?.name, "autopilot app");
  assert.equal(+app!.usd.toFixed(2), 12.5); assert.equal(+app!.today.toFixed(2), 2.5);
  assert.equal(r.keys.filter((k) => k.isApp).length, 1);
  assert.equal(r.keys.find((k) => k.id === null)?.usd, 0.1);
});

test("key names failing only costs the names", async () => {
  _resetCache();
  const r = await orgSpend({ key: "k", appKey: APP, now: T, fetchImpl: f((u) => u.includes("/analytics/cost") ? analytics([row("2026-11-27", "apikey_app", "100")]) : new Response("no", { status: 500 })) });
  assert.ok(r.state === "ok" && r.keys[0].name === null && !r.keys[0].isApp);
});

test("cached for 60 s", async () => {
  _resetCache();
  let n = 0;
  const impl = f((u) => { if (u.includes("/analytics/cost")) n++; return u.includes("/analytics/cost") ? analytics([row("2026-11-27", "a", "100")]) : keysOk(); });
  await orgSpend({ key: "k", fetchImpl: impl, now: T });
  await orgSpend({ key: "k", fetchImpl: impl, now: T + 30_000 });
  assert.equal(n, 1);
  await orgSpend({ key: "k", fetchImpl: impl, now: T + 61_000 });
  assert.equal(n, 2);
});

test("follows next_page", async () => {
  _resetCache();
  const pages: string[] = [];
  const r = await orgSpend({ key: "k", now: T, fetchImpl: f((u) => {
    if (!u.includes("/analytics/cost")) return keysOk();
    pages.push(u);
    return u.includes("page=p2") ? analytics([row("2026-11-26", "b", "200")]) : analytics([row("2026-11-27", "a", "100")], { has_more: true, next_page: "p2" });
  }) });
  assert.equal(pages.length, 2);
  assert.ok(r.state === "ok" && r.keys.length === 2);
});

test("new endpoint not offered (404): falls back to the daily report without a key split", async () => {
  _resetCache();
  const r = await orgSpend({ key: "k", now: T, fetchImpl: f((u) => u.includes("/analytics/") ? new Response("{}", { status: 404 }) : new Response(JSON.stringify({ data: [{ starting_at: "2026-11-26T00:00:00Z", results: [{ amount: "1250" }] }], has_more: false }), { status: 200 })) });
  assert.ok(r.state === "ok" && r.split === false && r.days[0].usd === 12.5 && r.keys.length === 0);
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
  await orgSpend({ key: "k", fetchImpl: f((u) => u.includes("/analytics/cost") ? analytics([row("2026-11-27", "a", "100")]) : keysOk()), now: T });
  const r = await orgSpend({ key: "k", fetchImpl: f(() => new Response("", { status: 500 })), now: T + 120_000 });
  assert.ok(r.state === "unavailable" && r.staleAt === T && r.days?.length === 1);
  const old = await orgSpend({ key: "k", fetchImpl: f(() => new Response("", { status: 500 })), now: T + 2 * 3600_000 });
  assert.ok(old.state === "unavailable" && old.staleAt === null);
});

test("hintMatches compares only head and tail of the key", () => {
  assert.equal(hintMatches("sk-ant-api03-Abc...WXYZ", APP), true);
  assert.equal(hintMatches("sk-ant-api03-Abc...0000", APP), false);
  assert.equal(hintMatches(null, APP), false);
  assert.equal(hintMatches("sk-ant-api03-Abc...WXYZ", undefined), false);
});
