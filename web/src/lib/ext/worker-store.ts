import "server-only";
import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { envOn } from "./gate";
import { decideWorkerGate, missingRelation } from "./worker-gate";
import type { ExtState } from "./gate";

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

export type CredView = { saved: boolean; usernameHint: string | null; verifyState: string; blocked: boolean };

export async function credView(orgId: string): Promise<CredView> {
  try {
    const [r] = await db.select({
      usernameHint: schema.merimenCredentials.usernameHint,
      verifyState: schema.merimenCredentials.verifyState,
      blocked: schema.merimenCredentials.blocked,
    }).from(schema.merimenCredentials).where(eq(schema.merimenCredentials.orgId, orgId)).limit(1);
    if (!r) return { saved: false, usernameHint: null, verifyState: "none", blocked: false };
    return { saved: true, usernameHint: r.usernameHint, verifyState: r.verifyState, blocked: r.blocked };
  } catch (e) {
    if (missingRelation(e)) return { saved: false, usernameHint: null, verifyState: "none", blocked: false };
    throw e;
  }
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
