import { sql } from "drizzle-orm";
import { db } from "@/db";

/**
 * Admin "wipe user": erases one person completely, by e-mail. One way, no undo.
 *
 * Gone: the login (user, account, session, verification), the Merimen username and password, the manager / adjuster / workshops,
 * every case with its files, photos, screenshots, read text, jobs and events, the worker's saved session, the extension rows,
 * and every stored file (Blob) under the organisation and under screenshots/<user>/.
 * Kept, without a person attached: the payment orders and the credit ledger (money history; they hold no name, e-mail or address),
 * the AI cost rows and the audit rows (their user id is cleared). The organisation row stays as an empty shell renamed "wiped-…",
 * because those money rows point at it. No schema change is needed for this.
 * Refused (nothing is touched): the e-mail is unknown, the organisation still has another member, or a job is running.
 */

type Rows<T> = { rows?: T[] } | T[];
const rowsOf = <T,>(r: unknown): T[] => ((r as Rows<T>) && !Array.isArray(r) ? (r as { rows?: T[] }).rows ?? [] : (r as T[])) ?? [];
const inList = (ids: string[]) => sql`(${sql.join(ids.map((i) => sql`${i}`), sql`, `)})`;

export type WipeCounts = {
  cases: number; caseFiles: number; photos: number; screenshots: number; jobs: number; sessions: number;
  workshops: number; hasMerimenLogin: boolean; storedFiles: number; paymentOrders: number; ledgerRows: number;
};
export type WipeRefusal = "not_found" | "shared_org" | "running_job" | "bad_email";
export type WipePreview =
  | { ok: true; userId: string; email: string; name: string; orgIds: string[]; counts: WipeCounts }
  | { ok: false; reason: WipeRefusal };
export type WipeResult = { ok: true; counts: WipeCounts; removedFiles: number; leftFiles: number } | { ok: false; reason: WipeRefusal | "confirm_mismatch" | "storage_failed" };
export type WipeStore = { remove: (path: string) => Promise<void>; listPrefix: (prefix: string) => Promise<string[]> };

export const normEmail = (s: string) => s.trim().toLowerCase();

const bareOf = (p: string) => { try { return /^https?:\/\//.test(p) ? decodeURIComponent(new URL(p).pathname.replace(/^\//, "")) : p; } catch { return p; } };

async function find(email: string) {
  const r = rowsOf<{ id: string; name: string; email: string }>(await db.execute(sql`SELECT id, name, email FROM "user" WHERE lower(email) = ${email} LIMIT 1`));
  return r[0] ?? null;
}

async function dbPaths(orgIds: string[], userId: string): Promise<string[]> {
  if (!orgIds.length) return [];
  const org = inList(orgIds);
  const q = rowsOf<{ p: string | null }>(await db.execute(sql`
    SELECT f.blob_url AS p FROM case_files f JOIN cases c ON c.id = f.case_id WHERE c.org_id IN ${org}
    UNION ALL SELECT p.blob_path FROM case_photos p JOIN cases c ON c.id = p.case_id WHERE c.org_id IN ${org}
    UNION ALL SELECT p.thumb_path FROM case_photos p JOIN cases c ON c.id = p.case_id WHERE c.org_id IN ${org}
    UNION ALL SELECT s.blob_pathname FROM case_screenshots s WHERE s.org_id IN ${org} OR s.user_id = ${userId}
    UNION ALL SELECT u.path FROM photo_uploads u JOIN cases c ON c.id = u.case_id WHERE c.org_id IN ${org}`));
  return q.map((x) => x.p).filter((p): p is string => !!p);
}

const prefixes = (orgIds: string[], userId: string) => [...orgIds.map((o) => `${o}/`), `screenshots/${userId}/`];

async function storedPaths(orgIds: string[], userId: string, store: WipeStore): Promise<string[]> {
  const listed = (await Promise.all(prefixes(orgIds, userId).map((p) => store.listPrefix(p)))).flat();
  return [...new Set([...listed, ...(await dbPaths(orgIds, userId))].map((p) => p.trim()).filter(Boolean))];
}

/** What a wipe would erase, and why it would be refused. Reads only. */
export async function previewWipe(rawEmail: string, store: Pick<WipeStore, "listPrefix">): Promise<WipePreview> {
  const email = normEmail(rawEmail);
  if (!email || !email.includes("@") || email.length > 254) return { ok: false, reason: "bad_email" };
  const u = await find(email);
  if (!u) return { ok: false, reason: "not_found" };
  const orgIds = rowsOf<{ org_id: string }>(await db.execute(sql`SELECT org_id FROM memberships WHERE user_id = ${u.id}`)).map((x) => x.org_id);
  if (orgIds.length) {
    const org = inList(orgIds);
    const other = rowsOf<{ n: number }>(await db.execute(sql`SELECT count(*)::int AS n FROM memberships WHERE org_id IN ${org} AND user_id <> ${u.id}`))[0]?.n ?? 0;
    if (other > 0) return { ok: false, reason: "shared_org" };
    const running = rowsOf<{ n: number }>(await db.execute(sql`SELECT count(*)::int AS n FROM jobs j JOIN cases c ON c.id = j.case_id WHERE c.org_id IN ${org} AND j.state = 'running'`))[0]?.n ?? 0;
    if (running > 0) return { ok: false, reason: "running_job" };
  }
  const c = await counts(u.id, orgIds, store);
  return { ok: true, userId: u.id, email: u.email, name: u.name, orgIds, counts: c };
}

async function counts(userId: string, orgIds: string[], store: Pick<WipeStore, "listPrefix">): Promise<WipeCounts> {
  const arr = inList(orgIds.length ? orgIds : [""]);
  const one = async (q: ReturnType<typeof sql>) => Number(rowsOf<{ n: number }>(await db.execute(q))[0]?.n ?? 0);
  const has = orgIds.length > 0;
  const files = has ? (await Promise.all(prefixes(orgIds, userId).map((p) => store.listPrefix(p)))).flat() : [];
  const referenced = has ? await dbPaths(orgIds, userId) : [];
  return {
    cases: has ? await one(sql`SELECT count(*)::int AS n FROM cases WHERE org_id IN ${arr}`) : 0,
    caseFiles: has ? await one(sql`SELECT count(*)::int AS n FROM case_files f JOIN cases c ON c.id = f.case_id WHERE c.org_id IN ${arr}`) : 0,
    photos: has ? await one(sql`SELECT count(*)::int AS n FROM case_photos p JOIN cases c ON c.id = p.case_id WHERE c.org_id IN ${arr}`) : 0,
    screenshots: has ? await one(sql`SELECT count(*)::int AS n FROM case_screenshots WHERE org_id IN ${arr} OR user_id = ${userId}`) : 0,
    jobs: has ? await one(sql`SELECT count(*)::int AS n FROM jobs j JOIN cases c ON c.id = j.case_id WHERE c.org_id IN ${arr}`) : 0,
    sessions: await one(sql`SELECT count(*)::int AS n FROM session WHERE user_id = ${userId}`),
    workshops: has ? await one(sql`SELECT count(*)::int AS n FROM merimen_workshops WHERE org_id IN ${arr}`) : 0,
    hasMerimenLogin: has ? (await one(sql`SELECT count(*)::int AS n FROM merimen_credentials WHERE org_id IN ${arr}`)) > 0 : false,
    storedFiles: new Set([...files, ...referenced.map(bareOf)]).size,
    paymentOrders: has ? await one(sql`SELECT count(*)::int AS n FROM payment_orders WHERE org_id IN ${arr}`) : 0,
    ledgerRows: has ? await one(sql`SELECT count(*)::int AS n FROM credits_ledger WHERE org_id IN ${arr}`) : 0,
  };
}

/**
 * Wipes the user. `confirm` must be the e-mail typed again. Order is built so a failure half-way can simply be run again:
 * sessions first (the user is logged out), then the stored files, then the rows; the `user` row goes last and is the marker that
 * the wipe is finished (a second run finds nothing left to erase, and says not_found).
 */
export async function wipeUser(rawEmail: string, confirm: string, store: WipeStore): Promise<WipeResult> {
  if (normEmail(rawEmail) !== normEmail(confirm)) return { ok: false, reason: "confirm_mismatch" };
  const p = await previewWipe(rawEmail, store);
  if (!p.ok) return p;
  const { userId, orgIds, email } = p;

  await db.execute(sql`DELETE FROM session WHERE user_id = ${userId}`); // out of every device at once
  const paths = await storedPaths(orgIds, userId, store);
  for (let i = 0; i < paths.length; i += 5) {
    try { await Promise.all(paths.slice(i, i + 5).map(store.remove)); }
    catch (e) { console.error("wipe: removing a stored file failed", e); return { ok: false, reason: "storage_failed" }; } // rows untouched: run it again
  }

  if (orgIds.length) {
    const arr = inList(orgIds.length ? orgIds : [""]);
    // the running-job check again, right before the rows go (a job may have been claimed since the preview)
    const running = rowsOf<{ n: number }>(await db.execute(sql`SELECT count(*)::int AS n FROM jobs j JOIN cases c ON c.id = j.case_id WHERE c.org_id IN ${arr} AND j.state = 'running'`))[0]?.n ?? 0;
    if (running > 0) return { ok: false, reason: "running_job" };
    await db.execute(sql`DELETE FROM cases WHERE org_id IN ${arr}`); // files, photos, jobs, events, usage, ext jobs, screenshots, plans... follow (ON DELETE CASCADE)
    for (const t of ["merimen_credentials", "merimen_workshops", "merimen_connections", "merimen_otp", "worker_sessions", "ext_org_settings", "ext_consents", "ext_pairing_codes", "ext_installs"]) {
      await db.execute(sql`DELETE FROM ${sql.raw(t)} WHERE org_id IN ${arr}`);
    }
    await db.execute(sql`UPDATE organizations SET name = 'wiped-' || left(id, 8) WHERE id IN ${arr}`);
    await db.execute(sql`DELETE FROM memberships WHERE org_id IN ${arr}`);
  }
  // history without a person: the user id goes, the amounts and dates stay
  await db.execute(sql`UPDATE payment_orders SET user_id = NULL WHERE user_id = ${userId}`);
  await db.execute(sql`UPDATE llm_calls SET user_id = NULL WHERE user_id = ${userId}`);
  await db.execute(sql`UPDATE audit_log SET user_id = NULL WHERE user_id = ${userId}`);
  await db.execute(sql`UPDATE merimen_cred_audit SET user_id = NULL WHERE user_id = ${userId}`);
  await db.execute(sql`DELETE FROM verification WHERE lower(identifier) LIKE ${"%" + email.toLowerCase().replace(/[\\%_]/g, "\\$&") + "%"} OR value = ${userId}`);

  // files that landed while the wipe ran
  const left = orgIds.length || userId ? (await Promise.all(prefixes(orgIds, userId).map((x) => store.listPrefix(x)))).flat() : [];
  for (const f of left) await store.remove(f).catch((e) => console.error("wipe: late file", e));
  const after = orgIds.length ? (await Promise.all(prefixes(orgIds, userId).map((x) => store.listPrefix(x)))).flat() : [];

  await db.execute(sql`DELETE FROM "user" WHERE id = ${userId}`); // account + session rows follow; this is the "finished" marker
  await db.execute(sql`INSERT INTO audit_log (org_id, user_id, action, detail) VALUES (${orgIds[0] ?? null}, NULL, 'user.wipe', ${`${userId.slice(0, 8)}|cases ${p.counts.cases}|files ${paths.length + left.length}`})`);
  return { ok: true, counts: p.counts, removedFiles: paths.length + left.length, leftFiles: after.length };
}
