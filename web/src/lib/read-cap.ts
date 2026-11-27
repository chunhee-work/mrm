import { sql, type SQL } from "drizzle-orm";
import { db } from "@/db";

// S-U1: how often the paid model may read documents. A read is free for the user whenever charging is off, the organisation
// is exempt, or the case is still paid for ("Read again" on a case that waits for a document, or new files added to it), so
// without a limit a signed-in user could loop it and run up the model bill. Both numbers are far above real use:
// - one case: its first read, a few more as missing documents are added one by one, a "Read again" or two;
// - one organisation: a zip may hold 30 cars (30 reads), so this is three full zips in one hour.
// A read that starts by itself and is over the limit is not lost: the case waits and is read once there is room again.
export const CASE_READS_PER_HOUR = 6;
export const ORG_READS_PER_HOUR = 90;

// Every read that starts writes one "Reading documents" line into the case's activity (scan-case.ts), and a case the user
// deleted keeps its lines, so the lines of the last hour are the count: nothing new is stored.
const STARTED = sql`e.step = 'read_docs' and e.message = 'Reading documents' and e.at > now() - interval '1 hour'`;
const caseReads = (caseId: SQL) => sql`(select count(*) from case_events e where e.case_id = ${caseId} and ${STARTED})`;
const orgReads = (orgId: SQL) => sql`(select count(*) from case_events e join cases k on k.id = e.case_id where k.org_id = ${orgId} and ${STARTED})`;

/**
 * For the WHERE of the statement that claims a case for a read (`UPDATE cases …`): true while both the case and its
 * organisation are under their limit. Inside the claim itself, so every way a read starts is held to it.
 */
export const UNDER_READ_CAPS = sql`(${caseReads(sql`cases.id`)} < ${sql.raw(String(CASE_READS_PER_HOUR))} and ${orgReads(sql`cases.org_id`)} < ${sql.raw(String(ORG_READS_PER_HOUR))})`;

const rowsOf = (res: unknown): unknown[] => { const r = res as { rows?: unknown[] } | unknown[]; return Array.isArray(r) ? r : (r.rows ?? []); };

/** Which limit a new read of this case would be over right now, or null. For the answer of "Read again"; the claim decides. */
export async function readCapHit(caseId: string, orgId: string): Promise<"case" | "org" | null> {
  const [n] = rowsOf(await db.execute(sql`select ${caseReads(sql`${caseId}`)}::int as c, ${orgReads(sql`${orgId}`)}::int as o`)) as { c: number; o: number }[];
  if (!n) return null;
  return Number(n.c) >= CASE_READS_PER_HOUR ? "case" : Number(n.o) >= ORG_READS_PER_HOUR ? "org" : null;
}
