// Run: DATABASE_URL=postgresql://pay:pay@localhost:5432/paytest npm test  (migrations applied first)
import { test, before, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { db, schema } from "../src/db";
import { createPendingOrder, displayStatus, getOrder } from "../src/lib/payments/orders";
import { creditBalance, creditOrder, refundOrder } from "../src/lib/payments/credit";
import { debitCase } from "../src/lib/payments/case-credit";
import { deleteCase } from "../src/lib/case-delete";
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
  process.env.PAYMENTS_MODE = "live";
  assert.equal(packSellable(pack), false);
  process.env.PAYMENTS_MODE = "test";
  assert.equal(packSellable(pack), true);
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

// ---- a user deletes a case from the list (soft delete, lib/case-delete) ----
const mkCase = async (status: string, o: { orgId?: string; merimen?: string } = {}) => {
  const id = randomUUID();
  await db.insert(schema.cases).values({ id, orgId: o.orgId ?? org, plate: "DEL1234", status, merimenCaseId: o.merimen ?? null });
  await db.insert(schema.jobs).values({ caseId: id, step: "intake", state: "queued" });
  return id;
};
const deletedAt = async (id: string) => (await db.select({ d: schema.cases.deletedAt }).from(schema.cases).where(sql`${schema.cases.id} = ${id}`))[0]?.d ?? null;

test("delete: a case the worker has not taken is hidden, its job cancelled, files and the case row kept, one audit row", async () => {
  for (const st of ["uploaded", "naming", "pending_doc", "failed"]) {
    const id = await mkCase(st);
    assert.deepEqual(await deleteCase(org, "u1", id), { ok: true, refunded: false }); // charging is off: nothing to give back
    assert.ok(await deletedAt(id), st);
    assert.equal((await db.select().from(schema.jobs).where(sql`${schema.jobs.caseId} = ${id}`))[0].state, "cancelled");
    assert.equal((await db.select().from(schema.auditLog).where(sql`${schema.auditLog.detail} = ${id}`)).length, 1);
    assert.deepEqual(await deleteCase(org, "u1", id), { ok: false, reason: "not_found" }); // a second press finds nothing
  }
});

test("delete: reading, the worker's steps, a case made in Merimen and a done case are refused and stay", async () => {
  for (const st of ["reading", "phase_a", "waiting_user", "phase_b", "checking", "done"]) {
    const id = await mkCase(st);
    assert.deepEqual(await deleteCase(org, "u1", id), { ok: false, reason: "busy" }, st);
    assert.equal(await deletedAt(id), null);
  }
  const made = await mkCase("failed", { merimen: "M123" });
  assert.deepEqual(await deleteCase(org, "u1", made), { ok: false, reason: "busy" });
});

test("delete: another organisation's case looks like no case at all", async () => {
  const id = await mkCase("failed", { orgId: org2 });
  assert.deepEqual(await deleteCase(org, "u1", id), { ok: false, reason: "not_found" });
  assert.equal(await deletedAt(id), null);
});

test("delete: the credit goes back once, and not twice for a case already refunded for failing", async () => {
  process.env.CREDITS_ENFORCE = "on"; delete process.env.CREDITS_EXEMPT_ORGS;
  try {
    await db.insert(schema.creditsLedger).values({ orgId: org, delta: 5000, reason: "grant" });
    const a = await mkCase("naming"); assert.ok(await debitCase(org, a));
    assert.equal(await creditBalance(org), 4000);
    assert.deepEqual(await deleteCase(org, "u1", a), { ok: true, refunded: true });
    assert.equal(await creditBalance(org), 5000);
    const b = await mkCase("failed"); assert.ok(await debitCase(org, b));
    const { refundCase } = await import("../src/lib/payments/case-credit");
    assert.ok(await refundCase(org, b, "failed")); // the worker already gave it back
    assert.deepEqual(await deleteCase(org, "u1", b), { ok: true, refunded: false });
    assert.equal(await creditBalance(org), 5000);
  } finally { delete process.env.CREDITS_ENFORCE; }
});
