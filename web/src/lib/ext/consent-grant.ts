import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";

// Option B (owner, 2026-11-27): the tick box on the details card IS the consent the worker needs (plan #38 gate:
// ext_org_settings.enabled + a consent reference + an ext_consents row). Saving the login with the tick writes them; deleting the login revokes.
// Rows an operator wrote by hand (a reference that does not start with the prefix) are never touched.
export const CARD_PREFIX = "details-card:";
export const CARD_WORDING = "details-card-1";

export const cardReference = (userId: string, at = new Date()) => `${CARD_PREFIX}${userId}:${at.toISOString()}`;

const ownedByCard = (ref: string | null | undefined) => (ref ?? "").startsWith(CARD_PREFIX);

/** `reenable`: a save that carries a (new) login switches a card-owned row back on; a names-only save never does (an operator may have switched it off). */
export async function grantWorkerConsent(orgId: string, userId: string, reenable = true): Promise<void> {
  const [row] = await db.select().from(schema.extOrgSettings).where(eq(schema.extOrgSettings.orgId, orgId)).limit(1);
  const ref = cardReference(userId);
  if (!row) {
    await db.insert(schema.extOrgSettings).values({ orgId, enabled: true, consentAuthority: "details_card", consentReference: ref }).onConflictDoNothing();
  } else if (!(row.consentReference ?? "").trim()) {
    await db.update(schema.extOrgSettings).set({ enabled: true, consentAuthority: "details_card", consentReference: ref, updatedAt: new Date() })
      .where(and(eq(schema.extOrgSettings.orgId, orgId), sql`btrim(coalesce(${schema.extOrgSettings.consentReference}, '')) = ''`));
  } else if (ownedByCard(row.consentReference)) {
    if (reenable && !row.enabled) await db.update(schema.extOrgSettings).set({ enabled: true, updatedAt: new Date() }).where(eq(schema.extOrgSettings.orgId, orgId));
  } else {
    return; // an operator's own row: never touched, and no consent row is added to it
  }
  const [have] = await db.select({ id: schema.extConsents.id }).from(schema.extConsents)
    .where(and(eq(schema.extConsents.orgId, orgId), eq(schema.extConsents.wordingVersion, CARD_WORDING))).limit(1);
  if (!have) await db.insert(schema.extConsents).values({ orgId, userId, wordingVersion: CARD_WORDING });
}

export async function revokeWorkerConsent(orgId: string): Promise<void> {
  const [row] = await db.select().from(schema.extOrgSettings).where(eq(schema.extOrgSettings.orgId, orgId)).limit(1);
  if (!row || !ownedByCard(row.consentReference)) return; // an operator's row (or none) stays as it is
  await db.update(schema.extOrgSettings).set({ enabled: false, updatedAt: new Date() }).where(eq(schema.extOrgSettings.orgId, orgId));
  await db.delete(schema.extConsents).where(and(eq(schema.extConsents.orgId, orgId), eq(schema.extConsents.wordingVersion, CARD_WORDING)));
}
