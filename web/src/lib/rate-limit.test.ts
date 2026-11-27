// The counters of rate-limit.ts and the admin key lock built on them (admin/key-node.ts), on a real Postgres in memory
// (PGlite) with the real migrations. No network, no secrets.
import { before, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import Module from "node:module";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq, like } from "drizzle-orm";
import * as schema from "../db/schema";

const pg = new PGlite();
const real = drizzle(pg, { schema });
// the database with a switch: while it is on, every statement fails (the database is down)
let down = false;
const db = new Proxy(real, {
  get(target, p) {
    if (down && typeof p === "string" && ["insert", "update", "delete", "select"].includes(p)) throw new Error("database down");
    return (target as unknown as Record<PropertyKey, unknown>)[p];
  },
});
const origLoad = (Module as unknown as { _load: (...a: unknown[]) => unknown })._load;
(Module as unknown as { _load: (...a: unknown[]) => unknown })._load = function (this: unknown, request: unknown, ...rest: unknown[]) {
  return request === "@/db" ? { db, schema } : origLoad.call(this, request, ...rest);
};

const v = schema.verification;
const kit = async () => ({ rl: await import("./rate-limit"), key: await import("./admin/key-node"), sign: await import("./admin/key") });
const rowOf = async (id: string) => (await real.select().from(v).where(eq(v.id, id)))[0];
/** The window of this counter ended `ms` ago. */
const end = (id: string, ms = 1000) => real.update(v).set({ expiresAt: new Date(Date.now() - ms) }).where(eq(v.id, id));
const quiet = async <T>(f: () => Promise<T>) => { const e = console.error; console.error = () => {}; try { return await f(); } finally { console.error = e; } };
const MIN = 60_000;

before(async () => {
  const dir = path.resolve(__dirname, "../../drizzle");
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort())
    for (const s of readFileSync(path.join(dir, f), "utf8").split("--> statement-breakpoint")) if (s.trim()) await pg.exec(s);
});

test("a counter lets `max` tries through, refuses the next, and starts again when its window is over", async () => {
  const { rl } = await kit();
  const id = rl.counterId("t", "one");
  for (let i = 1; i <= 3; i++) assert.equal((await rl.hit(id, 3, 10 * MIN)).allowed, true, `try ${i}`);
  const fourth = await rl.hit(id, 3, 10 * MIN);
  assert.equal(fourth.allowed, false);
  assert.ok(fourth.retryAfter > 9 * 60 && fourth.retryAfter <= 10 * 60, "says how long is left");
  // one row, and what is counted is not readable in it
  const row = await rowOf(id);
  assert.match(row.id, /^rl:t:[0-9a-f]{40}$/);
  assert.equal(row.identifier, row.id);
  // refused tries do not make the wait longer and are not counted on top
  const until = row.expiresAt.getTime();
  for (let i = 0; i < 5; i++) assert.equal((await rl.hit(id, 3, 10 * MIN)).allowed, false);
  assert.equal((await rowOf(id)).expiresAt.getTime(), until);
  assert.equal((await rowOf(id)).value, "4");
  // the window ends: the same row counts from 1 again
  await end(id);
  assert.equal((await rl.hit(id, 3, 10 * MIN)).allowed, true);
  assert.equal((await rowOf(id)).value, "1");
  assert.equal((await real.select().from(v).where(like(v.id, "rl:t:%"))).length, 1);
});

test("the two kinds of window: from the first try, or from the last try let through", async () => {
  const { rl } = await kit();
  const fixed = rl.counterId("t", "fixed"), moving = rl.counterId("t", "moving");
  await rl.hit(fixed, 3, 10 * MIN); await rl.hit(moving, 3, 10 * MIN, { quiet: true });
  // nine minutes later (both rows moved back in time by nine minutes)
  for (const id of [fixed, moving]) await real.update(v).set({ expiresAt: new Date((await rowOf(id)).expiresAt.getTime() - 9 * MIN) }).where(eq(v.id, id));
  await rl.hit(fixed, 3, 10 * MIN); await rl.hit(moving, 3, 10 * MIN, { quiet: true });
  const left = async (id: string) => ((await rowOf(id)).expiresAt.getTime() - Date.now()) / MIN;
  assert.ok((await left(fixed)) < 1.1, "from the first try: one minute left");
  assert.ok((await left(moving)) > 9.9, "from the last try: ten minutes again");
  // the moving one stops moving once it refuses
  await rl.hit(moving, 3, 10 * MIN, { quiet: true });
  const until = (await rowOf(moving)).expiresAt.getTime();
  assert.equal((await rl.hit(moving, 3, 10 * MIN, { quiet: true })).allowed, false);
  assert.equal((await rowOf(moving)).expiresAt.getTime(), until);
});

test("fifty tries at the same moment: exactly `max` get through (margin 0), on a counter that is new and on one that just ended", async () => {
  const { rl } = await kit();
  const id = rl.counterId("t", "burst");
  const first = await Promise.all(Array.from({ length: 50 }, () => rl.hit(id, 5, 10 * MIN)));
  assert.equal(first.filter((h) => h.allowed).length, 5);
  await end(id);
  const again = await Promise.all(Array.from({ length: 50 }, () => rl.hit(id, 5, 10 * MIN, { quiet: true })));
  assert.equal(again.filter((h) => h.allowed).length, 5);
  assert.equal((await real.select().from(v).where(eq(v.identifier, id))).length, 1, "never a second row for one counter");
});

test("a try taken back frees one place; forgetting starts from nothing", async () => {
  const { rl } = await kit();
  const id = rl.counterId("t", "back");
  for (let i = 0; i < 3; i++) await rl.hit(id, 3, 10 * MIN);
  assert.equal((await rl.hit(id, 3, 10 * MIN)).allowed, false); // the row now says "refused" (4)
  await rl.giveBack(id, 3);
  assert.equal((await rowOf(id)).value, "2");
  assert.equal((await rl.hit(id, 3, 10 * MIN)).allowed, true);
  assert.equal((await rl.hit(id, 3, 10 * MIN)).allowed, false);
  await rl.forget(id);
  assert.equal(await rowOf(id), undefined);
  assert.equal((await rl.hit(id, 3, 10 * MIN)).allowed, true);
  await rl.giveBack(rl.counterId("t", "never-counted"), 3); // nothing there: nothing happens
});

test("the database is down: the limiter lets the request through instead of locking everyone out, and nothing throws", async () => {
  const { rl, key } = await kit();
  const id = rl.counterId("t", "down");
  down = true;
  try {
    await assert.rejects(rl.hit(id, 1, MIN), /database down/);
    await quiet(async () => {
      for (let i = 0; i < 3; i++) assert.deepEqual(await rl.hitOrAllow(id, 1, MIN), { allowed: true, retryAfter: 0 });
      assert.deepEqual(await rl.authRateLimit.customStorage.consume("203.0.113.9|/sign-in/email"), { allowed: true, retryAfter: 0 });
      await rl.giveBack(id, 1); await rl.forget(id); await rl.mark(id, new Date(Date.now() + MIN));
      assert.equal(await rl.isMarked(id), false);
      assert.equal(await key.countKeyTry("203.0.113.9"), true);
      await key.keyTryWasRight("203.0.113.9");
    });
  } finally { down = false; }
  assert.equal(await rowOf(id), undefined);
});

test("counters whose window ended are removed; live ones and rows that are not counters are left alone", async () => {
  const { rl } = await kit();
  const dead = rl.counterId("t", "dead"), live = rl.counterId("t", "live");
  await rl.hit(dead, 3, MIN); await rl.hit(live, 3, 10 * MIN);
  await end(dead, 5 * MIN);
  await real.insert(v).values({ id: "a-reset-link", identifier: "reset-password:x", value: "user-1", expiresAt: new Date(Date.now() - 5 * MIN) });
  await rl.sweepNowForTests();
  assert.equal(await rowOf(dead), undefined);
  assert.ok(await rowOf(live));
  assert.ok(await rowOf("a-reset-link"), "not this file's row to remove");
  await real.delete(v).where(eq(v.id, "a-reset-link"));
});

test("Better Auth's limiter on this store: the rule comes from the path, and paths without a rule share one counter per address", async () => {
  const { rl } = await kit();
  const { consume } = rl.authRateLimit.customStorage;
  const ip = "198.51.100.7";
  // log in: 3, then refused; another address and another path are not touched
  for (let i = 0; i < rl.IP_RULES["/sign-in/email"].max; i++) assert.equal((await consume(`${ip}|/sign-in/email`)).allowed, true);
  const no = await consume(`${ip}|/sign-in/email`);
  assert.equal(no.allowed, false);
  assert.ok(no.retryAfter! > 0 && no.retryAfter! <= rl.IP_RULES["/sign-in/email"].window);
  assert.equal((await consume(`198.51.100.8|/sign-in/email`)).allowed, true);
  assert.equal((await consume(`${ip}|/request-password-reset`)).allowed, true);
  // an address in the long form (IPv6, as Better Auth writes it) is cut at the right place
  assert.equal((await consume(`2001:0db8:0000:0000:0000:0000:0000:0000|/sign-in/email`)).allowed, true);
  // any number of made-up paths: one row, one shared cap
  const before = (await real.select().from(v).where(like(v.id, "rl:ip:%"))).length;
  const made = await Promise.all(Array.from({ length: rl.IP_RULE_REST.max + 20 }, (_, i) => consume(`${ip}|/made-up-${i}`)));
  assert.equal(made.filter((h) => h.allowed).length, rl.IP_RULE_REST.max);
  assert.equal((await real.select().from(v).where(like(v.id, "rl:ip:%"))).length, before + 1);
  // what Better Auth is told matches the table
  assert.deepEqual(rl.authRateLimit.customRules["/sign-up/email"], { max: rl.IP_RULES["/sign-up/email"].max, window: rl.IP_RULES["/sign-up/email"].window });
  assert.deepEqual([rl.authRateLimit.max, rl.authRateLimit.window], [rl.IP_RULE_REST.max, rl.IP_RULE_REST.window]);
});

test("admin key: five wrong keys lock one address for 15 minutes on every server instance; the right key clears it", async () => {
  const { rl, key } = await kit();
  const a = "192.0.2.1", b = "192.0.2.2";
  for (let i = 0; i < key.ADMIN_WRONG_KEYS_PER_ADDRESS; i++) assert.equal(await key.countKeyTry(a), true, `wrong key ${i + 1} is looked at`);
  assert.equal(await key.countKeyTry(a), false, "locked: the next key is not looked at");
  assert.equal(await key.countKeyTry(b), true, "another address is not locked");
  // the count is a row in the database, not in this process
  const row = await rowOf(rl.counterId("admin-key", a));
  assert.equal(row.value, String(key.ADMIN_WRONG_KEYS_PER_ADDRESS + 1));
  assert.ok(Math.abs(row.expiresAt.getTime() - Date.now() - key.ADMIN_WRONG_KEYS_WINDOW_MS) < 5000);
  assert.equal(JSON.stringify(row).includes(a), false, "the address is not stored as it is");
  // 15 minutes later
  await end(rl.counterId("admin-key", a));
  assert.equal(await key.countKeyTry(a), true);
  // a right key: that address starts from nothing
  await key.keyTryWasRight(a);
  assert.equal(await rowOf(rl.counterId("admin-key", a)), undefined);
});

test("admin key: wrong keys from many addresses lock nobody else out (no cap for everyone together)", async () => {
  const { key } = await kit();
  // one address hammering, and two hundred others with one wrong key each
  const hammer = await Promise.all(Array.from({ length: 150 }, () => key.countKeyTry("10.1.1.1")));
  assert.equal(hammer.filter(Boolean).length, key.ADMIN_WRONG_KEYS_PER_ADDRESS);
  const many = await Promise.all(Array.from({ length: 200 }, (_, i) => key.countKeyTry(`10.2.${Math.floor(i / 250)}.${i % 250}`)));
  assert.equal(many.every(Boolean), true);
  assert.equal(await key.countKeyTry("10.9.9.9"), true, "the owner, on an address that never tried, is let in to type the key");
});

test("the client address is the first one in the header the platform writes", async () => {
  const { key } = await kit();
  assert.equal(key.clientAddress(new Headers({ "x-forwarded-for": "203.0.113.5" })), "203.0.113.5");
  assert.equal(key.clientAddress(new Headers({ "x-forwarded-for": " 203.0.113.5 , 10.0.0.1" })), "203.0.113.5");
  assert.equal(key.clientAddress(new Headers()), "unknown");
});

test("admin log out: that cookie stops working for every copy of it; a cookie that is not good is not remembered", async () => {
  const { key, sign } = await kit();
  const KEY = "k".repeat(sign.ADMIN_KEY_MIN_LENGTH) + "-test-only";
  const cookie = await sign.signSession(KEY), other = await sign.signSession(KEY, Date.now() - 1000);
  assert.equal(await key.adminSessionEnded(cookie), false);
  await key.endAdminSession(cookie, KEY);
  assert.equal(await key.adminSessionEnded(cookie), true);
  assert.equal(await key.adminSessionEnded(other), false, "another session of the same key is not ended");
  await key.endAdminSession(cookie, KEY); // twice is fine
  // it is remembered until the cookie would have expired anyway, by a hash: neither the cookie nor the key is in the table
  const rows = await real.select().from(v).where(like(v.id, "rl:admin-out:%"));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].expiresAt.getTime(), Number(cookie.split(".")[1]));
  assert.equal(JSON.stringify(rows).includes(cookie.split(".")[2]), false);
  // forged, or signed with another key: nothing is written (anyone can post to log out)
  const n = (await real.select().from(v)).length;
  await key.endAdminSession("v1.99999999999999." + "0".repeat(64), KEY);
  await key.endAdminSession(other, KEY + "2");
  await key.endAdminSession(undefined, KEY);
  await key.endAdminSession(other, null);
  assert.equal((await real.select().from(v)).length, n);
});
