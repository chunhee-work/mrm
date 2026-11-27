import "server-only";
import { cache } from "react";
import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { envOn } from "./gate";
import { decideWorkerGate, missingRelation } from "./worker-gate";
import type { ExtState } from "./gate";
import { profileComplete } from "./profile";
import { credKeyReady } from "@/lib/crypto/merimen-cred";

export async function getWorkerState(orgId: string): Promise<ExtState> {
  if (!envOn()) return "off";
  try {
    const [s] = await db.select().from(schema.extOrgSettings).where(eq(schema.extOrgSettings.orgId, orgId)).limit(1);
    const [c] = await db.select({ id: schema.extConsents.id }).from(schema.extConsents).where(eq(schema.extConsents.orgId, orgId)).limit(1);
    return decideWorkerGate({ envOn: true, setting: s ? { enabled: s.enabled, consentReference: s.consentReference } : null, consented: !!c });
  } catch (e) {
    if (missingRelation(e)) return "off";
    throw e;
  }
}

export type CredView = {
  saved: boolean; usernameHint: string | null; verifyState: string; blocked: boolean; updatedAt: string | null;
  workshop: string | null; manager: string | null; adjuster: string | null;
  complete: boolean; // login saved and the three names filled: a case may be started
  storageOk: boolean; // false while the table or the 0013 columns are not in the database
};
const NONE: CredView = { saved: false, usernameHint: null, verifyState: "none", blocked: false, updatedAt: null, workshop: null, manager: null, adjuster: null, complete: false, storageOk: true };

// one read per page render (the layout, the page and the banner all ask)
export const credView = cache(credViewUncached);
async function credViewUncached(orgId: string): Promise<CredView> {
  try {
    const [r] = await db.select({
      usernameHint: schema.merimenCredentials.usernameHint,
      verifyState: schema.merimenCredentials.verifyState,
      blocked: schema.merimenCredentials.blocked,
      updatedAt: schema.merimenCredentials.updatedAt,
      workshop: schema.merimenCredentials.workshopName,
      manager: schema.merimenCredentials.managerName,
      adjuster: schema.merimenCredentials.adjusterName,
    }).from(schema.merimenCredentials).where(eq(schema.merimenCredentials.orgId, orgId)).limit(1);
    if (!r) return NONE;
    const v = { saved: true, usernameHint: r.usernameHint, verifyState: r.verifyState, blocked: r.blocked, updatedAt: r.updatedAt.toISOString(), workshop: r.workshop, manager: r.manager, adjuster: r.adjuster };
    return { ...v, complete: profileComplete(v), storageOk: true };
  } catch (e) {
    if (missingRelation(e)) return { ...NONE, storageOk: false };
    throw e;
  }
}

/** True when this account may NOT start a case yet. Only enforced while saving really works (key set, 0013 applied),
 * so a missing key or migration can never lock every user out. */
export async function profileBlocks(orgId: string): Promise<boolean> {
  if (!credKeyReady()) return false;
  const v = await credView(orgId);
  return v.storageOk && !v.complete;
}

export async function workerOnline(): Promise<boolean> {
  try {
    const r = await db.execute(sql`SELECT 1 FROM worker_runtimes WHERE seen_at > now() - interval '90 seconds' LIMIT 1`);
    const rows = (r as { rows?: unknown[] }).rows ?? [];
    return rows.length > 0;
  } catch (e) {
    if (missingRelation(e)) return false;
    throw e;
  }
}

export async function workerFailedCount(caseId: string): Promise<number> {
  const r = await db.execute(sql`SELECT count(*)::int AS n FROM case_photos WHERE case_id = ${caseId} AND name_state = 'failed' AND name_error LIKE 'worker:%'`);
  const rows = (r as unknown as { rows?: { n: number }[] }).rows ?? [];
  return Number(rows[0]?.n ?? 0);
}
