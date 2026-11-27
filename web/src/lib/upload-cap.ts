import { sql } from "drizzle-orm";
import { db } from "@/db";

// S-U9: how many upload tokens one organisation can get in an hour. Each token lets the browser put one file into the file
// store, so without a limit a signed-in user could ask for them in a loop and fill the store. Both numbers are far above
// real use, they only stop a runaway loop:
// - case uploads (/api/upload): one token per file, a case takes 300 files at most (a zip of 30 cars is one file), so this
//   is 20 full cases in one hour;
// - desk photos: two tokens per photo (the photo and its small copy), 300 photos per case, so again 20 full cases, and a
//   failed upload asks again for each of its tries.
export const CASE_TOKENS_PER_HOUR = 6000;
export const PHOTO_TOKENS_PER_HOUR = 12000;
const LIMIT = { case: CASE_TOKENS_PER_HOUR, photo: PHOTO_TOKENS_PER_HOUR } as const;
const HOUR_MS = 3600_000;

const rowsOf = (res: unknown): unknown[] => { const r = res as { rows?: unknown[] } | unknown[]; return Array.isArray(r) ? r : (r.rows ?? []); };

/**
 * Counts one token for the organisation and says whether it may be given: false once this clock hour's limit is used up.
 * The count is one small row per organisation, kind and hour in the `verification` table (the place for short-lived
 * counters; no new table), raised in a single statement so requests at the same moment are all counted. Rows of past
 * hours are removed when a new hour starts.
 */
export async function takeUploadToken(orgId: string, kind: keyof typeof LIMIT, now = Date.now()): Promise<boolean> {
  const key = `upload-tokens:${kind}:${orgId}`;
  const [row] = rowsOf(await db.execute(sql`
    INSERT INTO verification (id, identifier, value, expires_at)
    VALUES (${`${key}:${Math.floor(now / HOUR_MS)}`}, ${key}, '1', now() + interval '2 hours')
    ON CONFLICT (id) DO UPDATE SET value = (verification.value::int + 1)::text, updated_at = now()
    RETURNING value`)) as { value: string }[];
  const n = Number(row?.value);
  if (n === 1) await db.execute(sql`DELETE FROM verification WHERE identifier = ${key} AND expires_at < now()`).catch(() => {}); // tidy only: never fails the upload
  return Number.isFinite(n) && n <= LIMIT[kind];
}
