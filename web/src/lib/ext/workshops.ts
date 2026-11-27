import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { missingRelation } from "./worker-gate";
import type { Workshop } from "./profile";

/** The workshops of an organisation, by slot. Empty while migration 0014 is not applied (nothing then offers a choice). */
export async function orgWorkshops(orgId: string): Promise<Workshop[]> {
  try {
    return (await db.select({ slot: schema.merimenWorkshops.slot, name: schema.merimenWorkshops.name }).from(schema.merimenWorkshops)
      .where(eq(schema.merimenWorkshops.orgId, orgId)).orderBy(schema.merimenWorkshops.slot)) as Workshop[];
  } catch (e) { if (missingRelation(e)) return []; throw e; }
}

/** The workshop a case belongs to: 1 when nothing was chosen. */
export async function caseSlot(caseId: string): Promise<number> {
  try {
    const [r] = await db.select({ slot: schema.merimenCaseWorkshop.slot }).from(schema.merimenCaseWorkshop).where(eq(schema.merimenCaseWorkshop.caseId, caseId)).limit(1);
    return r?.slot ?? 1;
  } catch (e) { if (missingRelation(e)) return 1; throw e; }
}

/**
 * What a request asked for: nothing or workshop 1 means "the default" (no row is written: a case without a row is workshop 1);
 * workshop 2 or 3 must be one this organisation has. Returns the slot to store, null for the default, or "unknown".
 */
export async function slotToStore(orgId: string, asked: number | undefined): Promise<number | null | "unknown"> {
  if (asked === undefined || asked === 1) return null;
  const ws = await orgWorkshops(orgId);
  return ws.some((w) => w.slot === asked) ? asked : "unknown";
}
