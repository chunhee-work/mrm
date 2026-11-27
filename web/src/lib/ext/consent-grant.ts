import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";

// Option B (owner, 2026-11-27): the tick box on the details card IS the consent the worker needs (plan #38 gate:
// ext_org_settings.enabled + a consent reference + an ext_consents row). Saving the login with the tick writes them; deleting the login revokes.
// Rows an operator wrote by hand (a reference that does not start with the prefix) are never touched.
export const CARD_PREFIX = "details-card:";
export const CARD_WORDING = "details-card-1";

export const cardReference = (userId: string, at = new Date()) => `${CARD_PREFIX}${userId}:${at.toISOString()}`;

export async function grantWorkerConsent(orgId: string, userId: string): Promise<void> {
  const ref = cardReference(userId);
  await db.insert(schema.extOrgSettings)
    .values({ orgId, enabled: true, consentAuthority: "details_card", consentReference: ref })
    .onConflictDoUpdate({
      target: schema.extOrgSettings.orgId,
      set: { enabled: true, consentAuthority: "details_card", consentReference: ref, updatedAt: new Date() },
      // an existing hand-written row (operator's own reference) is left alone
      setWhere: sql`btrim(coalesce(${schema.extOrgSettings.consentReference}, '')) = '' OR ${schema.extOrgSettings.consentReference} LIKE ${CARD_PREFIX + "%"}`,
    });
  const [have] = await db.select({ id: schema.extConsents.id }).from(schema.extConsents)
    .where(and(eq(schema.extConsents.orgId, orgId), eq(schema.extConsents.wordingVersion, CARD_WORDING))).limit(1);
  if (!have) await db.insert(schema.extConsents).values({ orgId, userId, wordingVersion: CARD_WORDING });
}

export async function revokeWorkerConsent(orgId: string): Promise<void> {
  await db.update(schema.extOrgSettings).set({ enabled: false, updatedAt: new Date() })
    .where(and(eq(schema.extOrgSettings.orgId, orgId), sql`${schema.extOrgSettings.consentReference} LIKE ${CARD_PREFIX + "%"}`));
  await db.delete(schema.extConsents).where(and(eq(schema.extConsents.orgId, orgId), eq(schema.extConsents.wordingVersion, CARD_WORDING)));
}
