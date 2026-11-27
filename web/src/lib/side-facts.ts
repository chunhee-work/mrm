import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { credView } from "@/lib/ext/worker-store";
import { notDeleted } from "@/lib/case-delete";
import { creditBalance } from "@/lib/payments/credit";

/** What the side bar shows: the details (for the amber dot), the closed-case count and the credits left. One place for the layout and /api/side. */
export async function sideFacts(orgId: string) {
  const [cred, closed, credits] = await Promise.all([
    credView(orgId).catch(() => null),
    db.select({ n: sql<number>`count(*)::int` }).from(schema.cases).where(and(eq(schema.cases.orgId, orgId), eq(schema.cases.status, "done"), notDeleted)).then((r): number | null => Number(r[0]?.n ?? 0)).catch(() => null), // unknown, not a confident 0
    creditBalance(orgId).catch(() => null),
  ]);
  return { cred, closed, credits };
}
