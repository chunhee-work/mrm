import test, { before } from "node:test";
import assert from "node:assert/strict";
import { sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { previewWipe, wipeUser, type WipeStore } from "./wipe-user";

// DESTRUCTIVE (TRUNCATE): same guard as db.test.ts: only on a localhost database whose name contains "test", with WIPE_DB_TESTS=1.
const url = process.env.DATABASE_URL ?? "";
const local = process.env.WIPE_DB_TESTS === "1" && /@(localhost|127\.0\.0\.1)[:/]/.test(url) && /\/[^/?]*test[^/?]*(\?|$)/i.test(url);
const t = local ? test : test.skip;
const files = new Set<string>();
const store: WipeStore = {
  remove: async (p) => { files.delete(p); },
  listPrefix: async (pre) => [...files].filter((f) => f.startsWith(pre)),
};
const n = async (q: ReturnType<typeof sql>) => Number(((await db.execute(q)) as unknown as { rows: { n: number }[] }).rows[0].n);

before(async () => {
  if (!local) return;
  await db.execute(sql`TRUNCATE llm_calls, audit_log, merimen_cred_audit, credits_ledger, payment_orders, cases, memberships, organizations, session, verification, "user" RESTART IDENTITY CASCADE`);
  for (const [u, org, email] of [["ua", "orgA", "Target@Example.com"], ["ub", "orgB", "other@example.com"], ["uc", "orgC", "shared-a@example.com"], ["ud", "orgC", "shared-b@example.com"], ["ue", "orgE", "busy@example.com"]]) {
    await db.insert(schema.user).values({ id: u, name: u, email, emailVerified: true }).onConflictDoNothing();
    await db.insert(schema.organizations).values({ id: org, name: `Org of ${email}` }).onConflictDoNothing();
    await db.insert(schema.memberships).values({ orgId: org, userId: u });
  }
  for (const [c, org, by] of [["ca1", "orgA", "ua"], ["ca2", "orgA", "ua"], ["cb1", "orgB", "ub"], ["ce1", "orgE", "ue"]]) {
    await db.insert(schema.cases).values({ id: c, orgId: org, createdBy: by, plate: "X", status: "naming" });
    await db.insert(schema.caseFiles).values({ caseId: c, originalName: "a.pdf", blobUrl: `${org}/${c}/a.pdf`, kind: "pdf", size: 1 });
    files.add(`${org}/${c}/a.pdf`);
  }
  files.add("screenshots/ua/s1.png"); files.add("orgA/stray.bin"); files.add("orgB/keep.bin");
  await db.insert(schema.session).values({ id: "sa", token: "ta", userId: "ua", expiresAt: new Date(Date.now() + 1e7) });
  await db.insert(schema.verification).values([{ id: "v1", identifier: "target@example.com", value: "x", expiresAt: new Date(Date.now() + 1e7) }, { id: "v2", identifier: "other@example.com", value: "x", expiresAt: new Date(Date.now() + 1e7) }]);
  await db.execute(sql`INSERT INTO merimen_credentials (org_id, username_hint, wrapped_dek, dek_nonce, username_ct, username_nonce, password_ct, password_nonce) VALUES ('orgA','t***','a','b','c','d','e','f'), ('orgB','o***','a','b','c','d','e','f')`);
  await db.execute(sql`INSERT INTO merimen_workshops (org_id, slot, name) VALUES ('orgA',1,'W'), ('orgB',1,'W')`);
  await db.insert(schema.paymentOrders).values({ id: "p1", orgId: "orgA", userId: "ua", provider: "mock", packId: "p", packTitle: "P", packVersion: 1, credits: 10, amountMinor: 1000, currency: "MYR", status: "paid" });
  await db.insert(schema.creditsLedger).values({ orgId: "orgA", delta: 10, reason: "purchase:p1" });
  await db.insert(schema.llmCalls).values({ requestId: "r1", userId: "ua", orgId: "orgA", caseId: "ca1", purpose: "read_docs", model: "m", costUsd: "1" });
  await db.insert(schema.auditLog).values({ orgId: "orgA", userId: "ua", action: "case.create", detail: "ca1" });
  await db.insert(schema.jobs).values({ caseId: "ce1", step: "phase_a", state: "running" });
});

t("refuses an unknown email, a shared company, and a running job; nothing is touched", async () => {
  assert.deepEqual(await previewWipe("nobody@example.com", store), { ok: false, reason: "not_found" });
  assert.deepEqual(await previewWipe("shared-a@example.com", store), { ok: false, reason: "shared_org" });
  assert.deepEqual(await previewWipe("busy@example.com", store), { ok: false, reason: "running_job" });
  assert.deepEqual(await wipeUser("busy@example.com", "busy@example.com", store), { ok: false, reason: "running_job" });
  assert.equal(await n(sql`SELECT count(*)::int AS n FROM "user"`), 5);
});

t("the preview counts what is there, case-insensitively", async () => {
  const p = await previewWipe("  TARGET@example.com ", store);
  assert.ok(p.ok);
  assert.equal(p.counts.cases, 2); assert.equal(p.counts.caseFiles, 2); assert.equal(p.counts.storedFiles, 4);
  assert.equal(p.counts.hasMerimenLogin, true); assert.equal(p.counts.workshops, 1); assert.equal(p.counts.sessions, 1);
});

t("a wrong confirmation wipes nothing", async () => {
  assert.deepEqual(await wipeUser("target@example.com", "tarGet@example.org", store), { ok: false, reason: "confirm_mismatch" });
  assert.equal(await n(sql`SELECT count(*)::int AS n FROM cases WHERE org_id = 'orgA'`), 2);
});

t("a storage failure leaves the rows so it can be run again", async () => {
  const bad: WipeStore = { ...store, remove: async () => { throw new Error("boom"); } };
  assert.deepEqual(await wipeUser("target@example.com", "target@example.com", bad), { ok: false, reason: "storage_failed" });
  assert.equal(await n(sql`SELECT count(*)::int AS n FROM "user" WHERE id = 'ua'`), 1);
});

t("white-out empties the account but keeps the account, login, balance and the other users", async () => {
  const r = await wipeUser("target@example.com", "Target@Example.com", store);
  assert.ok(r.ok); assert.equal(r.leftFiles, 0);
  // the account stays
  assert.equal(await n(sql`SELECT count(*)::int AS n FROM "user" WHERE id = 'ua'`), 1);
  assert.equal(await n(sql`SELECT count(*)::int AS n FROM session WHERE user_id = 'ua'`), 1);
  assert.equal(await n(sql`SELECT count(*)::int AS n FROM memberships WHERE org_id = 'orgA'`), 1);
  assert.equal(await n(sql`SELECT count(*)::int AS n FROM verification`), 2);
  assert.equal(await n(sql`SELECT count(*)::int AS n FROM credits_ledger WHERE org_id = 'orgA'`), 1);
  assert.equal(await n(sql`SELECT count(*)::int AS n FROM payment_orders WHERE org_id = 'orgA' AND user_id = 'ua'`), 1);
  // everything inside is gone
  for (const q of [sql`SELECT count(*)::int AS n FROM cases WHERE org_id = 'orgA'`, sql`SELECT count(*)::int AS n FROM case_files WHERE case_id LIKE 'ca%'`, sql`SELECT count(*)::int AS n FROM merimen_credentials WHERE org_id = 'orgA'`, sql`SELECT count(*)::int AS n FROM merimen_workshops WHERE org_id = 'orgA'`]) assert.equal(await n(q), 0);
  assert.deepEqual([...files].sort(), ["orgB/cb1/a.pdf", "orgB/keep.bin", "orgE/ce1/a.pdf"].sort());
  // the other users are intact
  assert.equal(await n(sql`SELECT count(*)::int AS n FROM cases WHERE org_id = 'orgB'`), 1);
  assert.equal(await n(sql`SELECT count(*)::int AS n FROM merimen_credentials WHERE org_id = 'orgB'`), 1);
  // a second white-out finds nothing left and is fine
  const again = await wipeUser("target@example.com", "target@example.com", store);
  assert.ok(again.ok); assert.equal(again.counts.cases, 0);
});
