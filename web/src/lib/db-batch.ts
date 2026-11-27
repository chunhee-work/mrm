import { db } from "@/db";

export type Batch = Parameters<typeof db.batch>[0];

/**
 * Writes rows that belong together. On Neon this is one HTTP batch (one transaction): all of them exist or none does.
 * The local test database has no batch; there the rows go one after the other, so a caller must still clean up after a failure.
 */
export async function writeTogether(qs: Batch): Promise<void> {
  const d = db as unknown as { batch?: (q: Batch) => Promise<unknown> };
  if (typeof d.batch === "function") await d.batch(qs);
  else for (const q of qs) await q;
}

/** One short line of an error for the server log: the first line only (a failed query's second line holds its values). */
export const errLine = (e: unknown) => String((e as Error | null)?.message ?? e).split("\n")[0].slice(0, 300);
