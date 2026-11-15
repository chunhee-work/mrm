// Plan #38, P1. One place decides whether the Merimen-connection feature may do anything for an organisation.
// Off by default at three levels: the EXT_CONNECT env switch, the per-org setting, and a stored consent reference.
// With the env switch off nothing here touches the database, so production works before the migration is applied.
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";

export type ExtState = "off" | "needs_consent" | "ready";
export type OrgSetting = { enabled: boolean; consentReference: string | null } | null | undefined;

export const envOn = (env: Record<string, string | undefined> = process.env) => env.EXT_CONNECT === "on";

/** Pure rule. `ready` only when: env on, org enabled, a consent reference stored, and the customer acknowledged. */
export function decideGate(i: { envOn: boolean; setting: OrgSetting; consented: boolean }): ExtState {
  if (!i.envOn) return "off";
  if (!i.setting || !i.setting.enabled) return "off";
  if (!i.setting.consentReference || !i.setting.consentReference.trim()) return "off"; // flag-on without a consent reference stays disabled
  return i.consented ? "ready" : "needs_consent";
}

export async function getExtState(orgId: string): Promise<ExtState> {
  if (!envOn()) return "off"; // no database call at all
  const [setting] = await db.select().from(schema.extOrgSettings).where(eq(schema.extOrgSettings.orgId, orgId)).limit(1);
  const [c] = await db.select({ id: schema.extConsents.id }).from(schema.extConsents).where(eq(schema.extConsents.orgId, orgId)).limit(1);
  return decideGate({ envOn: true, setting, consented: !!c });
}
