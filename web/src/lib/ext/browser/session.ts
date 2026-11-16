// Plan #40. The in-app Merimen browser, one session per organisation. Callers must already have passed the gate (getExtState === "ready").
import { and, eq, isNull, isNotNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { getProvider, type BrowserProvider } from "./provider";
import { MERIMEN_START_URL, isLoggedInUrl, nextStatus, sessionVerdict, type BrowserStatus } from "./rules";

export type View =
  | { state: "unavailable" }                                  // no browser service configured
  | { state: "idle" }                                         // nothing open
  | { state: "in_use" }                                       // another user of this org has it open
  | { state: "open"; status: BrowserStatus; liveView: string };

const row = async (orgId: string) => (await db.select().from(schema.merimenConnections).where(eq(schema.merimenConnections.orgId, orgId)).limit(1))[0];

async function closeRow(orgId: string, p: BrowserProvider | null, sessionId: string | null) {
  if (p && sessionId) { try { await p.release(sessionId); } catch { /* the service's own timeout ends it */ } }
  await db.update(schema.merimenConnections)
    .set({ browserbaseSessionId: null, status: "none", sessionParamsEnc: null, openedBy: null, openedAt: null, lastCheckAt: null })
    // only the session we released: a stale close must not erase a replacement that was claimed meanwhile
    .where(sessionId ? and(eq(schema.merimenConnections.orgId, orgId), eq(schema.merimenConnections.browserbaseSessionId, sessionId)) : eq(schema.merimenConnections.orgId, orgId));
}

/** Reads the current state for `userId`. Closes the session when it is idle or too old. Touches the idle clock for the opener. */
export async function currentView(orgId: string, userId: string, provider = getProvider()): Promise<View> {
  if (!provider) return { state: "unavailable" };
  const r = await row(orgId);
  if (!r || !r.browserbaseSessionId || !r.openedAt) return { state: "idle" };
  if (sessionVerdict({ openedAt: r.openedAt, lastSeenAt: r.lastCheckAt }) !== "keep") { await closeRow(orgId, provider, r.browserbaseSessionId); return { state: "idle" }; }
  if (r.openedBy !== userId) return { state: "in_use" };
  let loggedIn = false;
  try { loggedIn = (await provider.pageUrls(r.browserbaseSessionId)).some(isLoggedInUrl); } catch { /* treat as not logged in this time */ }
  const status = nextStatus(r.status as BrowserStatus, loggedIn);
  await db.update(schema.merimenConnections).set({ status, lastCheckAt: new Date(), ...(status === "connected" && r.status !== "connected" ? { connectedAt: new Date() } : {}) })
    .where(eq(schema.merimenConnections.orgId, orgId));
  return { state: "open", status, liveView: await provider.liveViewUrl(r.browserbaseSessionId) };
}

export async function openBrowser(orgId: string, userId: string, provider = getProvider()): Promise<View> {
  if (!provider) return { state: "unavailable" };
  const cur = await currentView(orgId, userId, provider);
  if (cur.state === "open" || cur.state === "in_use") return cur;
  const id = await provider.create();
  // the live window must not outlive an error here
  try { await provider.navigate(id, MERIMEN_START_URL); } catch (e) { try { await provider.release(id); } catch {} throw e; }
  const now = new Date();
  // Only the session id is stored. No address, cookie or password: the connect address is rebuilt from the service key when needed.
  // (Keeping the login between visits, encrypted, is P2 of plan #40.)
  // Claim the org's slot atomically: the update only applies when no session is stored. A request that loses the race releases its own window.
  const claimed = await db.insert(schema.merimenConnections).values({ orgId, browserbaseSessionId: id, status: "waiting_login", openedBy: userId, openedAt: now, lastCheckAt: now })
    .onConflictDoUpdate({ target: schema.merimenConnections.orgId, set: { browserbaseSessionId: id, status: "waiting_login", openedBy: userId, openedAt: now, lastCheckAt: now, connectedAt: null }, setWhere: isNull(schema.merimenConnections.browserbaseSessionId) })
    .returning({ id: schema.merimenConnections.browserbaseSessionId });
  if (!claimed.length) { try { await provider.release(id); } catch {} return currentView(orgId, userId, provider); }
  return { state: "open", status: "waiting_login", liveView: await provider.liveViewUrl(id) };
}

export async function closeBrowser(orgId: string, userId: string, provider = getProvider()): Promise<View> {
  const r = await row(orgId);
  if (r?.browserbaseSessionId && r.openedBy && r.openedBy !== userId) return { state: "in_use" }; // not yours to close
  if (r?.browserbaseSessionId) await closeRow(orgId, provider, r.browserbaseSessionId);
  return provider ? { state: "idle" } : { state: "unavailable" };
}

/** Closes every session that is idle or too old, with nobody needing to visit the page. Called by a scheduler (see /api/ext/browser/sweep). */
export async function sweepExpired(provider = getProvider()): Promise<number> {
  if (!provider) return 0;
  const rows = await db.select().from(schema.merimenConnections).where(isNotNull(schema.merimenConnections.browserbaseSessionId));
  let n = 0;
  for (const r of rows) {
    if (!r.browserbaseSessionId || !r.openedAt) continue;
    if (sessionVerdict({ openedAt: r.openedAt, lastSeenAt: r.lastCheckAt }) !== "keep") { await closeRow(r.orgId, provider, r.browserbaseSessionId); n++; }
  }
  return n;
}
