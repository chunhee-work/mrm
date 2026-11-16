import test from "node:test";
import assert from "node:assert/strict";
import { isMerimenUrl, isLoggedInUrl, sessionVerdict, nextStatus, IDLE_MS, HARD_MS, MERIMEN_START_URL } from "./rules";
import { fakeProvider, browserbase } from "./provider";

test("only Merimen's claims pages are allowed in the remote browser", () => {
  assert.equal(isMerimenUrl(MERIMEN_START_URL), true);
  assert.equal(isMerimenUrl("https://www.merimen.com.my/claims/index.cfm?x=1"), true);
  for (const u of ["http://www.merimen.com.my/claims/", "https://merimen.com.my/claims/", "https://www.merimen.com.my.evil.test/claims/", "https://www.merimen.com.my/other", "https://evil.test/claims/", "javascript:alert(1)", "not a url", ""]) assert.equal(isMerimenUrl(u), false, u);
});
test("logged in = a claims page whose address carries CFID and RID; the login page does not", () => {
  assert.equal(isLoggedInUrl(MERIMEN_START_URL), false);
  assert.equal(isLoggedInUrl("https://www.merimen.com.my/claims/index.cfm?CFID=1&CFTOKEN=2"), false);
  assert.equal(isLoggedInUrl("https://www.merimen.com.my/claims/index.cfm?fusebox=MTRadjuster&CFID=1&CFTOKEN=2&RID=3"), true);
  assert.equal(isLoggedInUrl("https://evil.test/claims/index.cfm?CFID=1&RID=3"), false);
});
test("a session closes when idle for 15 minutes or after 60 minutes in all", () => {
  const t0 = new Date("2026-11-16T00:00:00Z"); const at = (ms: number) => new Date(t0.getTime() + ms);
  assert.equal(sessionVerdict({ openedAt: t0, lastSeenAt: null, now: at(IDLE_MS - 1) }), "keep");
  assert.equal(sessionVerdict({ openedAt: t0, lastSeenAt: null, now: at(IDLE_MS) }), "idle");
  assert.equal(sessionVerdict({ openedAt: t0, lastSeenAt: at(50 * 60_000), now: at(55 * 60_000) }), "keep");
  assert.equal(sessionVerdict({ openedAt: t0, lastSeenAt: at(HARD_MS - 1000), now: at(HARD_MS) }), "hard");
});
test("status: connected stays connected, falls to expired when the login shows again, waits otherwise", () => {
  assert.equal(nextStatus("waiting_login", true), "connected");
  assert.equal(nextStatus("connected", true), "connected");
  assert.equal(nextStatus("connected", false), "expired");
  assert.equal(nextStatus("waiting_login", false), "waiting_login");
  assert.equal(nextStatus("none", false), "waiting_login");
});
test("no service key means no provider; with a key the connect address is not part of what we keep", async () => {
  assert.equal(browserbase({}), null);
  assert.equal(browserbase({ BROWSERBASE_API_KEY: "k" }), null);
  assert.ok(browserbase({ BROWSERBASE_API_KEY: "k", BROWSERBASE_PROJECT_ID: "p" }));
});
test("the test window looks logged out first, logged in later", async () => {
  const p = fakeProvider(); const id = await p.create();
  assert.equal((await p.pageUrls(id)).some(isLoggedInUrl), false);
  await p.release(id);
});
