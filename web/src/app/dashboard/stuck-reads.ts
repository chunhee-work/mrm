import "server-only";
import { leaseTime, scanCase, STALE_MS } from "@/lib/scan-case";
import { splitRunning } from "@/lib/split-marks";

export const HEAL_PER_VISIT = 3; // a zip of many cars makes many cases at once: each visit starts a few more of those still waiting

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
 * Self-heal, so no case waits forever. Give it every case the page shows (not only the newest ones: an older case that is
 * stuck is shown as "reading" too) and run what it returns after the answer is sent (`after`).
 */
export async function stuckReads(orgId: string, rows: HealRow[]): Promise<(() => Promise<unknown>)[]> {
  const { stale, late, room } = pickStuck(rows, Date.now());
  if (!room || (!stale.length && !late.length)) return [];
  // cases of a split still running are not read yet: a rollback may delete them
  const waiting = late.length && !(await splitRunning(orgId)) ? late : [];
  return [
    ...stale.map((c) => () => scanCase(c.id, "recover", c.error)),
    ...waiting.map((c) => () => scanCase(c.id, "auto")),
  ].slice(0, room);
}
