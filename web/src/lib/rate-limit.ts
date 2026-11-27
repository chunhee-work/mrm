// Counters with an expiry, kept in the database, so a cap holds across every server instance (on serverless a count kept in
// memory is per instance and limits nothing). No table of their own: each counter is one row of `verification`, value = the
// count, expires_at = the end of its window.
//
// How two requests at the same moment are kept from both slipping under a cap: the row's primary key is worked out from
// what is counted (`rl:<kind>:<hash>`), so ONE statement, INSERT ... ON CONFLICT (id) DO UPDATE, makes the row or adds one
// to it. Postgres takes the row lock for that statement, so every request sees the count the one before it left: the cap is
// exact, with no margin, and it costs one query. (The `identifier` column has no unique index, which is why the id is used.
// Counting rows in a window, or UPDATE first and INSERT when nothing was there, both let a burst of first requests through.)
import { createHash } from "node:crypto";
import { and, eq, gt, inArray, like, lt, sql } from "drizzle-orm";
import { db, schema } from "@/db";

// ---- every number in one place ----
const MIN = 60_000;
/**
 * Per client address, by auth path (seconds, as Better Auth counts). Without `fixed` the window is Better Auth's own kind:
 * it runs from the last request let through, so after `max` requests the address must stay quiet for `window` seconds.
 * With `fixed` it runs from the first request: at most `max` in any one window.
 */
export const IP_RULES: Record<string, { max: number; window: number; fixed?: boolean }> = {
  "/sign-in/email": { max: 3, window: 10 },
  "/sign-up/email": { max: 10, window: 10 * 60, fixed: true }, // every one sends an email
  "/request-password-reset": { max: 3, window: 60 },
  "/send-verification-email": { max: 3, window: 60 },
  "/reset-password": { max: 5, window: 60 },
  "/change-password": { max: 3, window: 10 },
};
/** Every other auth path together, per client address. */
export const IP_RULE_REST = { max: 100, window: 10 };
/** Wrong passwords for one email address, from any client address; then every log-in to it is refused until the window ends. */
export const SIGN_IN_FAILS_MAX = 10;
export const SIGN_IN_FAILS_WINDOW_MS = 10 * MIN;
/** Wrong "current password" tries on one signed-in session (change password). */
export const PASSWORD_CHECK_FAILS_MAX = 10;
export const PASSWORD_CHECK_FAILS_WINDOW_MS = 10 * MIN;
/** Emails to one address: reset links, and confirm links, each counted on its own. */
export const MAILS_PER_ADDRESS_MAX = 3;
export const MAILS_PER_ADDRESS_WINDOW_MS = 60 * MIN;
/** "You already have an account" emails (sign-up with a used address) to one address. */
export const SIGNUP_AGAIN_MAILS_MAX = 1;
export const SIGNUP_AGAIN_WINDOW_MS = 10 * MIN;

// ---- the store ----
const v = schema.verification;
const PREFIX = "rl:";
const SWEEP_EVERY_MS = 10 * MIN;

/** The row of one counter. What is counted (an address, a cookie) is hashed: it is never stored as it is, and the id stays short. */
export const counterId = (kind: string, who: string) => `${PREFIX}${kind}:${createHash("sha256").update(who).digest("hex").slice(0, 40)}`;

export type Hit = { allowed: boolean; retryAfter: number };
const ts = (ms: number) => sql`${new Date(ms).toISOString()}::timestamp`;

/**
 * Counts one try. `allowed` is false once more than `max` tries were counted in the window. A refused try is not counted
 * and does not make the wait longer. `quiet`: the window starts again at every try that was let through (see IP_RULES).
 * Throws when the database does.
 */
export async function hit(id: string, max: number, windowMs: number, opts: { quiet?: boolean } = {}): Promise<Hit> {
  const now = Date.now();
  const over = sql`${v.expiresAt} <= ${ts(now)}`;
  const [row] = await db.insert(v)
    .values({ id, identifier: id, value: "1", expiresAt: new Date(now + windowMs), createdAt: new Date(now), updatedAt: new Date(now) })
    .onConflictDoUpdate({
      target: v.id,
      set: {
        // max + 1 means "refused"; it never grows past that
        value: sql`CASE WHEN ${over} THEN '1' ELSE LEAST(${v.value}::int + 1, ${max + 1}::int)::text END`,
        expiresAt: opts.quiet
          ? sql`CASE WHEN ${over} OR ${v.value}::int < ${max}::int THEN ${ts(now + windowMs)} ELSE ${v.expiresAt} END`
          : sql`CASE WHEN ${over} THEN ${ts(now + windowMs)} ELSE ${v.expiresAt} END`,
        updatedAt: new Date(now),
      },
    })
    .returning({ value: v.value, expiresAt: v.expiresAt });
  await sweep(now);
  return { allowed: Number(row.value) <= max, retryAfter: Math.max(1, Math.ceil((row.expiresAt.getTime() - now) / 1000)) };
}

/** The same, but a database that does not answer lets the request through: a limiter that is down must not lock everyone out. */
export async function hitOrAllow(id: string, max: number, windowMs: number, opts: { quiet?: boolean } = {}): Promise<Hit> {
  try { return await hit(id, max, windowMs, opts); } catch (e) { console.error("rate limit store failed:", (e as Error)?.name); return { allowed: true, retryAfter: 0 }; }
}

/** Takes one counted try back (it turned out not to be the kind that is capped). Never throws. */
export async function giveBack(id: string, max: number): Promise<void> {
  try {
    await db.update(v).set({ value: sql`GREATEST(LEAST(${v.value}::int, ${max}::int) - 1, 0)::text` }).where(and(eq(v.id, id), gt(v.expiresAt, new Date())));
  } catch (e) { console.error("rate limit store failed:", (e as Error)?.name); }
}

/** Starts counters again from nothing. Never throws. */
export async function forget(...ids: string[]): Promise<void> {
  try { if (ids.length) await db.delete(v).where(inArray(v.id, ids)); } catch (e) { console.error("rate limit store failed:", (e as Error)?.name); }
}

/** A marker that is there until `until` (no count). Never throws; `isMarked` answers false when the database does not. */
export async function mark(id: string, until: Date): Promise<void> {
  try { await db.insert(v).values({ id, identifier: id, value: "1", expiresAt: until }).onConflictDoNothing(); } catch (e) { console.error("rate limit store failed:", (e as Error)?.name); }
}
export async function isMarked(id: string): Promise<boolean> {
  try { return (await db.select({ id: v.id }).from(v).where(and(eq(v.id, id), gt(v.expiresAt, new Date()))).limit(1)).length > 0; }
  catch (e) { console.error("rate limit store failed:", (e as Error)?.name); return false; }
}

// Rows whose window ended are dead weight. Each server instance removes them at its first counted try and then every ten
// minutes (one more quick query on that one request); a row that ended is also started again in place by the next try, so
// nothing waits for this.
let lastSweep = 0;
async function sweep(now: number): Promise<void> {
  if (now - lastSweep < SWEEP_EVERY_MS) return;
  lastSweep = now;
  try { await db.delete(v).where(and(like(v.id, `${PREFIX}%`), lt(v.expiresAt, new Date(now - MIN)))); } catch { /* the next sweep gets them */ }
}
export const sweepNowForTests = () => { lastSweep = 0; return sweep(Date.now()); };

// ---- Better Auth's per-address limiter on this store ----
const rules = (): Record<string, { max: number; window: number }> => Object.fromEntries(Object.entries(IP_RULES).map(([p, r]) => [p, { max: r.max, window: r.window }]));

/**
 * `rateLimit` for betterAuth(). Better Auth works out the client address and the path and asks `consume` with the key
 * `<address>|<path>`. The rule is read from IP_RULES here, not from what is passed in: every path without a rule of its own
 * shares one counter per address (a path is whatever the client typed, so one row per path would let anyone fill the table).
 */
export const authRateLimit = {
  window: IP_RULE_REST.window,
  max: IP_RULE_REST.max,
  customRules: rules(),
  customStorage: {
    async consume(key: string): Promise<{ allowed: boolean; retryAfter: number | null }> {
      const cut = key.indexOf("|");
      const path = key.slice(cut + 1);
      const rule = Object.hasOwn(IP_RULES, path) ? IP_RULES[path] : null;
      const r = rule ?? IP_RULE_REST;
      return hitOrAllow(counterId("ip", `${key.slice(0, cut)}|${rule ? path : "*"}`), r.max, r.window * 1000, { quiet: !rule?.fixed });
    },
  },
};
