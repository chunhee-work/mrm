import { and, desc, eq, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { notDeleted } from "@/lib/case-delete";

/** One Activity line as the page gets it. `id` lets the user remove it from the list (plan #148). */
export type ActivityEv = { id: number; at: string; message: string };

/**
 * The newest `limit` lines a user sees in a case's Activity list, oldest first. Lines the user removed are skipped here and
 * only here: the worker and scan-case read every row (their checks and counts must not change when a line is hidden).
 * Rows written in one transaction share `at`, so the id keeps their order.
 */
export async function activityOf(caseId: string, limit: number): Promise<ActivityEv[]> {
  const rows = await db.select({ id: schema.caseEvents.id, at: schema.caseEvents.at, message: schema.caseEvents.message }).from(schema.caseEvents)
    .where(and(eq(schema.caseEvents.caseId, caseId), isNull(schema.caseEvents.hiddenAt)))
    .orderBy(desc(schema.caseEvents.at), desc(schema.caseEvents.id)).limit(limit);
  return rows.reverse().map((e) => ({ id: e.id, at: e.at.toISOString(), message: e.message }));
}

/** The time of the case's newest line, hidden or not: the self-heal ("is a read stuck?") must not change when a line is hidden. */
export async function lastEventAt(caseId: string): Promise<Date | null> {
  // a plain select of the column (not max()), so the driver maps `at` like everywhere else (no server-time-zone shift)
  const [r] = await db.select({ at: schema.caseEvents.at }).from(schema.caseEvents).where(eq(schema.caseEvents.caseId, caseId))
    .orderBy(desc(schema.caseEvents.at)).limit(1);
  return r?.at ?? null;
}

/** Parses the event id of a URL: a positive whole number, else null (the route answers 404). */
export function eventIdOf(raw: string): number | null {
  if (!/^[1-9]\d{0,9}$/.test(raw)) return null;
  const n = Number(raw);
  return n <= 2_147_483_647 ? n : null;
}

/**
 * Removes a line from the Activity list (`hide`), or brings it back. Any signed-in member of the case's organisation may,
 * the same rule as deleting the whole case. Idempotent: hiding a hidden line or showing a shown one is a no-op that still
 * answers true. False = no such line on a visible case of this organisation (the route answers 404).
 */
export async function setEventHidden(orgId: string, userId: string, caseId: string, eventId: number, hide: boolean): Promise<boolean> {
  const [c] = await db.select({ id: schema.cases.id }).from(schema.cases).where(and(eq(schema.cases.id, caseId), eq(schema.cases.orgId, orgId), notDeleted)).limit(1);
  if (!c) return false;
  const same = and(eq(schema.caseEvents.id, eventId), eq(schema.caseEvents.caseId, caseId));
  const [ev] = await db.select({ id: schema.caseEvents.id }).from(schema.caseEvents).where(same).limit(1);
  if (!ev) return false;
  if (hide) await db.update(schema.caseEvents).set({ hiddenAt: new Date(), hiddenBy: userId }).where(and(same, isNull(schema.caseEvents.hiddenAt)));
  else await db.update(schema.caseEvents).set({ hiddenAt: null, hiddenBy: null }).where(same);
  return true;
}
