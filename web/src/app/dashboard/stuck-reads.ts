import "server-only";
import { after } from "next/server";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { notDeleted } from "@/lib/case-delete";
import { leaseTime, scanCase, STALE_MS } from "@/lib/scan-case";
import { splitRunning } from "@/lib/split-marks";

export const HEAL_PER_VISIT = 3; // a zip of many cars makes many cases at once: each visit starts a few more of those still waiting
const HEAL_LOOK = 100; // how many waiting cases one visit looks at, oldest first (a zip makes 30 at most)

export type HealRow = { id: string; status: string; error: string | null; createdAt: Date };

/**
 * Which cases need their read started (again), in the order given. `stale`: a read cut off by its time limit stays `reading`,
 * after STALE_MS it is started again. `late`: still `uploaded` a minute after it was made, so its read never started.
 * `room`: at most HEAL_PER_VISIT reads of one organisation run at once, counting the ones that are alive.
 */
export function pickStuck<T extends HealRow>(rows: T[], now: number): { stale: T[]; late: T[]; room: number } {
  const dead = (c: T) => c.status === "reading" && now - (leaseTime(c.error) ?? c.createdAt.getTime()) > STALE_MS;
  const live = rows.filter((c) => c.status === "reading" && !dead(c)).length;
  return {
    stale: rows.filter(dead),
    late: rows.filter((c) => c.status === "uploaded" && now - c.createdAt.getTime() > 60_000),
    room: Math.max(0, HEAL_PER_VISIT - live),
  };
}

/**
 * The reads one visit starts: the dead ones first, then the ones never started, each in the order given, and no more than
 * there is room for. `splitRuns`: a zip split of the organisation is running, so its new cases are not read yet (a rollback
 * may delete them). One rule for the first page and the heal request, so two of them at the same moment pick the same cases
 * (the claim in scanCase lets only one of them read each) and never 3 + 3 different ones.
 */
export function pickReads(rows: HealRow[], now: number, splitRuns: boolean): { id: string; mode: "recover" | "auto"; seen: string | null }[] {
  const { stale, late, room } = pickStuck(rows, now);
  return [
    ...stale.map((c) => ({ id: c.id, mode: "recover" as const, seen: c.error })),
    ...(splitRuns ? [] : late).map((c) => ({ id: c.id, mode: "auto" as const, seen: null })),
  ].slice(0, room);
}

/**
 * Self-heal, so no case waits forever: starts the reads of this organisation that never started or died, after the answer
 * is sent. Its own small query (every case still to be read or being read, oldest first), not the rows a page happens to
 * show: the first page cuts its list at 500 open cases and the newest uploads sort last there. Used by the first page on
 * every visit and by POST /api/cases/heal. Returns how many cases are still to be read or being read.
 */
export async function healWaiting(orgId: string): Promise<number> {
  const rows = await db.select({ id: schema.cases.id, status: schema.cases.status, error: schema.cases.error, createdAt: schema.cases.createdAt }).from(schema.cases)
    .where(and(eq(schema.cases.orgId, orgId), notDeleted, inArray(schema.cases.status, ["uploaded", "reading"]))).orderBy(asc(schema.cases.createdAt)).limit(HEAL_LOOK);
  const now = Date.now();
  const p = pickStuck(rows, now);
  if (p.room && (p.stale.length || p.late.length)) {
    const reads = pickReads(rows, now, p.late.length > 0 && (await splitRunning(orgId)));
    if (reads.length) after(async () => { await Promise.all(reads.map((r) => scanCase(r.id, r.mode, r.seen).catch(() => {}))); });
  }
  return rows.length;
}
