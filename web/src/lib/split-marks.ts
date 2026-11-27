import { and, asc, eq, gt, inArray, like } from "drizzle-orm";
import { db, schema } from "@/db";

/**
 * What a zip split leaves in the audit log, so a zip sent again (or twice at once) never makes or charges a car twice.
 * - `case.split` row per case made: `<case id>|<zip name>|<zip size>|<folder prefix>`.
 * - `case.split.lock` row while a split runs: `<zip name>|<zip size>|`. The oldest live lock of a zip wins; it is removed when the
 *   call ends, and one older than LOCK_MS (a function killed by its time limit) no longer counts.
 */
export const REPEAT_MS = 30 * 24 * 3600_000; // a second upload of the same zip within 30 days only makes the cars still missing
export const LOCK_MS = 6 * 60_000; // a split runs at most 300 s

export const splitKey = (name: string, size: number) => `${name}|${size}|`;
const esc = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);
const audit = schema.auditLog;

/** Cars of this zip already made by an earlier call whose case still exists: folder prefix -> case id. */
export async function earlierCars(orgId: string, name: string, size: number): Promise<Map<string, string>> {
  const key = splitKey(name, size);
  const marks = await db.select({ detail: audit.detail }).from(audit).where(and(eq(audit.orgId, orgId), eq(audit.action, "case.split"),
    like(audit.detail, `%|${esc(key)}%`), gt(audit.at, new Date(Date.now() - REPEAT_MS))));
  const out = new Map<string, string>();
  for (const m of marks) { const d = m.detail ?? ""; const i = d.indexOf("|"); if (d.slice(i + 1).startsWith(key)) out.set(d.slice(i + 1 + key.length), d.slice(0, i)); }
  if (!out.size) return out;
  const alive = new Set((await db.select({ id: schema.cases.id }).from(schema.cases).where(and(eq(schema.cases.orgId, orgId), inArray(schema.cases.id, [...out.values()])))).map((c) => c.id));
  for (const [p, id] of out) if (!alive.has(id)) out.delete(p);
  return out;
}

/** Takes the split lock of a zip. Returns a release function, or null when another call is splitting the same zip right now. */
export async function lockSplit(orgId: string, userId: string, name: string, size: number): Promise<(() => Promise<void>) | null> {
  const key = splitKey(name, size);
  const [mine] = await db.insert(audit).values({ orgId, userId, action: "case.split.lock", detail: key }).returning({ id: audit.id });
  const release = async () => { await db.delete(audit).where(eq(audit.id, mine.id)).catch(() => {}); };
  let first: { id: number } | undefined;
  try {
    [first] = await db.select({ id: audit.id }).from(audit).where(and(eq(audit.orgId, orgId), eq(audit.action, "case.split.lock"),
      eq(audit.detail, key), gt(audit.at, new Date(Date.now() - LOCK_MS)))).orderBy(asc(audit.id)).limit(1);
  } catch (e) { await release(); throw e; } // the row is never left behind by a failed check
  if (first && first.id !== mine.id) { await release(); return null; }
  return release;
}

/** Is a split of this organisation running? Its new cases are not read by the self-heal until it ends (a rollback deletes them). */
export async function splitRunning(orgId: string): Promise<boolean> {
  const [x] = await db.select({ id: audit.id }).from(audit).where(and(eq(audit.orgId, orgId), eq(audit.action, "case.split.lock"),
    gt(audit.at, new Date(Date.now() - LOCK_MS)))).limit(1);
  return !!x;
}
