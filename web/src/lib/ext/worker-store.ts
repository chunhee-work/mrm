import "server-only";
import { cache } from "react";
import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { envOn } from "./gate";
import { decideWorkerGate, missingRelation } from "./worker-gate";
import type { ExtState } from "./gate";
import { profileComplete, type Workshop } from "./profile";
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
  workshop: string | null; // workshop 1 (kept for older readers)
  workshops: Workshop[]; // up to three, by slot
  manager: string | null; adjuster: string | null;
  complete: boolean; // login saved and the three names filled: a case may be started
  storageOk: boolean; // false while the table or the 0013 columns are not in the database
  keyOk: boolean; // the master key is set on this server
  blocks: boolean; // a case may NOT be started: details incomplete AND saving really works. ONE definition, used by server and page
};
const NONE: Omit<CredView, "keyOk" | "blocks"> = { saved: false, usernameHint: null, verifyState: "none", blocked: false, updatedAt: null, workshop: null, workshops: [], manager: null, adjuster: null, complete: false, storageOk: true };

// one read per page render (the layout, the page and the banner all ask)
export const credView = cache(credViewUncached);
async function credViewUncached(orgId: string): Promise<CredView> {
  const v = await readCred(orgId);
  const keyOk = credKeyReady();
  return { ...v, keyOk, blocks: keyOk && v.storageOk && !v.complete };
}
async function readCred(orgId: string): Promise<Omit<CredView, "keyOk" | "blocks">> {
  try {
    // the version sequence of migration 0013 must exist and be usable too, or saving would fail while cases were blocked
    const seq = await db.execute(sql`SELECT (to_regclass('merimen_profile_seq') IS NOT NULL) AND (to_regclass('merimen_workshops') IS NOT NULL) AND (to_regclass('merimen_case_workshop') IS NOT NULL) AND has_sequence_privilege(current_user, to_regclass('merimen_profile_seq'), 'USAGE') AS ok`);
    if (((seq as unknown as { rows?: { ok: boolean }[] }).rows ?? [])[0]?.ok !== true) return { ...NONE, storageOk: false };
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
    const ws = await db.select({ slot: schema.merimenWorkshops.slot, name: schema.merimenWorkshops.name }).from(schema.merimenWorkshops).where(eq(schema.merimenWorkshops.orgId, orgId)).orderBy(schema.merimenWorkshops.slot);
    const v = { workshops: ws as Workshop[], saved: true, usernameHint: r.usernameHint, verifyState: r.verifyState, blocked: r.blocked, updatedAt: r.updatedAt.toISOString(), workshop: ws.find((w) => w.slot === 1)?.name ?? null, manager: r.manager, adjuster: r.adjuster };
    return { ...v, complete: profileComplete(v), storageOk: true };
  } catch (e) {
    // Any other read failure (permissions, timeout) must not take the whole site down or lock customers out:
    // treat it as "not ready" and log only the error code, never the message (it may carry query parameters).
    if (!missingRelation(e)) console.error("credView read failed", (e as { code?: string })?.code ?? "unknown");
    return { ...NONE, storageOk: false };
  }
}

/** True when this account may NOT start a case yet. Only enforced while saving really works (key set, 0013 applied),
 * so a missing key or migration can never lock every user out. */
export async function profileBlocks(orgId: string): Promise<boolean> {
  return (await credView(orgId)).blocks;
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
