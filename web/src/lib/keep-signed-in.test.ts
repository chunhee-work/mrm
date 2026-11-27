import { test } from "node:test";
import assert from "node:assert/strict";
import { KEEP_EVERY_MS, keepDue, keepSignedIn } from "./keep-signed-in";

const mem = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, m }; };
const T0 = 1_800_000_000_000;

test("due: never asked, a day or more ago, or a time in the future; not due inside the day", () => {
  assert.equal(keepDue(0, T0), true);
  assert.equal(keepDue(NaN, T0), true);
  assert.equal(keepDue(T0 - KEEP_EVERY_MS, T0), true);
  assert.equal(keepDue(T0 - KEEP_EVERY_MS + 1, T0), false);
  assert.equal(keepDue(T0 + 5, T0), true);
});

// one after the other in one test: the module remembers its last ask for a browser without storage
test("asks the auth server at most once a day, and again after a failed ask", async () => {
  let asks = 0;
  const ok = async () => { asks++; return true; };
  const store = mem();

  // a failed ask (offline, signed out) is not remembered
  assert.equal(await keepSignedIn(async () => { asks++; throw new Error("offline"); }, store, T0), false);
  assert.equal(await keepSignedIn(async () => { asks++; return false; }, store, T0 + 1), false);
  assert.equal(asks, 2);
  assert.equal(store.m.size, 0);

  assert.equal(await keepSignedIn(ok, store, T0 + 2), true);
  assert.equal(asks, 3);
  // every later page of that day: no request
  for (const later of [10, 60_000, KEEP_EVERY_MS - 1]) assert.equal(await keepSignedIn(ok, store, T0 + 2 + later), false);
  assert.equal(asks, 3);
  // the next day: one more
  assert.equal(await keepSignedIn(ok, store, T0 + 2 + KEEP_EVERY_MS), true);
  assert.equal(asks, 4);

  // storage that throws or is missing: still once per day while the page stays loaded
  const broken = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
  assert.equal(await keepSignedIn(ok, broken, T0 + 3 + KEEP_EVERY_MS), false);
  assert.equal(await keepSignedIn(ok, broken, T0 + 2 + 2 * KEEP_EVERY_MS), true);
  assert.equal(await keepSignedIn(ok, null, T0 + 3 + 2 * KEEP_EVERY_MS), false);
  assert.equal(asks, 5);

  // two checks at the same moment (page opened + tab shown): one request
  let open!: (v: boolean) => void;
  const slow = () => { asks++; return new Promise<boolean>((r) => { open = r; }); };
  const at = T0 + 10 + 3 * KEEP_EVERY_MS;
  const first = keepSignedIn(slow, mem(), at);
  await new Promise((r) => setImmediate(r));
  assert.equal(await keepSignedIn(slow, mem(), at), false);
  open(true);
  assert.equal(await first, true);
  assert.equal(asks, 6);
});
