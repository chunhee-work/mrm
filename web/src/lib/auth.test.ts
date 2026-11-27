// The real auth server (auth.ts) and session reader (session.ts) on a real Postgres in memory (PGlite) with the real migrations.
// Emails are collected instead of sent; the request's headers and the redirect of a page are stand-ins. No network, no secrets.
import { before, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import Module from "node:module";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import * as schema from "../db/schema";
import { MAX_NAME } from "./account-name";

const pg = new PGlite();
const real = drizzle(pg, { schema });
// the database with a switch: the next insert into one table fails once (a blip at the worst moment)
let failInsertInto: unknown = null;
const db = new Proxy(real, {
  get(target, p) {
    if (p !== "insert") return (target as unknown as Record<PropertyKey, unknown>)[p];
    return (table: Parameters<typeof real.insert>[0]) => {
      if (table === failInsertInto) { failInsertInto = null; throw new Error("database blip"); }
      return target.insert(table);
    };
  },
});
const mails: { to: string; kind: string }[] = [];
let reqHeaders = new Headers();
class Redirected extends Error { constructor(public to: string) { super(`redirect ${to}`); } }
const stubs: Record<string, unknown> = {
  "@/db": { db, schema },
  "./email": { sendEmail: async (to: string, _subject: string, _html: string, kind: string) => { mails.push({ to, kind }); } },
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
async function http(p: string, body?: unknown, cookie?: string) {
  const { auth } = await kit();
  const r = await auth.handler(new Request(`http://localhost:3000/api/auth${p}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { origin: "http://localhost:3000", ...(body === undefined ? {} : { "content-type": "application/json" }), ...(cookie ? { cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  }));
  const text = await r.text();
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
