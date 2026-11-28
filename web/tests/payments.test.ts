// Run: DATABASE_URL=postgresql://pay:pay@localhost:5432/paytest npm test  (migrations applied first)
import { test, before, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { sql } from "drizzle-orm";
import { db, schema } from "../src/db";
import { createPendingOrder, displayStatus, getOrder } from "../src/lib/payments/orders";
import { creditBalance, creditOrder, refundOrder } from "../src/lib/payments/credit";
import { debitCase } from "../src/lib/payments/case-credit";
import { deleteCase } from "../src/lib/case-delete";
import { purgeDeletedCases } from "../src/lib/purge-deleted-cases";
import { PACKS, packSellable } from "../src/lib/payments/packs";
import { decimalToMinor } from "../src/lib/payments/money";
import { handleLemonSqueezyWebhook, verifySignature } from "../src/lib/payments/providers/lemonsqueezy";
import { recheckToyyibPayOrder } from "../src/lib/payments/providers/toyyibpay";
import { availableProviders } from "../src/lib/payments/registry";
import { PaymentError } from "../src/lib/payments/types";

const SECRET = "whsec_test";
const pack = PACKS[0];
let org = "";
let org2 = "";

before(async () => {
  if (!/localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL ?? "")) throw new Error("tests run on a local database only");
});
beforeEach(async () => {
  await db.execute(sql`TRUNCATE payment_orders, credits_ledger, audit_log, organizations CASCADE`);
  org = randomUUID(); org2 = randomUUID();
  await db.insert(schema.organizations).values([{ id: org, name: "A" }, { id: org2, name: "B" }]);
  process.env.LEMONSQUEEZY_WEBHOOK_SECRET = SECRET;
  process.env.TOYYIBPAY_SECRET_KEY = "k"; process.env.TOYYIBPAY_CATEGORY_CODE = "c";
});
const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

const mk = (provider: "lemonsqueezy" | "toyyibpay" | "mock", o = org, currency: "MYR" | "USD" = provider === "toyyibpay" ? "MYR" : "USD") =>
  createPendingOrder({ orgId: o, userId: null as unknown as string, provider, pack, currency });
const sign = (body: string, secret = SECRET) => createHmac("sha256", secret).update(body).digest("hex");
const lsBody = (name: string, orderId: string, over: Record<string, unknown> = {}, id = "9001") =>
  JSON.stringify({ meta: { event_name: name, custom_data: { order_id: orderId } }, data: { id, attributes: { status: name === "order_refunded" ? "refunded" : "paid", subtotal: pack.price.USD, currency: "USD", test_mode: true, ...over } } });
const hook = (b: string, sig = sign(b)) => handleLemonSqueezyWebhook(b, sig);

test("money parsing is exact", () => {
  assert.equal(decimalToMinor("20.00"), 2000);
  assert.equal(decimalToMinor("20"), 2000);
  assert.equal(decimalToMinor("0.1"), 10);
  assert.equal(decimalToMinor("20.001"), null);
  assert.equal(decimalToMinor("abc"), null);
  assert.equal(decimalToMinor("-5"), null);
});

test("signature: valid, tampered, wrong secret, missing", () => {
  const b = "{}";
  assert.equal(verifySignature(b, sign(b), SECRET), true);
  assert.equal(verifySignature(b + " ", sign(b), SECRET), false);
  assert.equal(verifySignature(b, sign(b, "other"), SECRET), false);
  assert.equal(verifySignature(b, null, SECRET), false);
  assert.equal(verifySignature(b, sign(b), undefined), false);
});

test("LS: paid order credits once; replay credits nothing more", async () => {
  const o = await mk("lemonsqueezy");
  const b = lsBody("order_created", o.id);
  assert.equal((await hook(b)).note, "credited");
  assert.equal((await hook(b)).note, "not credited");
  assert.equal(await creditBalance(org), pack.credits);
  assert.equal((await getOrder(o.id))?.status, "paid");
});

test("LS: bad signature is 401 and credits nothing", async () => {
  const o = await mk("lemonsqueezy");
  const b = lsBody("order_created", o.id);
  assert.equal((await hook(b, sign(b, "x"))).http, 401);
  assert.equal(await creditBalance(org), 0);
});

test("LS: wrong amount, wrong currency, wrong provider credit nothing", async () => {
  const a = await mk("lemonsqueezy");
  assert.equal((await hook(lsBody("order_created", a.id, { subtotal: 1 }))).note, "not credited");
  assert.equal((await hook(lsBody("order_created", a.id, { currency: "MYR" }, "9002"))).note, "not credited");
  const t = await mk("toyyibpay");
  assert.equal((await hook(lsBody("order_created", t.id, {}, "9003"))).note, "unknown order");
  assert.equal(await creditBalance(org), 0);
});

test("LS: unpaid status credits nothing; late payment (display-expired) still credits", async () => {
  const o = await mk("lemonsqueezy");
  assert.equal((await hook(lsBody("order_created", o.id, { status: "pending" }))).note, "not paid yet");
  await db.execute(sql`UPDATE payment_orders SET created_at = now() - interval '3 days' WHERE id = ${o.id}`);
  const aged = (await getOrder(o.id))!;
  assert.equal(displayStatus(aged), "expired");
  assert.equal((await hook(lsBody("order_created", o.id))).note, "credited");
});

test("LS: refund debits once; replay does nothing", async () => {
  const o = await mk("lemonsqueezy");
  await hook(lsBody("order_created", o.id));
  const r = lsBody("order_refunded", o.id);
  assert.equal((await hook(r)).note, "refunded");
  assert.equal((await hook(r)).note, "ignored");
  assert.equal(await creditBalance(org), 0);
  assert.equal((await getOrder(o.id))?.status, "refunded");
});

test("LS: a part refund keeps the credits; a full refund takes them", async () => {
  const o = await mk("lemonsqueezy");
  await hook(lsBody("order_created", o.id));
  assert.equal((await hook(lsBody("order_refunded", o.id, { status: "partial_refund" }))).note, "partial refund");
  assert.equal(await creditBalance(org), pack.credits);
  assert.equal((await hook(lsBody("order_refunded", o.id))).note, "refunded");
  assert.equal(await creditBalance(org), 0);
});

test("LS: a discounted payment credits only for the owner's own free code (owner = our logged-in user, not the typed email)", async () => {
  process.env.LEMONSQUEEZY_OWNER_CODE = "OWNER"; process.env.OWNER_FREE_EMAILS = "owner@example.test";
  try {
    const uid = randomUUID(), oid = randomUUID();
    await db.insert(schema.user).values([{ id: uid, email: "owner@example.test", name: "o", emailVerified: true }, { id: oid, email: "other@example.test", name: "x", emailVerified: true }]);
    const theirs = await createPendingOrder({ orgId: org, userId: oid, provider: "lemonsqueezy", pack, currency: "USD" });
    assert.equal((await hook(lsBody("order_created", theirs.id, { discount_total: pack.price.USD, user_email: "owner@example.test" }))).note, "not credited");
    assert.equal(await creditBalance(org), 0);
    const mine = await createPendingOrder({ orgId: org, userId: uid, provider: "lemonsqueezy", pack, currency: "USD" });
    assert.equal((await hook(lsBody("order_created", mine.id, { discount_total: pack.price.USD }, "9002"))).note, "credited");
  } finally {
    delete process.env.LEMONSQUEEZY_OWNER_CODE; delete process.env.OWNER_FREE_EMAILS;
    await db.execute(sql`DELETE FROM "user" WHERE email IN ('owner@example.test', 'other@example.test')`);
  }
});

test("a test-mode payment never credits on the live site", async () => {
  const o = await mk("lemonsqueezy");
  process.env.PAYMENTS_MODE = "live";
  try {
    assert.equal(await creditOrder({ orderId: o.id, provider: "lemonsqueezy", providerRef: "T", amountMinor: pack.price.USD, currency: "USD", testMode: true }), "test_in_live");
    assert.equal(await creditOrder({ orderId: o.id, provider: "lemonsqueezy", providerRef: "T", amountMinor: pack.price.USD, currency: "USD", testMode: true }), "test_in_live");
    const noted = await db.execute(sql`SELECT count(*)::int AS n FROM audit_log WHERE action = 'payment_test_in_live' AND detail LIKE ${o.id + " %"}`);
    const r = noted as unknown as { rows?: { n: number }[] } & { n: number }[];
    assert.equal((r.rows ?? r)[0].n, 1); // asked twice, written down once
    assert.equal(await creditOrder({ orderId: o.id, provider: "lemonsqueezy", providerRef: "L", amountMinor: pack.price.USD, currency: "USD", testMode: false }), "credited");
    // a test-mode replay for the now credited order is not written down as "paid, not credited"
    assert.equal(await creditOrder({ orderId: o.id, provider: "lemonsqueezy", providerRef: "T2", amountMinor: pack.price.USD, currency: "USD", testMode: true }), "test_in_live");
    const again = await db.execute(sql`SELECT count(*)::int AS n FROM audit_log WHERE action = 'payment_test_in_live' AND detail LIKE ${o.id + " %"}`);
    const r2 = again as unknown as { rows?: { n: number }[] } & { n: number }[];
    assert.equal((r2.rows ?? r2)[0].n, 1);
  } finally { delete process.env.PAYMENTS_MODE; }
});

test("same provider payment cannot credit two orders", async () => {
  const a = await mk("lemonsqueezy"); const b = await mk("lemonsqueezy");
  assert.equal(await creditOrder({ orderId: a.id, provider: "lemonsqueezy", providerRef: "X", amountMinor: pack.price.USD, currency: "USD", testMode: true }), "credited");
  assert.equal(await creditOrder({ orderId: b.id, provider: "lemonsqueezy", providerRef: "X", amountMinor: pack.price.USD, currency: "USD", testMode: true }), "duplicate_ref");
  assert.equal(await creditBalance(org), pack.credits);
});

test("ledger unique index blocks a second purchase/refund row for one order", async () => {
  const o = await mk("mock");
  await creditOrder({ orderId: o.id, provider: "mock", providerRef: "m1", amountMinor: o.amountMinor, currency: "USD", testMode: true });
  await assert.rejects(db.execute(sql`INSERT INTO credits_ledger (org_id, delta, reason) VALUES (${org}, 5, ${"purchase:" + o.id})`));
  await refundOrder(o.id);
  await assert.rejects(db.execute(sql`INSERT INTO credits_ledger (org_id, delta, reason) VALUES (${org}, -5, ${"refund:" + o.id})`));
});

test("org isolation: credits go only to the buying org", async () => {
  const o = await mk("lemonsqueezy", org2);
  await hook(lsBody("order_created", o.id));
  assert.equal(await creditBalance(org2), pack.credits);
  assert.equal(await creditBalance(org), 0);
});

test("4th pending click in 10 min is rate limited", async () => {
  await mk("lemonsqueezy"); await mk("lemonsqueezy"); await mk("lemonsqueezy");
  await assert.rejects(mk("lemonsqueezy"), (e: unknown) => e instanceof PaymentError && e.code === "rate_limited");
  await mk("toyyibpay"); // other provider has its own budget
});

function txFetch(rows: unknown, ok = true) {
  globalThis.fetch = (async () => ok ? new Response(JSON.stringify(rows), { status: 200 }) : new Response("x", { status: 500 })) as typeof fetch;
}
async function tOrder() {
  const o = await mk("toyyibpay");
  await db.execute(sql`UPDATE payment_orders SET checkout_ref = 'bill1' WHERE id = ${o.id}`);
  return o;
}
const row = (id: string, over: Record<string, unknown> = {}) => ({ billExternalReferenceNo: id, billpaymentStatus: "1", billpaymentAmount: "20.00", billpaymentInvoiceNo: "TP1", ...over });

test("toyyibPay: one success row credits; replay credits once", async () => {
  const o = await tOrder();
  txFetch([row(o.id)]);
  assert.equal((await recheckToyyibPayOrder(o.id)).note, "credited");
  assert.equal((await recheckToyyibPayOrder(o.id)).note, "already paid");
  assert.equal(await creditBalance(org), pack.credits);
});

test("toyyibPay: no rows / failed row / wrong amount / other reference credit nothing", async () => {
  const o = await tOrder();
  for (const rows of [[], [row(o.id, { billpaymentStatus: "3" })], [row(o.id, { billpaymentAmount: "1.00" })], [row("someone-else")]]) {
    txFetch(rows);
    const r = await recheckToyyibPayOrder(o.id);
    assert.equal(r.http, 200);
  }
  assert.equal(await creditBalance(org), 0);
});

test("toyyibPay: many success rows credit once; malformed or down answers 503 and credit nothing", async () => {
  const o = await tOrder();
  txFetch([row(o.id), row(o.id, { billpaymentInvoiceNo: "TP2" })]);
  assert.equal((await recheckToyyibPayOrder(o.id)).note, "credited");
  assert.equal(await creditBalance(org), pack.credits);
  const p = await tOrder();
  txFetch({ nope: true });
  assert.equal((await recheckToyyibPayOrder(p.id)).http, 503);
  txFetch([], false);
  assert.equal((await recheckToyyibPayOrder(p.id)).http, 503);
  assert.equal((await getOrder(p.id))?.status, "pending");
});

test("unapproved packs are refused in live mode, allowed in test mode", () => {
  const unapproved = { ...pack, approved: false };
  process.env.PAYMENTS_MODE = "live";
  assert.equal(packSellable(unapproved), false);
  assert.equal(packSellable(pack), true); // the shipped packs are approved (owner, 2026-11-27)
  process.env.PAYMENTS_MODE = "test";
  assert.equal(packSellable(unapproved), true);
  delete process.env.PAYMENTS_MODE;
});

test("a provider with no config is hidden", async () => {
  delete process.env.LEMONSQUEEZY_API_KEY; delete process.env.TOYYIBPAY_SECRET_KEY; delete process.env.TOYYIBPAY_CATEGORY_CODE; delete process.env.PAYMENTS_MOCK;
  assert.deepEqual(await availableProviders(), []);
});

test("owner-only free code: sent only for allow-listed email", async () => {
  const { lemonsqueezy } = await import("../src/lib/payments/providers/lemonsqueezy");
  process.env.LEMONSQUEEZY_API_KEY = "k"; process.env.LEMONSQUEEZY_STORE_ID = "1"; process.env.LEMONSQUEEZY_VARIANT_PACK_1 = "2";
  process.env.LEMONSQUEEZY_OWNER_CODE = "OWNERFREE"; process.env.OWNER_FREE_EMAILS = " Boss@Example.com ,x@y.z";
  const bodies: any[] = [];
  globalThis.fetch = (async (_u: unknown, init: any) => { bodies.push(JSON.parse(init.body)); return new Response(JSON.stringify({ data: { id: "c1", attributes: { url: "https://x" } } }), { status: 200 }); }) as typeof fetch;
  const order = await mk("lemonsqueezy");
  await lemonsqueezy.createCheckout({ order, email: "boss@example.com", returnUrl: "https://r" } as any);
  await lemonsqueezy.createCheckout({ order, email: "other@example.com", returnUrl: "https://r" } as any);
  assert.equal(bodies[0].data.attributes.checkout_data.discount_code, "OWNERFREE");
  assert.equal(bodies[1].data.attributes.checkout_data.discount_code, undefined);
  assert.equal(bodies[0].data.attributes.checkout_data.billing_address.zip, "50000");
  assert.equal(bodies[0].data.attributes.checkout_data.name, "boss");
  assert.equal(bodies[1].data.attributes.checkout_data.name, undefined);
  assert.equal(bodies[1].data.attributes.checkout_data.billing_address.zip, undefined);
  assert.equal(bodies[0].data.attributes.checkout_options.discount, true);
  assert.equal(bodies[1].data.attributes.checkout_options.discount, false);
  delete process.env.OWNER_FREE_EMAILS; delete process.env.LEMONSQUEEZY_OWNER_CODE;
});

// ---- a user deletes a case from the list (soft delete, lib/case-delete; plan #159: only an open case with a problem on our side) ----
// `fault`: a failure line our side wrote on phase_b (no phase_b job, so the crash is unresolved); `job`: the state of the case's intake job (done by default)
const mkCase = async (status: string, o: { orgId?: string; merimen?: string; fault?: string | null; job?: string } = {}) => {
  const id = randomUUID();
  await db.insert(schema.cases).values({ id, orgId: o.orgId ?? org, plate: "DEL1234", status, merimenCaseId: o.merimen ?? null });
  await db.insert(schema.jobs).values({ caseId: id, step: "intake", state: o.job ?? "done" });
  const fault = o.fault === undefined ? "Worker error" : o.fault;
  if (fault) await db.insert(schema.caseEvents).values({ caseId: id, step: "phase_b", message: fault });
  return id;
};
const deletedAt = async (id: string) => (await db.select({ d: schema.cases.deletedAt }).from(schema.cases).where(sql`${schema.cases.id} = ${id}`))[0]?.d ?? null;

test("delete: the crash line is the one the worker writes", async () => {
  const { FAULT_LINE } = await import("../src/lib/case-delete");
  assert.equal(FAULT_LINE, "Worker error");
  const jobs = readFileSync(new URL("../../worker/autopilot_worker/jobs.py", import.meta.url), "utf8");
  assert.match(jobs, /^WORKER_ERROR = "Worker error"$/m); // loop.py's crash and the lease give-up write this exact text
});

test("delete: a worker claim that commits while the delete waits makes it busy, not deleted", async () => {
  const { Client } = await import("pg");
  const id = await mkCase("failed", { fault: null, job: "queued" });
  const claim = new Client({ connectionString: process.env.DATABASE_URL });
  await claim.connect();
  try {
    await claim.query("BEGIN");
    await claim.query("SELECT 1 FROM jobs j JOIN cases c ON c.id = j.case_id WHERE j.case_id = $1 FOR NO KEY UPDATE OF j, c", [id]);
    await claim.query("UPDATE jobs SET state = 'running' WHERE case_id = $1", [id]);
    const del = deleteCase(org, "u1", id); // waits for the claim's lock on the case row
    await new Promise((r) => setTimeout(r, 300));
    await claim.query("COMMIT");
    assert.deepEqual(await del, { ok: false, reason: "busy" });
    assert.equal(await deletedAt(id), null);
    assert.equal((await db.select().from(schema.jobs).where(sql`${schema.jobs.caseId} = ${id}`))[0].state, "running"); // not cancelled
  } finally { await claim.end(); }
});

test("delete: a new read result that lands while the delete waits is checked again (bad file now: not deleted)", async () => {
  const { Client } = await import("pg");
  const id = await mkCase("failed", { fault: null });
  await db.update(schema.cases).set({ error: "Connection error." }).where(sql`${schema.cases.id} = ${id}`); // ours: deletable
  const other = new Client({ connectionString: process.env.DATABASE_URL });
  await other.connect();
  try {
    await other.query("BEGIN");
    await other.query("SELECT 1 FROM cases WHERE id = $1 FOR UPDATE", [id]);
    const del = deleteCase(org, "u1", id); // its first read sees "Connection error."; its UPDATE waits for the lock
    await new Promise((r) => setTimeout(r, 300));
    await other.query("UPDATE cases SET error = 'bad_file:fake.pdf|corrupt' WHERE id = $1", [id]);
    await other.query("COMMIT");
    assert.deepEqual(await del, { ok: false, reason: "not_allowed" });
    assert.equal(await deletedAt(id), null);
  } finally { await other.end(); }
});

test("delete: an open case with our failure line is hidden, files and the case row kept, one audit row", async () => {
  const cases = [
    ["waiting_user", "Worker error"], ["phase_a", "Worker error"], ["pending_doc", "Worker error"], ["naming", "Worker error"],
    ["failed", null], ["uploaded", "Worker error"],
  ] as const;
  for (const [st, fault] of cases) {
    const id = await mkCase(st, { fault });
    assert.deepEqual(await deleteCase(org, "u1", id), { ok: true, refunded: false }, st); // charging is off: nothing to give back
    assert.ok(await deletedAt(id), st);
    assert.equal((await db.select().from(schema.auditLog).where(sql`${schema.auditLog.detail} = ${id}`)).length, 1);
    assert.deepEqual(await deleteCase(org, "u1", id), { ok: false, reason: "not_found" }); // a second press finds nothing
  }
});

test("delete: a case made in Merimen with our error (DCD4004) is hidden here only", async () => {
  // DCD4004 in production: waiting_user, made in Merimen, phase_b failed after 3 tries with two "Worker error" lines, later jobs done
  const id = await mkCase("waiting_user", { merimen: "M4004" });
  for (const [step, state] of [["phase_a", "failed"], ["phase_b", "failed"], ["phase_a", "done"]]) await db.insert(schema.jobs).values({ caseId: id, step, state });
  await db.insert(schema.caseEvents).values([{ caseId: id, step: "phase_b", message: "Worker error" }, { caseId: id, step: "phase_a", message: "The case already exists in Merimen, nothing was made again." }]);
  assert.deepEqual(await deleteCase(org, "u1", id), { ok: true, refunded: false });
  const [c] = await db.select().from(schema.cases).where(sql`${schema.cases.id} = ${id}`);
  assert.equal(c.merimenCaseId, "M4004"); // nothing about the Merimen link changes
});

test("delete: no problem of ours, or a done case, is refused as not_allowed and stays", async () => {
  for (const st of ["uploaded", "naming", "pending_doc", "waiting_user", "phase_a", "checking"]) {
    const id = await mkCase(st, { fault: null });
    assert.deepEqual(await deleteCase(org, "u1", id), { ok: false, reason: "not_allowed" }, st);
    assert.equal(await deletedAt(id), null);
  }
  // person stops, login waits that ran out of tries, a customer's bad file: jobs may be failed, but no crash line of ours
  for (const fault of ["Phase A not saved. check by hand: the manager", "Stopped after 3 tries (it waited 30 s, 2 min and 10 min in between). It will not be tried again by itself.", "Scan failed"]) {
    const stop = await mkCase("waiting_user", { fault, job: "failed" });
    assert.deepEqual(await deleteCase(org, "u1", stop), { ok: false, reason: "not_allowed" }, fault);
  }
  // finished work is never deleted, even after an old error
  const done = await mkCase("done", { fault: "Worker error", merimen: "M1" });
  assert.deepEqual(await deleteCase(org, "u1", done), { ok: false, reason: "not_allowed" });
  assert.equal(await deletedAt(done), null);
});

test("delete: a crash the worker got past does not count; one its step never got past does", async () => {
  const one = async (jobs: [string, string][], st = "waiting_user") => {
    const id = await mkCase(st, { fault: null });
    for (const [step, state] of jobs) await db.insert(schema.jobs).values({ caseId: id, step, state });
    await db.insert(schema.caseEvents).values({ caseId: id, step: "phase_b", message: "Worker error" });
    return id;
  };
  // the same phase_b job crashed once, was retried and finished; or its retry is still waiting: a normal case
  for (const state of ["done", "queued", "paused"]) assert.deepEqual(await deleteCase(org, "u1", await one([["phase_b", state]])), { ok: false, reason: "not_allowed" }, state);
  // an older phase_b failed, a later phase_b finished
  assert.deepEqual(await deleteCase(org, "u1", await one([["phase_b", "failed"], ["phase_b", "done"]])), { ok: false, reason: "not_allowed" });
  // phase_b crashed and stopped; a later phase_a finishing does not mend phase_b
  assert.deepEqual(await deleteCase(org, "u1", await one([["phase_b", "failed"], ["phase_a", "done"]])), { ok: true, refunded: false });
  assert.deepEqual(await deleteCase(org, "u1", await one([["phase_b", "cancelled"]])), { ok: true, refunded: false });
  // phase_b crashed, its retry finished, and a later phase_b run was cancelled (names edited): the old crash stays mended
  const later = await mkCase("waiting_user", { fault: null });
  await db.insert(schema.jobs).values({ caseId: later, step: "phase_b", state: "done" });
  await db.insert(schema.caseEvents).values({ caseId: later, step: "phase_b", message: "Worker error" });
  for (const state of ["cancelled", "failed"]) await db.insert(schema.jobs).values({ caseId: later, step: "phase_b", state });
  assert.deepEqual(await deleteCase(org, "u1", later), { ok: false, reason: "not_allowed" });
  // a Merimen logout at its cap writes a longer line, not the crash line: not ours
  const lo = await mkCase("waiting_user", { fault: "Merimen logged out 3 times in a row. Worker error", job: "failed" });
  assert.deepEqual(await deleteCase(org, "u1", lo), { ok: false, reason: "not_allowed" });
});

test("delete: a read or a running job on the case is refused as busy; queued and paused jobs are cancelled with the delete", async () => {
  const running = await mkCase("failed", { job: "running" });
  assert.deepEqual(await deleteCase(org, "u1", running), { ok: false, reason: "busy" });
  assert.equal(await deletedAt(running), null);
  const reading = await mkCase("reading");
  assert.deepEqual(await deleteCase(org, "u1", reading), { ok: false, reason: "busy" });
  assert.equal(await deletedAt(reading), null);
  for (const job of ["queued", "paused"]) {
    const id = await mkCase("waiting_user", { job });
    assert.deepEqual(await deleteCase(org, "u1", id), { ok: true, refunded: false }, job);
    assert.equal((await db.select().from(schema.jobs).where(sql`${schema.jobs.caseId} = ${id}`))[0].state, "cancelled");
  }
});

test("delete: another organisation's case looks like no case at all", async () => {
  const id = await mkCase("failed", { orgId: org2 });
  assert.deepEqual(await deleteCase(org, "u1", id), { ok: false, reason: "not_found" });
  assert.equal(await deletedAt(id), null);
});

test("delete: a customer's bad file is not our side, a zip with several cars or a crash is", async () => {
  const { ZIP_WHY } = await import("../src/lib/case-text");
  const failedWith = async (error: string, fault: string | null = null) => {
    const id = await mkCase("failed", { fault }); await db.update(schema.cases).set({ error }).where(sql`${schema.cases.id} = ${id}`); return id;
  };
  for (const e of ["bad_file:fake.pdf|corrupt", "no PDF in this case", "broken.zip: the zip cannot be opened", "missing vehicle model"]) { // the last: the worker waits for case details
    const id = await failedWith(e);
    assert.deepEqual(await deleteCase(org, "u1", id), { ok: false, reason: "not_allowed" }, e); // "Replace files" is the action
    assert.equal(await deletedAt(id), null);
  }
  // a job running at the first read does not skip the bad-file check: once that job ends the case would otherwise pass (review round 8)
  const running = await failedWith("no PDF in this case");
  await db.insert(schema.jobs).values({ caseId: running, step: "photo_model", state: "running" });
  assert.deepEqual(await deleteCase(org, "u1", running), { ok: false, reason: "not_allowed" });
  for (const [e, fault] of [[`cars.zip: ${ZIP_WHY.multi}`, null], ["Connection error.", null], ["bad_file:fake.pdf|corrupt", "Worker error"]] as const)
    assert.deepEqual(await deleteCase(org, "u1", await failedWith(e, fault)), { ok: true, refunded: false }, e);
});

test("delete: the list's flag is the same rule, one answer per case with many lines and jobs", async () => {
  const { canDeleteSql, deletableIds, createPendingIds } = await import("../src/lib/case-delete");
  const yes = await mkCase("waiting_user");
  await db.insert(schema.caseEvents).values([{ caseId: yes, step: "x", message: "Worker error" }, { caseId: yes, step: "x", message: "Worker error" }]);
  await db.insert(schema.jobs).values([{ caseId: yes, step: "phase_a", state: "failed" }, { caseId: yes, step: "phase_b", state: "done" }]);
  const no = await mkCase("waiting_user", { fault: null });
  const busy = await mkCase("waiting_user", { job: "running" });
  const r = await db.execute(sql`SELECT c.id, ${canDeleteSql()} AS ok FROM cases c WHERE c.id IN (${yes}, ${no}, ${busy})`);
  const rows = ((r as { rows?: unknown[] }).rows ?? r) as { id: string; ok: boolean }[];
  assert.equal(rows.length, 3);
  assert.deepEqual(Object.fromEntries(rows.map((x) => [x.id, x.ok])), { [yes]: true, [no]: false, [busy]: false });
  const bad = await mkCase("failed", { fault: null }); await db.update(schema.cases).set({ error: "no PDF in this case" }).where(sql`${schema.cases.id} = ${bad}`);
  const done = await mkCase("done"); // a crash line on a finished case: never deletable, and the list skips its checks
  assert.deepEqual([...await deletableIds([yes, no, busy, bad, done])], [yes]); // what the list shows: the rule minus a customer's bad file
  // a Create pressed in Merimen with no case id back yet counts as in Merimen for the pop-up, until Merimen says nothing was made
  await db.insert(schema.caseEvents).values({ caseId: yes, step: "create_submitted", message: "Create pressed in Merimen" });
  assert.deepEqual([...await createPendingIds([yes, no])], [yes]);
  await db.insert(schema.caseEvents).values({ caseId: yes, step: "create_cleared", message: "Merimen did not accept the create, no case was made" });
  assert.deepEqual([...await createPendingIds([yes, no])], []);
});

test("delete: the credit goes back for every case deleted here (our side broke it), once, Merimen cases too", async () => {
  process.env.CREDITS_ENFORCE = "on"; delete process.env.CREDITS_EXEMPT_ORGS;
  try {
    await db.insert(schema.creditsLedger).values({ orgId: org, delta: 5000, reason: "grant" });
    const a = await mkCase("uploaded"); assert.ok(await debitCase(org, a));
    assert.equal(await creditBalance(org), 4000);
    assert.deepEqual(await deleteCase(org, "u1", a), { ok: true, refunded: true });
    assert.equal(await creditBalance(org), 5000);
    const n = await mkCase("naming"); assert.ok(await debitCase(org, n)); // documents were read, then the worker broke it: credit back
    assert.deepEqual(await deleteCase(org, "u1", n), { ok: true, refunded: true });
    assert.equal(await creditBalance(org), 5000);
    const b = await mkCase("failed"); assert.ok(await debitCase(org, b));
    const { refundCase } = await import("../src/lib/payments/case-credit");
    assert.ok(await refundCase(org, b, "failed")); // the read already gave it back when it failed: not twice
    assert.deepEqual(await deleteCase(org, "u1", b), { ok: true, refunded: false });
    assert.equal(await creditBalance(org), 5000);
    const m = await mkCase("waiting_user", { merimen: "M9" }); assert.ok(await debitCase(org, m));
    assert.deepEqual(await deleteCase(org, "u1", m), { ok: true, refunded: true });
    assert.equal(await creditBalance(org), 5000);
    const free = await mkCase("waiting_user"); // never charged (charging was off then): nothing to give back
    assert.deepEqual(await deleteCase(org, "u1", free), { ok: true, refunded: false });
    assert.equal(await creditBalance(org), 5000);
  } finally { delete process.env.CREDITS_ENFORCE; }
});

test("refund: two refunds of one case at the same moment give the credit back once (read failure and delete)", async () => {
  process.env.CREDITS_ENFORCE = "on"; delete process.env.CREDITS_EXEMPT_ORGS;
  try {
    const { refundCase } = await import("../src/lib/payments/case-credit");
    await db.insert(schema.creditsLedger).values({ orgId: org, delta: 1000, reason: "grant" });
    const before = await creditBalance(org);
    for (let i = 0; i < 5; i++) {
      const id = await mkCase("failed", { fault: null }); assert.ok(await debitCase(org, id));
      const r = await Promise.all([refundCase(org, id, "failed"), refundCase(org, id, "deleted"), refundCase(org, id, "deleted")]);
      assert.equal(r.filter(Boolean).length, 1, `round ${i}`);
      assert.equal(await creditBalance(org), before);
    }
  } finally { delete process.env.CREDITS_ENFORCE; }
});

// ---- the files of a deleted case are removed after 7 days (lib/purge-deleted-cases) ----
const mkDeleted = async (daysAgo: number | null) => {
  const id = randomUUID();
  await db.insert(schema.cases).values({ id, orgId: org, plate: "PUR1234", status: "failed", caseData: { read: true } as never,
    deletedAt: daysAgo == null ? null : new Date(Date.now() - daysAgo * 86_400_000) });
  await db.insert(schema.caseFiles).values({ caseId: id, kind: "pdf", blobUrl: `https://blob.example/${id}/a.pdf`, originalName: "a.pdf", size: 1 });
  await db.insert(schema.casePhotos).values({ caseId: id, position: 0, origN: 1, srcName: "1.jpg", blobPath: `${org}/${id}/photos/1.jpg`, thumbPath: `${org}/${id}/photos/t1.jpg` });
  await db.insert(schema.photoUploads).values({ path: `${org}/${id}/photos/late.jpg`, caseId: id });
  await db.insert(schema.caseEvents).values({ caseId: id, step: "read", message: "Reading documents" });
  return id;
};
const rowsOf = async (id: string) => ({
  files: (await db.select().from(schema.caseFiles).where(sql`${schema.caseFiles.caseId} = ${id}`)).length,
  photos: (await db.select().from(schema.casePhotos).where(sql`${schema.casePhotos.caseId} = ${id}`)).length,
  data: (await db.select({ d: schema.cases.caseData }).from(schema.cases).where(sql`${schema.cases.id} = ${id}`))[0].d,
});

test("purge: only a case deleted more than 7 days ago loses its files, photos and read text; the case row and audit stay; a second run does nothing", async () => {
  const old = await mkDeleted(8), fresh = await mkDeleted(3), live = await mkDeleted(null);
  const removed: string[] = [];
  const r = await purgeDeletedCases(async (p) => { removed.push(p); });
  assert.deepEqual(r, { cases: 1, files: 4, failed: 0 });
  assert.equal(removed.length, 4); assert.ok(removed.every((p) => p.includes(old)));
  assert.deepEqual(await rowsOf(old), { files: 0, photos: 0, data: null });
  assert.equal((await rowsOf(fresh)).files, 1); assert.equal((await rowsOf(live)).photos, 1);
  assert.equal((await db.select().from(schema.cases).where(sql`${schema.cases.id} = ${old}`)).length, 1);
  assert.equal((await db.select().from(schema.auditLog).where(sql`${schema.auditLog.action} = 'case.purge'`)).length, 1);
  assert.deepEqual(await purgeDeletedCases(async () => { throw new Error("nothing is due"); }), { cases: 0, files: 0, failed: 0 });
});

test("purge: a file that cannot be removed leaves the case whole for the next run", async () => {
  const id = await mkDeleted(9);
  const r = await purgeDeletedCases(async () => { throw new Error("store down"); });
  assert.deepEqual(r, { cases: 0, files: 0, failed: 1 });
  assert.deepEqual(await rowsOf(id), { files: 1, photos: 1, data: { read: true } });
  assert.equal((await purgeDeletedCases(async () => {})).cases, 1);
});

test("purge: a file another case still points at is kept, the rest of the deleted case goes", async () => {
  const gone = await mkDeleted(9), live = await mkDeleted(null);
  const shared = `https://blob.example/${gone}/a.pdf`;
  await db.update(schema.caseFiles).set({ blobUrl: shared }).where(sql`${schema.caseFiles.caseId} = ${live}`); // the live case was made from the same URL
  const removed: string[] = [];
  const r = await purgeDeletedCases(async (p) => { removed.push(p); });
  assert.deepEqual({ cases: r.cases, files: r.files, skipped: r.skipped }, { cases: 1, files: 3, skipped: 1 });
  assert.ok(!removed.includes(shared));
  assert.equal((await rowsOf(live)).files, 1);
  assert.equal((await rowsOf(gone)).files, 0);
});

test("purge: a case whose only leftover is the read text is purged once, and a JSON null counts as nothing", async () => {
  const id = randomUUID(), nul = randomUUID();
  const old = new Date(Date.now() - 9 * 86_400_000);
  await db.insert(schema.cases).values({ id, orgId: org, plate: "T1", status: "failed", caseData: { x: 1 } as never, deletedAt: old });
  await db.insert(schema.cases).values({ id: nul, orgId: org, plate: "T2", status: "failed", caseData: null as never, deletedAt: old });
  await db.execute(sql`UPDATE cases SET case_data = 'null'::jsonb WHERE id = ${nul}`);
  assert.equal((await purgeDeletedCases(async () => {})).cases, 1);
  assert.equal((await purgeDeletedCases(async () => {})).cases, 0);
});

test("purge: events and upload rows go too, and a case with a running job is left alone", async () => {
  const id = await mkDeleted(9);
  await db.insert(schema.jobs).values({ caseId: id, step: "intake", state: "running" });
  assert.equal((await purgeDeletedCases(async () => {})).cases, 0);
  await db.update(schema.jobs).set({ state: "queued" }).where(sql`${schema.jobs.caseId} = ${id}`);
  assert.equal((await purgeDeletedCases(async () => {})).cases, 1);
  assert.equal((await db.select().from(schema.caseEvents).where(sql`${schema.caseEvents.caseId} = ${id}`)).length, 0);
  assert.equal((await db.select().from(schema.photoUploads).where(sql`${schema.photoUploads.caseId} = ${id}`)).length, 0);
  assert.equal((await db.select().from(schema.jobs).where(sql`${schema.jobs.caseId} = ${id}`))[0].state, "cancelled");
});

test("purge: a file with no row (listed by the case folder) is removed, the error text goes, a full-URL file shared with another case's bare path is kept", async () => {
  const gone = await mkDeleted(9), live = randomUUID();
  await db.update(schema.cases).set({ error: "scan failed: Jane Tan IC.pdf", pendingDoc: "insurance form" }).where(sql`${schema.cases.id} = ${gone}`);
  await db.insert(schema.cases).values({ id: live, orgId: org, plate: "LIVE1", status: "naming" });
  const url = `https://blob.example/${org}/${gone}/photos/1.jpg`; // a full URL for the very path the live case holds as a bare pathname
  await db.update(schema.caseFiles).set({ blobUrl: url }).where(sql`${schema.caseFiles.caseId} = ${gone}`);
  await db.insert(schema.casePhotos).values({ caseId: live, position: 0, origN: 1, srcName: "x.jpg", blobPath: `${org}/${gone}/photos/1.jpg`, thumbPath: "" });
  const removed: string[] = [];
  const r = await purgeDeletedCases(async (p) => { removed.push(p); }, { listPrefix: async () => [`${org}/${gone}/orphan.jpg`] });
  assert.equal(r.cases, 1);
  assert.ok(removed.includes(`${org}/${gone}/orphan.jpg`));
  assert.ok(!removed.includes(url));
  const [row] = await db.select({ e: schema.cases.error, d: schema.cases.pendingDoc }).from(schema.cases).where(sql`${schema.cases.id} = ${gone}`);
  assert.deepEqual(row, { e: null, d: null });
  assert.equal((await db.select().from(schema.auditLog).where(sql`${schema.auditLog.action} = 'case.purge'`)).length, 1);
});

test("purge: a shared file is kept even when the other case stored its name escaped differently", async () => {
  const gone = randomUUID(), live = randomUUID();
  const old = new Date(Date.now() - 9 * 86_400_000);
  await db.insert(schema.cases).values([{ id: gone, orgId: org, plate: "G1", status: "failed", deletedAt: old }, { id: live, orgId: org, plate: "L1", status: "naming" }]);
  await db.insert(schema.caseFiles).values({ caseId: gone, kind: "pdf", blobUrl: `https://blob.example/${org}/${gone}/Car%20%5B1%5D.pdf`, originalName: "Car [1].pdf", size: 1 });
  await db.insert(schema.caseFiles).values({ caseId: live, kind: "pdf", blobUrl: `https://blob.example/${org}/${gone}/Car%20[1].pdf`, originalName: "Car [1].pdf", size: 1 });
  const removed: string[] = [];
  const r = await purgeDeletedCases(async (p) => { removed.push(p); });
  assert.deepEqual(removed, []);
  assert.equal(r.skipped, 1);
});
