import { sql } from "drizzle-orm";
import { db } from "@/db";

/**
 * Admin "white out": empties one account, by e-mail. One way, no undo. THE ACCOUNT STAYS (owner 2026-11-27).
 *
 * Kept: the user row, the login (password, login sessions, verification), the company account and its membership, the credit balance
 * and ledger, payment orders, AI cost rows (llm_calls), audit_log and merimen_cred_audit, and the owner's Merimen consent rows
 * (ext_org_settings, ext_consents; without them the worker would not run this account's jobs again).
 * Erased: the Merimen username and password, workshops, every case with its files, photos, screenshots, read text, jobs, events and
 * per-case usage rows, the worker's saved session, extension pairing codes and installs, and every stored file (Blob) under
 * `<company id>/` and `screenshots/<user id>/` (only paths under those two folders are ever removed).
 * Nothing is changed inside Merimen itself.
 * Refused (nothing touched): unknown e-mail, the company account has another member, a job is running (also re-checked after
 * queued and paused jobs are cancelled; if one started meanwhile they are put back). Not atomic (no transactions on Neon http):
 * failures after the first removal return storage_failed / partial and a second run finishes the job.
 */

type Rows<T> = { rows?: T[] } | T[];
const rowsOf = <T,>(r: unknown): T[] => ((r as Rows<T>) && !Array.isArray(r) ? (r as { rows?: T[] }).rows ?? [] : (r as T[])) ?? [];
const inList = (ids: string[]) => sql`(${sql.join(ids.map((i) => sql`${i}`), sql`, `)})`;

export type WipeCounts = {
  cases: number; caseFiles: number; photos: number; screenshots: number; jobs: number;
  workshops: number; hasMerimenLogin: boolean; storedFiles: number; paymentOrders: number; ledgerRows: number;
};
export type WipeRefusal = "not_found" | "shared_org" | "running_job" | "bad_email";
export type WipePreview =
  | { ok: true; userId: string; email: string; name: string; orgIds: string[]; counts: WipeCounts }
  | { ok: false; reason: WipeRefusal };
export type WipeResult = { ok: true; counts: WipeCounts; removedFiles: number; leftFiles: number } | { ok: false; reason: WipeRefusal | "confirm_mismatch" | "storage_failed" | "partial" | "error" };
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
    UNION ALL SELECT s.blob_pathname FROM case_screenshots s WHERE s.org_id IN ${org}
    UNION ALL SELECT l.blob_path FROM photo_learning l JOIN cases c ON c.id = l.case_id WHERE c.org_id IN ${org}
    UNION ALL SELECT u.path FROM photo_uploads u JOIN cases c ON c.id = u.case_id WHERE c.org_id IN ${org}`));
  return q.map((x) => x.p).filter((p): p is string => !!p);
}

const prefixes = (orgIds: string[], userId: string) => [...orgIds.map((o) => `${o}/`), `screenshots/${userId}/`];

/** Only files that live under this user's own folders are ever removed (a stored path pointing anywhere else is left alone). */
async function storedPaths(orgIds: string[], userId: string, store: Pick<WipeStore, "listPrefix">): Promise<string[]> {
  const own = prefixes(orgIds, userId);
  const listed = (await Promise.all(own.map((p) => store.listPrefix(p)))).flat();
  const referenced = (await dbPaths(orgIds, userId)).map(bareOf);
  return [...new Set([...listed.map(bareOf), ...referenced].filter((p) => p && own.some((x) => p.startsWith(x))))];
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
  const stored = await storedPaths(orgIds, userId, store);
  return {
    cases: has ? await one(sql`SELECT count(*)::int AS n FROM cases WHERE org_id IN ${arr}`) : 0,
    caseFiles: has ? await one(sql`SELECT count(*)::int AS n FROM case_files f JOIN cases c ON c.id = f.case_id WHERE c.org_id IN ${arr}`) : 0,
    photos: has ? await one(sql`SELECT count(*)::int AS n FROM case_photos p JOIN cases c ON c.id = p.case_id WHERE c.org_id IN ${arr}`) : 0,
    screenshots: has ? await one(sql`SELECT count(*)::int AS n FROM case_screenshots WHERE org_id IN ${arr}`) : 0,
    jobs: has ? await one(sql`SELECT count(*)::int AS n FROM jobs j JOIN cases c ON c.id = j.case_id WHERE c.org_id IN ${arr}`) : 0,
    workshops: has ? await one(sql`SELECT count(*)::int AS n FROM merimen_workshops WHERE org_id IN ${arr}`) : 0,
    hasMerimenLogin: has ? (await one(sql`SELECT count(*)::int AS n FROM merimen_credentials WHERE org_id IN ${arr}`)) > 0 : false,
    storedFiles: stored.length,
    paymentOrders: has ? await one(sql`SELECT count(*)::int AS n FROM payment_orders WHERE org_id IN ${arr}`) : 0,
    ledgerRows: has ? await one(sql`SELECT count(*)::int AS n FROM credits_ledger WHERE org_id IN ${arr}`) : 0,
  };
}

/**
 * Wipes the user. `confirm` must be the e-mail typed again. Order is built so a failure half-way can simply be run again:
 * running jobs are checked (queued ones cancelled) before anything goes, then the stored files, then the rows. A failure half-way can
 * simply be run again (a second run finds nothing left and succeeds with zeros).
 */
export async function wipeUser(rawEmail: string, confirm: string, store: WipeStore): Promise<WipeResult> {
  if (normEmail(rawEmail) !== normEmail(confirm)) return { ok: false, reason: "confirm_mismatch" };
  const p = await previewWipe(rawEmail, store);
  if (!p.ok) return p;
  const { userId, orgIds } = p;
  const hasOrg = orgIds.length > 0;
  const arr = inList(hasOrg ? orgIds : [""]);
  const running = async () => hasOrg && (rowsOf<{ n: number }>(await db.execute(sql`SELECT count(*)::int AS n FROM jobs j JOIN cases c ON c.id = j.case_id WHERE c.org_id IN ${arr} AND j.state = 'running'`))[0]?.n ?? 0) > 0;
  const audit = (action: string, detail: string) => db.execute(sql`INSERT INTO audit_log (org_id, user_id, action, detail) VALUES (${orgIds[0] ?? null}, ${userId}, ${action}, ${detail})`).catch((e) => console.error("wipe: audit row failed", action, e));

  // 1. a read-only check first: a refusal must change nothing
  if (await running()) return { ok: false, reason: "running_job" };
  // 2. stop new work: queued and paused jobs are cancelled (remembered, so a refusal right after can put them back) and the worker stands down
  let held: { id: number; state: string }[] = [];
  if (hasOrg) {
    held = rowsOf<{ id: number; state: string }>(await db.execute(sql`SELECT id, state FROM jobs WHERE state IN ('queued','paused') AND case_id IN (SELECT id FROM cases WHERE org_id IN ${arr})`));
    await db.execute(sql`UPDATE jobs SET state = 'cancelled' WHERE state IN ('queued','paused') AND case_id IN (SELECT id FROM cases WHERE org_id IN ${arr})`);
    await db.execute(sql`UPDATE worker_sessions SET wanted = 'none' WHERE org_id IN ${arr}`);
    if (await running()) { // a job was claimed between the two checks: put everything back, nothing else was touched
      for (const h of held) await db.execute(sql`UPDATE jobs SET state = ${h.state} WHERE id = ${h.id} AND state = 'cancelled'`);
      return { ok: false, reason: "running_job" };
    }
  }
  await audit("user.wipe.start", `cases ${p.counts.cases}|files ${p.counts.storedFiles}`);
  // 3. stored files, then rows. A failure here can simply be run again.
  const paths = await storedPaths(orgIds, userId, store);
  for (let i = 0; i < paths.length; i += 5) {
    try { await Promise.all(paths.slice(i, i + 5).map((x) => store.remove(x))); }
    catch (e) { console.error("wipe: removing a stored file failed", e); await audit("user.wipe.failed", "storage"); return { ok: false, reason: "storage_failed" }; }
  }
  try {
    if (hasOrg) {
      if (await running()) throw new Error("a job started during the wipe");
      await db.execute(sql`DELETE FROM cases WHERE org_id IN ${arr}`); // files, photos, jobs, events, usage, ext jobs, screenshots, plans... follow (ON DELETE CASCADE)
      // kept on purpose: ext_org_settings and ext_consents (the owner's written consent, the worker needs it for this account to work again)
      // and merimen_cred_audit (audit history, and the rate limit of credential saves)
      for (const t of ["merimen_credentials", "merimen_workshops", "merimen_connections", "merimen_otp", "worker_sessions", "ext_pairing_codes", "ext_installs"]) {
        await db.execute(sql`DELETE FROM ${sql.raw(t)} WHERE org_id IN ${arr}`);
      }
    }
  } catch (e) {
    console.error("wipe: database step failed", e);
    await audit("user.wipe.failed", "database");
    return { ok: false, reason: "partial" };
  }
  // 4. files that landed while the wipe ran
  const late = (await Promise.all(prefixes(orgIds, userId).map((x) => store.listPrefix(x)))).flat();
  for (const f of late) await store.remove(f).catch((e) => console.error("wipe: late file", e));
  const after = (await Promise.all(prefixes(orgIds, userId).map((x) => store.listPrefix(x)))).flat();
  const removed = paths.length + late.length;
  await audit("user.wipe", `cases ${p.counts.cases}|files ${removed}|left ${after.length}`);
  return { ok: true, counts: p.counts, removedFiles: removed, leftFiles: after.length };
}
