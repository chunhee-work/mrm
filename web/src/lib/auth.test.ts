// The real auth server (auth.ts) and session reader (session.ts) on a real Postgres in memory (PGlite) with the real migrations.
// Emails are collected instead of sent; the request's headers and the redirect of a page are stand-ins. No network, no secrets.
import { before, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import Module from "node:module";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq, like } from "drizzle-orm";
import * as schema from "../db/schema";
import { MAX_NAME } from "./account-name";

const pg = new PGlite();
const real = drizzle(pg, { schema });
// the database with a switch: the next insert into one table fails once (a blip at the worst moment)
let failInsertInto: unknown = null;
// and a second switch: while it is on, every counter of rate-limit.ts fails to be written (its rows are the ones named rl:…)
let countersDown = 0;
const db = new Proxy(real, {
  get(target, p) {
    if (p !== "insert") return (target as unknown as Record<PropertyKey, unknown>)[p];
    return (table: Parameters<typeof real.insert>[0]) => {
      if (table === failInsertInto) { failInsertInto = null; throw new Error("database blip"); }
      const ins = target.insert(table);
      if (!countersDown || table !== schema.verification) return ins;
      return { values: (val: { id: string }) => { if (val.id.startsWith("rl:")) { countersDown++; throw new Error("database blip"); } return ins.values(val as never); } };
    };
  },
});
const mails: { to: string; kind: string }[] = [];
const htmls: string[] = []; // the same emails, what they say
let mailDown = false; // the mail provider refuses every send
// what the server leaves to do after the answer is sent (emails, clearing a counter): awaited by http() so a test sees it done
const afterAnswer: Promise<unknown>[] = [];
let reqHeaders = new Headers();
class Redirected extends Error { constructor(public to: string) { super(`redirect ${to}`); } }
const stubs: Record<string, unknown> = {
  "@/db": { db, schema },
  "./email": { sendEmail: async (to: string, _subject: string, html: string, kind: string) => { if (mailDown) throw new Error("mail provider down"); mails.push({ to, kind }); htmls.push(html); } },
  "next/server": { after: (p: Promise<unknown>) => { afterAnswer.push(Promise.resolve(p).catch(() => {})); } },
  "next/headers": { headers: async () => reqHeaders, cookies: async () => ({ has: (n: string) => (reqHeaders.get("cookie") ?? "").includes(`${n}=`) }) },
  "next/navigation": { redirect: (to: string) => { throw new Redirected(to); } },
};
const origLoad = (Module as unknown as { _load: (...a: unknown[]) => unknown })._load;
(Module as unknown as { _load: (...a: unknown[]) => unknown })._load = function (this: unknown, request: unknown, ...rest: unknown[]) {
  return typeof request === "string" && request in stubs ? stubs[request] : origLoad.call(this, request, ...rest);
};
process.env.BETTER_AUTH_SECRET = "only-for-this-test-not-a-real-secret-0000";
process.env.BETTER_AUTH_URL = "http://localhost:3000";

const PASSWORD = "a-long-test-password";
const DAY = 86_400_000;
const kit = async () => ({ auth: (await import("./auth")).auth, session: await import("./session"), own: await import("./own-org") });
const orgs = () => real.select().from(schema.organizations);
const members = (userId: string) => real.select().from(schema.memberships).where(eq(schema.memberships.userId, userId));
const userOf = async (email: string) => (await real.select().from(schema.user).where(eq(schema.user.email, email)))[0];
/** A call the way the browser makes it: over the HTTP handler, so the answer has the real status, body and cookies. */
async function http(p: string, body?: unknown, cookie?: string, more: Record<string, string> = {}) {
  const { auth } = await kit();
  const r = await auth.handler(new Request(`http://localhost:3000/api/auth${p}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { origin: "http://localhost:3000", ...(body === undefined ? {} : { "content-type": "application/json" }), ...(cookie ? { cookie } : {}), ...more },
    body: body === undefined ? undefined : JSON.stringify(body),
  }));
  const text = await r.text();
  while (afterAnswer.length) await afterAnswer.shift();
  let json: ({ code?: string } & Record<string, unknown>) | null = null;
  try { json = JSON.parse(text); } catch { /* no body */ }
  return { status: r.status, code: json?.code, json, setCookie: r.headers.get("set-cookie") ?? "" };
}
let n = 0;
/** A confirmed account that is logged in; `cookie` is what its browser sends. */
async function signedUp(name?: string) {
  const email = `u${++n}@test.invalid`;
  const up = await http("/sign-up/email", { name: name ?? `User ${n}`, email, password: PASSWORD });
  assert.equal(up.status, 200);
  const u = await userOf(email);
  await real.update(schema.user).set({ emailVerified: true }).where(eq(schema.user.id, u.id));
  const inn = await http("/sign-in/email", { email, password: PASSWORD });
  assert.equal(inn.status, 200);
  return { email, id: u.id, cookie: inn.setCookie.split(";")[0], firstCookie: inn.setCookie };
}

before(async () => {
  const dir = path.resolve(__dirname, "../../drizzle");
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort())
    for (const s of readFileSync(path.join(dir, f), "utf8").split("--> statement-breakpoint")) if (s.trim()) await pg.exec(s);
});

test("sign-up makes one organization with the user as owner, under the id worked out from the user", async () => {
  const { own } = await kit();
  const me = await signedUp();
  const m = await members(me.id);
  assert.equal(m.length, 1);
  assert.equal(m[0].role, "owner");
  assert.equal(m[0].orgId, await own.ownOrgId(me.id));
  assert.match(m[0].orgId, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  assert.notEqual(await own.ownOrgId(me.id), await own.ownOrgId(`${me.id}x`));
});

test("the database fails while sign-up makes the organization: the account is made, the email goes out, and the first signed-in page lets the user in", async () => {
  const { session } = await kit();
  const email = `blip${++n}@test.invalid`;
  const sent = mails.length;
  const before = (await orgs()).length;
  failInsertInto = schema.organizations;
  const up = await http("/sign-up/email", { name: "Blip", email, password: PASSWORD });
  assert.equal(failInsertInto, null, "the failure really happened");
  assert.equal(up.status, 200, "sign-up is not reported as failed: the account exists");
  assert.deepEqual(mails.slice(sent), [{ to: email, kind: "verify" }]);
  const u = await userOf(email);
  assert.equal((await members(u.id)).length, 0, "the state that used to lock the account out");
  assert.equal((await orgs()).length, before, "nothing was made");

  await real.update(schema.user).set({ emailVerified: true }).where(eq(schema.user.id, u.id));
  const inn = await http("/sign-in/email", { email, password: PASSWORD });
  reqHeaders = new Headers({ cookie: inn.setCookie.split(";")[0] });
  // two pages at the same moment (layout and page, or two tabs)
  const [a, b] = await Promise.all([session.requireUser(), session.getUserOrNull()]);
  assert.equal(a.user.id, u.id);
  assert.equal(a.orgId, b?.orgId);
  assert.equal((await members(u.id)).length, 1);
  assert.equal((await orgs()).length, before + 1);
  // and nothing more is made on later pages
  await session.requireUser();
  assert.equal((await orgs()).length, before + 1);
});

test("half made (the organization row is there, the owner membership is not): the membership is added to that same organization", async () => {
  const { own, session } = await kit();
  const me = await signedUp();
  const orgId = await own.ownOrgId(me.id);
  // the state a failure between the two inserts leaves on a database without a batch
  await real.delete(schema.memberships).where(eq(schema.memberships.userId, me.id));
  assert.deepEqual((await orgs()).filter((o) => o.id === orgId).map((o) => o.name), [`User ${n}`]);
  assert.equal((await members(me.id)).length, 0);
  const before = (await orgs()).length;

  assert.equal(await own.ensureOwnOrg({ id: me.id, name: "Another name", email: me.email }, db as never), orgId);
  assert.deepEqual((await members(me.id)).map((m) => [m.orgId, m.role]), [[orgId, "owner"]]);
  assert.equal((await orgs()).length, before, "no second organization");
  assert.deepEqual((await orgs()).filter((o) => o.id === orgId).map((o) => o.name), [`User ${n}`], "the row that was there is kept as it is");

  // the same through a page: the signed-in user with only the organization row gets in
  await real.delete(schema.memberships).where(eq(schema.memberships.userId, me.id));
  reqHeaders = new Headers({ cookie: me.cookie });
  assert.equal((await session.requireUser()).orgId, orgId);
  assert.equal((await members(me.id)).length, 1);
  assert.equal((await orgs()).length, before);
});

test("on the production database both rows go in one batch (one transaction), organization first", async () => {
  const { own } = await kit();
  type Stmt = { table: unknown; values: Record<string, unknown>; unlessThere: boolean; ranAlone: boolean; then?: unknown };
  const batches: Stmt[][] = [];
  const made: Stmt[] = [];
  // a stand-in with the one thing Neon's database object has and the test database lacks: batch()
  const fake = {
    insert: (table: unknown) => ({
      values: (values: Record<string, unknown>) => ({
        onConflictDoNothing: () => {
          const st: Stmt = { table, values, unlessThere: true, ranAlone: false };
          Object.defineProperty(st, "then", { enumerable: false, value: (ok: (v: unknown) => void) => { st.ranAlone = true; ok(undefined); } });
          made.push(st);
          return st;
        },
      }),
    }),
    batch: async (qs: Stmt[]) => { batches.push([...qs]); },
  };
  const orgId = await own.ensureOwnOrg({ id: "user-1", name: "", email: "ahmad@abc.my" }, fake as never);
  assert.equal(orgId, await own.ownOrgId("user-1"));
  assert.equal(batches.length, 1, "one batch");
  assert.equal(batches[0].length, 2);
  assert.deepEqual(batches[0].map((q) => q.table), [schema.organizations, schema.memberships]);
  assert.deepEqual(batches[0].map((q) => q.values), [{ id: orgId, name: "ahmad@abc.my" }, { orgId, userId: "user-1", role: "owner" }]);
  assert.ok(made.every((q) => q.unlessThere && !q.ranAlone), "neither statement was also run on its own");
});

test("making the own organization twice at once, or again later, makes one", async () => {
  const { own } = await kit();
  const me = await signedUp();
  await real.delete(schema.memberships).where(eq(schema.memberships.userId, me.id));
  await real.delete(schema.organizations).where(eq(schema.organizations.id, await own.ownOrgId(me.id)));
  const before = (await orgs()).length;
  const u = { id: me.id, name: "N", email: me.email };
  const ids = await Promise.all([own.ensureOwnOrg(u, db as never), own.ensureOwnOrg(u, db as never), own.ensureOwnOrg(u, db as never)]);
  assert.equal(new Set(ids).size, 1);
  await own.ensureOwnOrg(u, db as never);
  assert.equal((await orgs()).length, before + 1);
  assert.equal((await members(me.id)).length, 1);
});

test("nobody signed in, or a dead cookie: a page still sends to log in and makes nothing", async () => {
  const { session } = await kit();
  const before = (await orgs()).length;
  reqHeaders = new Headers({ cookie: "better-auth.session_token=not-a-session" });
  assert.equal(await session.getUserOrNull(), null);
  await assert.rejects(session.requireUser(), (e: Redirected) => e.to === "/login");
  assert.equal((await orgs()).length, before);
});

test("account name: sign-up cuts a longer one; a change is refused when empty or too long", async () => {
  const long = await signedUp("x".repeat(5000));
  assert.equal((await userOf(long.email)).name, "x".repeat(MAX_NAME));
  const blank = await signedUp("   ");
  assert.equal((await userOf(blank.email)).name, blank.email.split("@")[0]);

  const me = await signedUp("Ahmad");
  for (const bad of ["", "   ", "x".repeat(MAX_NAME + 1), 7, null]) {
    const r = await http("/update-user", { name: bad }, me.cookie);
    assert.equal(r.status, 400, `name ${JSON.stringify(bad).slice(0, 20)}`);
    assert.equal(r.code, "INVALID_NAME");
  }
  assert.equal((await userOf(me.email)).name, "Ahmad");
  assert.equal((await http("/update-user", { name: "  Ahmad Motor  " }, me.cookie)).status, 200);
  assert.equal((await userOf(me.email)).name, "Ahmad Motor");
});

test("sign-up answers the same for an address with an account and one without, whatever name is sent", async () => {
  // everything in the answer except what is random or a clock time
  const shape = (r: Awaited<ReturnType<typeof http>>) => {
    const { user, ...rest } = r.json as { user: Record<string, unknown> };
    const { id, createdAt, updatedAt, email, ...fields } = user;
    assert.equal(typeof id, "string"); assert.equal(typeof createdAt, "string"); assert.equal(typeof updatedAt, "string");
    return { status: r.status, rest, fields, keys: Object.keys(user).sort(), idLength: (id as string).length, email };
  };
  for (const name of ["x".repeat(MAX_NAME + 40), "   Ahmad Motor   ", "", "   ", "Ahmad", "😀".repeat(MAX_NAME + 3)]) {
    const email = `probe${++n}@test.invalid`;
    const body = { name, email, password: PASSWORD };
    const fresh = shape(await http("/sign-up/email", body)); // the address is new: an account is made
    assert.equal((await userOf(email)).name, fresh.fields.name, "the answer shows the name as it is stored");
    const taken = shape(await http("/sign-up/email", body)); // the same request again: the address has an account now
    assert.deepEqual(taken, fresh, `name ${JSON.stringify(name).slice(0, 24)}`);
    // and with the address typed in capitals
    assert.deepEqual(shape(await http("/sign-up/email", { ...body, email: email.toUpperCase() })), fresh);
  }
  // the same with a picture sent along: nothing of it is stored or answered, so one that the database would refuse (a zero
  // byte) or a very long one cannot make the two answers differ
  for (const image of ["\u0000", "a\u0000b", "x".repeat(200_000), "https://example.test/me.png", ""]) {
    const email = `pic${++n}@test.invalid`;
    const body = { name: "Ahmad", email, password: PASSWORD, image };
    const fresh = shape(await http("/sign-up/email", body));
    assert.equal(fresh.status, 200, `image ${JSON.stringify(image).slice(0, 24)}`);
    assert.equal(fresh.fields.image, null);
    assert.equal((await userOf(email)).image, null, "nothing is stored");
    assert.deepEqual(shape(await http("/sign-up/email", body)), fresh, `image ${JSON.stringify(image).slice(0, 24)}`);
  }
  // an address with a zero byte in it is refused as malformed either way, before any account is looked up
  const bad = await http("/sign-up/email", { name: "Ahmad", email: "ah\u0000mad@test.invalid", password: PASSWORD });
  assert.deepEqual([bad.status, bad.code], [400, "VALIDATION_ERROR"]);
});

test("a profile picture cannot be stored: a change that sends one is refused", async () => {
  const me = await signedUp("Ahmad");
  for (const image of ["https://example.test/me.png", "x".repeat(200_000), "\u0000", ""]) {
    const r = await http("/update-user", { image }, me.cookie);
    assert.deepEqual([r.status, r.code], [400, "INVALID_IMAGE"], `image ${JSON.stringify(image).slice(0, 24)}`);
    assert.deepEqual([(await http("/update-user", { name: "Other", image }, me.cookie)).status, (await userOf(me.email)).name], [400, "Ahmad"], "the name sent with it is not saved either");
  }
  assert.equal((await userOf(me.email)).image, null);
  // "no picture" is what is stored already, and a name alone still saves
  assert.equal((await http("/update-user", { image: null }, me.cookie)).status, 200);
  assert.equal((await http("/update-user", { name: "Ahmad Motor" }, me.cookie)).status, 200);
  assert.deepEqual([(await userOf(me.email)).name, (await userOf(me.email)).image], ["Ahmad Motor", null]);
});

test("the reasons the pages read are the ones the server sends", async () => {
  const email = `codes${++n}@test.invalid`;
  await http("/sign-up/email", { name: "C", email, password: PASSWORD });
  const unverified = await http("/sign-in/email", { email, password: PASSWORD });
  assert.deepEqual([unverified.status, unverified.code], [403, "EMAIL_NOT_VERIFIED"]);
  const wrong = await http("/sign-in/email", { email, password: "not-the-password" });
  assert.deepEqual([wrong.status, wrong.code], [401, "INVALID_EMAIL_OR_PASSWORD"]);
  const unknown = await http("/sign-in/email", { email: "nobody@test.invalid", password: PASSWORD });
  assert.deepEqual([unknown.status, unknown.code], [401, "INVALID_EMAIL_OR_PASSWORD"]);

  const me = await signedUp();
  const pw = await http("/change-password", { currentPassword: "not-the-password", newPassword: "another-long-password", revokeOtherSessions: true }, me.cookie);
  assert.deepEqual([pw.status, pw.code], [400, "INVALID_PASSWORD"]);
  // not signed in is a 4xx too, and is not a wrong password
  const gone = await http("/change-password", { currentPassword: PASSWORD, newPassword: "another-long-password" });
  assert.equal(gone.status, 401);
  assert.notEqual(gone.code, "INVALID_PASSWORD");
});

test("forgot password answers OK for an address with an account and one without", async () => {
  const me = await signedUp();
  const sent = mails.length;
  assert.equal((await http("/request-password-reset", { email: me.email, redirectTo: "/reset-password" })).status, 200);
  assert.equal((await http("/request-password-reset", { email: "nobody@test.invalid", redirectTo: "/reset-password" })).status, 200);
  assert.deepEqual(mails.slice(sent), [{ to: me.email, kind: "reset" }]);
});

test("an address the browser lets through but the server calls malformed is a 400, before any account is looked up", async () => {
  // <input type="email"> accepts a host without a dot; the server does not
  const forgot = await http("/request-password-reset", { email: "ahmad@gmail", redirectTo: "/reset-password" });
  assert.deepEqual([forgot.status, forgot.code], [400, "VALIDATION_ERROR"]);
  const again = await http("/send-verification-email", { email: "ahmad@gmail", callbackURL: "/login?verified=1" });
  assert.deepEqual([again.status, again.code], [400, "VALIDATION_ERROR"]);
});

test("a page only reads the session; the browser's own request renews it and gets the cookie with 7 new days", async () => {
  const { session } = await kit();
  const me = await signedUp();
  assert.match(me.firstCookie, /Max-Age=604800/);
  const row = async () => (await real.select().from(schema.session).where(eq(schema.session.userId, me.id)))[0];
  const daysLeft = async () => ((await row()).expiresAt.getTime() - Date.now()) / DAY;
  // two days after logging in: five days left, a renewal is due
  await real.update(schema.session).set({ expiresAt: new Date(Date.now() + 5 * DAY) }).where(eq(schema.session.userId, me.id));

  // pages (which cannot send a cookie) leave the row alone, so the row and the browser's cookie stay in step
  reqHeaders = new Headers({ cookie: me.cookie });
  assert.equal((await session.requireUser()).user.id, me.id);
  assert.equal((await session.getUserOrNull())?.user.id, me.id);
  assert.ok((await daysLeft()) < 5.01, "the page did not renew");

  // the once-a-day request from the browser (keep-signed-in.ts): both halves move together
  const kept = await http("/get-session", undefined, me.cookie);
  assert.equal(kept.status, 200);
  assert.match(kept.setCookie, /better-auth\.session_token=[^;]+;.*Max-Age=604800/);
  assert.ok((await daysLeft()) > 6.99, "the row has 7 new days");
  // asked again the same day: nothing to renew, no cookie
  assert.equal((await http("/get-session", undefined, me.cookie)).setCookie, "");
});

// ---- caps: client address, one account, one mailbox (rate-limit.ts) ----
const V = schema.verification;
const MIN = 60_000;
const rl = () => import("./rate-limit");
/** Better Auth's limiter is off outside production; a test turns it on for itself. */
async function withLimiter<T>(f: () => Promise<T>) {
  const ctx = await (await kit()).auth.$context;
  ctx.rateLimit.enabled = true;
  try { return await f(); } finally { ctx.rateLimit.enabled = false; }
}
const from = (ip: string) => ({ "x-forwarded-for": ip });
const counter = async (id: string) => (await real.select().from(V).where(eq(V.id, id)))[0];
/** The window of these counters ended a moment ago. */
const endWindow = (idLike: string) => real.update(V).set({ expiresAt: new Date(Date.now() - 1000) }).where(like(V.id, idLike));
const wrong = (email: string, more?: Record<string, string>) => http("/sign-in/email", { email, password: "not-the-password" }, undefined, more);
const quiet = async <T>(f: () => Promise<T>) => { const e = console.error; console.error = () => {}; try { return await f(); } finally { console.error = e; } };

test("log-in tries are counted per client address in the database: the 4th in a row is a 429, another address is not held up, and it is over when the window is", async () => {
  const { IP_RULES, counterId } = await rl();
  const max = IP_RULES["/sign-in/email"].max;
  await withLimiter(async () => {
    const a = "203.0.113.10";
    for (let i = 0; i < max; i++) assert.equal((await wrong(`ip-a${i}@test.invalid`, from(a))).status, 401);
    const held = await wrong("ip-a9@test.invalid", from(a));
    assert.equal(held.status, 429, "the shape the log-in page reads as 'too many tries'");
    assert.equal((await http("/sign-in/email", { email: "ip-a9@test.invalid", password: PASSWORD }, undefined, from("203.0.113.11"))).status, 401, "another address");
    // the count is one row, shared by every server instance
    const row = await counter(counterId("ip", `${a}|/sign-in/email`));
    assert.equal(row.value, String(max + 1));
    assert.ok(row.expiresAt.getTime() - Date.now() <= IP_RULES["/sign-in/email"].window * 1000);
    await endWindow("rl:ip:%");
    assert.equal((await wrong("ip-a9@test.invalid", from(a))).status, 401, "after the window");

    // many at the same moment from one address: exactly `max` reach the password check (margin 0)
    const burst = await Promise.all(Array.from({ length: 12 }, (_, i) => wrong(`ip-b${i}@test.invalid`, from("203.0.113.20"))));
    assert.deepEqual([burst.filter((r) => r.status === 401).length, burst.filter((r) => r.status === 429).length], [max, 12 - max]);

    // The address is the one the platform writes. A header with two addresses in it is not believed (the first is whatever
    // the client typed): the platform's second header is read instead.
    await wrong("ip-c@test.invalid", { "x-forwarded-for": "198.51.100.1, 10.0.0.1", "x-vercel-forwarded-for": "203.0.113.30" });
    assert.ok(await counter(counterId("ip", "203.0.113.30|/sign-in/email")));
    assert.equal(await counter(counterId("ip", "198.51.100.1|/sign-in/email")), undefined);
  });
});

test("sign-ups from one client address are capped over ten minutes; every other auth path shares one generous cap", async () => {
  const { IP_RULES, IP_RULE_REST } = await rl();
  await withLimiter(async () => {
    const a = "203.0.113.40", rule = IP_RULES["/sign-up/email"];
    const made = mails.length;
    const tries: number[] = [];
    for (let i = 0; i < rule.max + 2; i++) tries.push((await http("/sign-up/email", { name: "F", email: `flood${++n}@test.invalid`, password: PASSWORD }, undefined, from(a))).status);
    assert.deepEqual(tries, [...Array(rule.max).fill(200), 429, 429]);
    assert.equal(mails.length - made, rule.max, "and no more emails than that");
    const rest = await Promise.all(Array.from({ length: IP_RULE_REST.max + 5 }, () => http("/get-session", undefined, undefined, from(a))));
    assert.equal(rest.filter((r) => r.status === 429).length, 5);
  });
});

test("the limiter's database is down: requests are answered as if there were no limiter", async () => {
  const me = await signedUp();
  const { IP_RULES, MAILS_PER_ADDRESS_MAX } = await rl();
  const counters = async () => (await real.select().from(V).where(like(V.id, "rl:%"))).length;
  const had = await counters();
  countersDown = 1;
  try {
    await quiet(() => withLimiter(async () => {
      // per client address and per account: far more tries than either cap, every one is answered by the password check
      for (let i = 0; i < IP_RULES["/sign-in/email"].max + 3; i++) assert.equal((await wrong("down@test.invalid", from("203.0.113.50"))).status, 401);
      assert.equal(countersDown - 1, 3 * (IP_RULES["/sign-in/email"].max + 3), "all three counts (client address, account from this address, account) really failed, every time");
      assert.equal((await http("/sign-in/email", { email: me.email, password: PASSWORD }, undefined, from("203.0.113.50"))).status, 200);
      // per mailbox: the emails still go out
      const sent = mails.length;
      for (let i = 0; i < MAILS_PER_ADDRESS_MAX + 1; i++) assert.equal((await http("/request-password-reset", { email: me.email, redirectTo: "/reset-password" }, undefined, from(`203.0.113.${60 + i}`))).status, 200);
      assert.equal(mails.length - sent, MAILS_PER_ADDRESS_MAX + 1);
    }));
  } finally { countersDown = 0; }
  assert.equal(await counters(), had, "nothing was counted while it was down");
});

test("wrong passwords for one account from one client address are capped: then a 429 there, the same for an address nobody has, while the owner elsewhere still gets in", async () => {
  const { SIGN_IN_FAILS_MAX: max, SIGN_IN_FAILS_WINDOW_MS, signInFailsFrom } = await rl();
  const me = await signedUp();
  const nobody = `nobody${++n}@test.invalid`;
  const there = "198.51.100.7";
  const run = async (email: string) => {
    const out: (number | string | undefined)[][] = [];
    for (let i = 0; i <= max; i++) { const r = await wrong(email, from(there)); out.push([r.status, r.code, r.json?.message as string]); }
    // locked there: the right password is refused too, with the answer the log-in page reads as "too many tries"
    const r = await http("/sign-in/email", { email, password: PASSWORD }, undefined, from(there));
    out.push([r.status, r.code, r.json?.message as string, r.setCookie]);
    return out;
  };
  const real1 = await run(me.email);
  assert.deepEqual(real1.slice(0, max), Array(max).fill([401, "INVALID_EMAIL_OR_PASSWORD", "Invalid email or password"]));
  assert.deepEqual(real1.slice(max), [[429, "TOO_MANY_REQUESTS", "Too many requests. Please try again later."], [429, "TOO_MANY_REQUESTS", "Too many requests. Please try again later.", ""]]);
  assert.deepEqual(await run(nobody), real1, "an address without an account answers the same, try for try");
  // typed in capitals it is the same account and the same count
  assert.equal((await wrong(me.email.toUpperCase(), from(there))).status, 429);
  // someone who only knows the email cannot keep the owner out: from another client address the right password logs in
  assert.equal((await http("/sign-in/email", { email: me.email, password: PASSWORD }, undefined, from("203.0.113.200"))).status, 200);
  assert.equal((await http("/sign-in/email", { email: me.email, password: PASSWORD }, undefined, from(there))).status, 429, "and that did not unlock the address that guessed");
  // the row: a hash, not the address or the email; it ends ten minutes after the first wrong password and refused tries do not move that
  const id = signInFailsFrom(me.email, there);
  const row = await counter(id);
  assert.equal(JSON.stringify(row).includes(me.email) || JSON.stringify(row).includes(there), false);
  assert.ok(Math.abs(row.expiresAt.getTime() - Date.now() - SIGN_IN_FAILS_WINDOW_MS) < 30_000);
  // the window ends: the right password logs in there, and the count is gone
  await endWindow(id);
  assert.equal((await http("/sign-in/email", { email: me.email, password: PASSWORD }, undefined, from(there))).status, 200);
  assert.equal(await counter(id), undefined);
});

test("wrong passwords for one account from many client addresses together are capped too, and one address alone cannot use that cap up", async () => {
  const { SIGN_IN_FAILS_MAX: max, SIGN_IN_FAILS_ALL_MAX: all, SIGN_IN_FAILS_ALL_WINDOW_MS, signInFailsAll } = await rl();
  const me = await signedUp();
  const id = signInFailsAll(me.email);
  // one address hammering: only the tries that were looked at count for everyone
  for (let i = 0; i < max + 15; i++) await wrong(me.email, from("198.51.100.9"));
  const row = await counter(id);
  assert.equal(Number(row.value), max);
  assert.equal(JSON.stringify(row).includes(me.email), false);
  assert.ok(Math.abs(row.expiresAt.getTime() - Date.now() - SIGN_IN_FAILS_ALL_WINDOW_MS) < 60_000);
  // a right password from elsewhere takes one try off; it does not wipe what the others typed wrong
  assert.equal((await http("/sign-in/email", { email: me.email, password: PASSWORD }, undefined, from("203.0.113.201"))).status, 200);
  assert.equal(Number((await counter(id)).value), max);
  // a botnet: one guess per address. Up to the cap each is looked at, after it none is, the right password neither
  await real.update(V).set({ value: String(all - 2) }).where(eq(V.id, id));
  assert.deepEqual([(await wrong(me.email, from("192.0.2.11"))).status, (await wrong(me.email, from("192.0.2.12"))).status, (await wrong(me.email, from("192.0.2.13"))).status], [401, 401, 429]);
  assert.equal((await http("/sign-in/email", { email: me.email, password: PASSWORD }, undefined, from("203.0.113.202"))).status, 429);
  // the hour ends
  await endWindow(id);
  assert.equal((await http("/sign-in/email", { email: me.email, password: PASSWORD }, undefined, from("203.0.113.202"))).status, 200);
});

test("a right password starts the count again; tries at the same moment cannot get past the cap; an unconfirmed account's right password is not a wrong one", async () => {
  const { SIGN_IN_FAILS_MAX: max, signInFailsFrom, signInFailsAll } = await rl();
  const me = await signedUp();
  const mine = (email: string) => signInFailsFrom(email, "unknown"); // these requests carry no client address
  for (let round = 0; round < 2; round++) {
    for (let i = 0; i < max - 1; i++) assert.equal((await wrong(me.email)).status, 401, `round ${round} try ${i}`);
    assert.equal((await http("/sign-in/email", { email: me.email, password: PASSWORD })).status, 200);
    assert.equal(await counter(mine(me.email)), undefined);
  }
  // 30 guesses sent together at one account: exactly 10 are checked (margin 0)
  const burst = await Promise.all(Array.from({ length: 30 }, () => wrong(me.email)));
  assert.deepEqual([burst.filter((r) => r.status === 401).length, burst.filter((r) => r.status === 429).length], [max, 30 - max]);
  // the same request sent the other way the server accepts it (a plain form) is held by the same count
  const form = await (await kit()).auth.handler(new Request("http://localhost:3000/api/auth/sign-in/email", {
    method: "POST", headers: { origin: "http://localhost:3000", "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ email: me.email, password: PASSWORD }).toString(),
  }));
  assert.equal(form.status, 429);

  // not confirmed yet, right password: "confirm your email" every time, never "too many tries"
  const email = `unconfirmed${++n}@test.invalid`;
  await http("/sign-up/email", { name: "U", email, password: PASSWORD });
  for (let i = 0; i < max + 3; i++) assert.equal((await http("/sign-in/email", { email, password: PASSWORD })).code, "EMAIL_NOT_VERIFIED");
  const counted = async () => [Number((await counter(mine(email)))?.value ?? 0), Number((await counter(signInFailsAll(email)))?.value ?? 0)];
  assert.deepEqual(await counted(), [0, 0]);
  // a request that is not a guess at all (no password) is not counted either
  for (let i = 0; i < max + 3; i++) assert.equal((await http("/sign-in/email", { email })).status, 400);
  assert.deepEqual(await counted(), [0, 0]);
});

/** The token in the newest reset email. */
const lastResetToken = () => /\/reset-password\/([A-Za-z0-9_-]+)\?/.exec(htmls[htmls.length - 1])![1];

test("a password reset unlocks the account, is stored as a hash, works once, and ends the other reset links of that account", async () => {
  const { SIGN_IN_FAILS_MAX: max } = await rl();
  const { storedResetIdentifiers, resetIdentifier } = await import("./reset-token");
  const me = await signedUp();
  for (let i = 0; i < max; i++) await wrong(me.email);
  assert.equal((await http("/sign-in/email", { email: me.email, password: PASSWORD })).status, 429, "someone locked the owner out");

  // two links are asked for
  await http("/request-password-reset", { email: me.email, redirectTo: "/reset-password" });
  const first = lastResetToken();
  await http("/request-password-reset", { email: me.email, redirectTo: "/reset-password" });
  const second = lastResetToken();
  assert.notEqual(first, second);
  // in the table: only the hash of each, which is where the page's "is this link live" check looks
  const rows = await real.select().from(V).where(eq(V.value, me.id));
  assert.deepEqual(rows.map((r) => r.identifier).sort(), [storedResetIdentifiers(first)[0], storedResetIdentifiers(second)[0]].sort());
  assert.equal(JSON.stringify(rows).includes(first) || JSON.stringify(rows).includes(second), false, "the link itself is not in the table");
  assert.deepEqual(storedResetIdentifiers(first), [storedResetIdentifiers(first)[0], resetIdentifier(first)]);
  assert.ok(rows.every((r) => Math.abs(r.expiresAt.getTime() - Date.now() - 60 * MIN) < 30_000), "one hour, as the email says");

  // the second link is used
  const NEW = "a-new-long-password";
  assert.equal((await http("/reset-password", { newPassword: NEW, token: second })).status, 200);
  // used once: not again; and the first link died with it
  assert.deepEqual([(await http("/reset-password", { newPassword: "third-long-password", token: second })).code, (await http("/reset-password", { newPassword: "third-long-password", token: first })).code], ["INVALID_TOKEN", "INVALID_TOKEN"]);
  assert.equal((await real.select().from(V).where(eq(V.value, me.id))).length, 0);
  // the owner is in at once with the new password; the old session and the old password are gone
  assert.equal((await http("/sign-in/email", { email: me.email, password: NEW })).status, 200);
  assert.equal((await http("/get-session", undefined, me.cookie)).json, null);
  assert.equal((await wrong(me.email)).status, 401);
  assert.equal((await http("/sign-in/email", { email: me.email, password: PASSWORD })).status, 401);
});

test("a link sent before links were stored hashed still works until it expires", async () => {
  const me = await signedUp();
  await real.insert(V).values({ id: `old-${++n}`, identifier: "reset-password:anOldPlainToken0123456789", value: me.id, expiresAt: new Date(Date.now() + 10 * MIN) });
  assert.equal((await http("/reset-password", { newPassword: "a-new-long-password", token: "anOldPlainToken0123456789" })).status, 200);
});

test("at most 3 reset emails and 3 confirm emails an hour go to one address, and the answer does not say whether one was sent", async () => {
  const { MAILS_PER_ADDRESS_MAX: max, counterId } = await rl();
  const me = await signedUp();
  const sent = mails.length;
  const answers: unknown[] = [];
  for (let i = 0; i < max + 3; i++) { const r = await http("/request-password-reset", { email: me.email.toUpperCase(), redirectTo: "/reset-password" }); answers.push([r.status, r.json]); }
  assert.deepEqual(mails.slice(sent), Array(max).fill({ to: me.email, kind: "reset" }));
  assert.deepEqual(answers, Array(max + 3).fill(answers[0]), "sent or not, the same answer");
  const nobody = await http("/request-password-reset", { email: "nobody@test.invalid", redirectTo: "/reset-password" });
  assert.deepEqual([nobody.status, nobody.json], answers[0], "and the same as for an address nobody has");
  assert.equal(JSON.stringify(await counter(counterId("mail-reset", me.email))).includes(me.email), false);
  // an hour later the next one goes out
  await endWindow(counterId("mail-reset", me.email));
  await http("/request-password-reset", { email: me.email, redirectTo: "/reset-password" });
  assert.equal(mails.length - sent, max + 1);

  // confirm emails: the one sign-up sends counts
  const email = `slow${++n}@test.invalid`;
  const before = mails.length;
  await http("/sign-up/email", { name: "S", email, password: PASSWORD });
  const again: unknown[] = [];
  for (let i = 0; i < max + 1; i++) { const r = await http("/send-verification-email", { email, callbackURL: "/login?verified=1" }); again.push([r.status, r.json]); }
  assert.deepEqual(mails.slice(before), Array(max).fill({ to: email, kind: "verify" }));
  assert.deepEqual(again, Array(max + 1).fill([200, { status: true }]));
  // the two kinds are counted apart: this address can still get a reset link
  await http("/request-password-reset", { email, redirectTo: "/reset-password" });
  assert.deepEqual(mails[mails.length - 1], { to: email, kind: "reset" });
});

test("an email that could not be sent does not use up the address's share: the next tries still send", async () => {
  const { MAILS_PER_ADDRESS_MAX: max, counterId } = await rl();
  const me = await signedUp();
  await rl().then((m) => m.forget(counterId("mail-reset", me.email)));
  const sent = mails.length;
  mailDown = true;
  try { await quiet(async () => { for (let i = 0; i < max + 2; i++) assert.equal((await http("/request-password-reset", { email: me.email, redirectTo: "/reset-password" })).status, 200); }); }
  finally { mailDown = false; }
  assert.equal(Number((await counter(counterId("mail-reset", me.email)))?.value ?? 0), 0);
  for (let i = 0; i < max + 1; i++) await http("/request-password-reset", { email: me.email, redirectTo: "/reset-password" });
  assert.equal(mails.length - sent, max, "the full share goes out once the provider is back, and no more");
});

test("the bare password check is switched off: it cannot be used to guess a password with a stolen session", async () => {
  const me = await signedUp();
  for (const password of [PASSWORD, "not-the-password"]) assert.equal((await http("/verify-password", { password }, me.cookie)).status, 404);
});

test("sign-up with a used address, many times at the same moment: one email, not one each", async () => {
  const me = await signedUp();
  const sent = mails.length;
  const rs = await Promise.all(Array.from({ length: 8 }, () => http("/sign-up/email", { name: "X", email: me.email, password: PASSWORD })));
  assert.ok(rs.every((r) => r.status === 200));
  assert.deepEqual(mails.slice(sent), [{ to: me.email, kind: "other" }]);
});

test("a changed password signs every other device out even when the request asks not to; wrong current passwords on one session are capped", async () => {
  const { PASSWORD_CHECK_FAILS_MAX: max } = await rl();
  const me = await signedUp();
  const other = (await http("/sign-in/email", { email: me.email, password: PASSWORD })).setCookie.split(";")[0];
  assert.ok((await http("/get-session", undefined, other)).json, "a second device is signed in");
  const NEW = "another-long-password";
  const ok = await http("/change-password", { currentPassword: PASSWORD, newPassword: NEW, revokeOtherSessions: false }, me.cookie);
  assert.equal(ok.status, 200);
  assert.equal((await http("/get-session", undefined, other)).json, null, "the other device is out");
  const mine = ok.setCookie.split(";")[0];
  assert.ok((await http("/get-session", undefined, mine)).json, "this one stays in, on a new session");

  // someone at a signed-in browser guessing the current password
  const tries: number[] = [];
  for (let i = 0; i < max + 2; i++) tries.push((await http("/change-password", { currentPassword: `guess-number-${i}`, newPassword: "x".repeat(12) }, mine)).status);
  assert.deepEqual(tries, [...Array(max).fill(400), 429, 429]);
  assert.equal((await http("/change-password", { currentPassword: NEW, newPassword: "x".repeat(12) }, mine)).status, 429, "locked for this session, the right one too");
  assert.equal((await http("/sign-in/email", { email: me.email, password: NEW })).status, 200, "the password was not changed, and log-in is not held up by it");
  // a password that is too short is not a guess and is not counted
  const fresh = await signedUp();
  for (let i = 0; i < max + 2; i++) assert.equal((await http("/change-password", { currentPassword: PASSWORD, newPassword: "short" }, fresh.cookie)).code, "PASSWORD_TOO_SHORT");
  assert.equal((await http("/change-password", { currentPassword: PASSWORD, newPassword: NEW }, fresh.cookie)).status, 200);
});
