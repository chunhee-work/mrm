import { and, asc, eq, gt, inArray, like } from "drizzle-orm";
import { db, schema } from "@/db";
import { notDeleted } from "@/lib/case-delete";

/**
 * What a zip split leaves in the audit log, so a zip sent again (or twice at once) never makes or charges a car twice.
 * - `case.split` row per case made: `<case id>|<zip name>|<zip size>|<folder prefix>`.
 * - `case.split.lock` row while a split runs: `zip|<zip size>|`. The oldest live lock of a zip wins; it is removed when the
 *   call ends, and one older than LOCK_MS (a function killed by its time limit) no longer counts.
 * A zip is known by its exact size in bytes, not its name: the same zip downloaded again is often renamed ("SINAR (1).zip"),
 * and a car is skipped only when the same size AND the same folder were made before, which a different zip almost never has.
 */
export const REPEAT_MS = 30 * 24 * 3600_000; // a second upload of the same zip within 30 days only makes the cars still missing
export const LOCK_MS = 6 * 60_000; // a split runs at most 300 s

export const splitKey = (name: string, size: number) => `${name.replace(/\|/g, "_")}|${size}|`; // no "|" inside the name part // what a `case.split` mark holds after the case id
const sizeKey = (size: number) => `|${size}|`;
const esc = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);
const audit = schema.auditLog;

/** Cars of this zip already made by an earlier call whose case still exists: folder prefix -> case id. */
export async function earlierCars(orgId: string, size: number): Promise<Map<string, string>> {
  const key = sizeKey(size);
  const marks = await db.select({ detail: audit.detail }).from(audit).where(and(eq(audit.orgId, orgId), eq(audit.action, "case.split"),
    like(audit.detail, `%${esc(key)}%`), gt(audit.at, new Date(Date.now() - REPEAT_MS))));
  // one folder can have several marks (a case rolled back or deleted by the user leaves its mark): the folder counts as made
  // when ANY of its marked cases still exists, whatever order the rows come back in
  const all: [string, string][] = [];
  // `<case id>|<zip name>|<zip size>|<folder prefix>`: the zip name, whatever it is, is skipped up to the size
  for (const m of marks) { const d = m.detail ?? ""; const i = d.indexOf("|"); const j = d.indexOf(key, i); if (i > 0 && j >= i) all.push([d.slice(j + key.length), d.slice(0, i)]); }
  const out = new Map<string, string>();
  if (!all.length) return out;
  const alive = new Set((await db.select({ id: schema.cases.id }).from(schema.cases).where(and(eq(schema.cases.orgId, orgId), notDeleted, inArray(schema.cases.id, [...new Set(all.map(([, id]) => id))])))).map((c) => c.id));
  for (const [p, id] of all) if (alive.has(id) && !out.has(p)) out.set(p, id);
  return out;
}

/** Takes the split lock of a zip. Returns a release function, or null when another call is splitting the same zip right now. */
export async function lockSplit(orgId: string, userId: string, size: number): Promise<(() => Promise<void>) | null> {
  const key = `zip${sizeKey(size)}`;
  const [mine] = await db.insert(audit).values({ orgId, userId, action: "case.split.lock", detail: key }).returning({ id: audit.id });
  const release = async () => { await db.delete(audit).where(eq(audit.id, mine.id)).catch((x) => console.error("split: lock release failed", x)); };
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
