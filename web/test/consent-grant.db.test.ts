// Needs a LOCAL Postgres with the migrations applied (as CI). Skipped otherwise.
import test from "node:test";
import assert from "node:assert/strict";

const local = /@(localhost|127\.0\.0\.1)[:/]/.test(process.env.DATABASE_URL ?? "");
const opts = { skip: local ? false : "needs a local Postgres" };

async function kit() {
  const { db, schema } = await import("../src/db");
  const { eq } = await import("drizzle-orm");
  const m = await import("../src/lib/ext/consent-grant");
  return { db, schema, eq, m };
}
const mk = async (tag: string) => {
  const { db, schema } = await kit();
  const orgId = `org_cg_${tag}_${Date.now()}`, userId = `u_cg_${tag}_${Date.now()}`;
  await db.insert(schema.organizations).values({ id: orgId, name: "T" });
  await db.insert(schema.user).values({ id: userId, name: "T", email: `${userId}@x.invalid`, emailVerified: true } as never);
  return { orgId, userId };
};
const state = async (orgId: string) => {
  const { db, schema, eq } = await kit();
  const [s] = await db.select().from(schema.extOrgSettings).where(eq(schema.extOrgSettings.orgId, orgId));
  const c = await db.select().from(schema.extConsents).where(eq(schema.extConsents.orgId, orgId));
  return { s, n: c.length };
};

test("saving with the tick writes the gate rows, twice is still one consent", opts, async () => {
  const { m } = await kit();
  const { orgId, userId } = await mk("a");
  await m.grantWorkerConsent(orgId, userId);
  await m.grantWorkerConsent(orgId, userId);
  const r = await state(orgId);
  assert.equal(r.s.enabled, true);
  assert.ok(r.s.consentReference!.startsWith(m.CARD_PREFIX));
  assert.equal(r.n, 1);
});

test("deleting the login revokes", opts, async () => {
  const { m } = await kit();
  const { orgId, userId } = await mk("b");
  await m.grantWorkerConsent(orgId, userId);
  await m.revokeWorkerConsent(orgId);
  const r = await state(orgId);
  assert.equal(r.s.enabled, false);
  assert.equal(r.n, 0);
  await m.grantWorkerConsent(orgId, userId); // ticking again switches it back on
  assert.equal((await state(orgId)).s.enabled, true);
});

test("a hand-written operator row is never overwritten or revoked", opts, async () => {
  const { db, schema, m } = await kit();
  const { orgId, userId } = await mk("c");
  await db.insert(schema.extOrgSettings).values({ orgId, enabled: true, consentAuthority: "firm", consentReference: "owner-letter-2026" });
  await m.grantWorkerConsent(orgId, userId);
  await m.revokeWorkerConsent(orgId);
  const r = await state(orgId);
  assert.equal(r.s.consentReference, "owner-letter-2026");
  assert.equal(r.s.enabled, true);
});
