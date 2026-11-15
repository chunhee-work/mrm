import { z } from "zod";
import type { CheckoutInput, PaymentProvider } from "../types";
import { PaymentError } from "../types";
import { creditOrder, auditPayment } from "../credit";
import { getOrder } from "../orders";
import { decimalToMinor } from "../money";

// toyyibPay: Malaysian online banking (FPX). Charges in MYR. Plan: chunhee-work/mrm#12.
//
// The callback hash (MD5) is weak, so we NEVER trust the callback body. It only tells us which of our
// orders to re-check; the payment itself is confirmed by asking toyyibPay (getBillTransactions) for the
// bill code we stored when the bill was created.
//
// UNVERIFIED RESPONSE SHAPES: field names below follow toyyibPay's API reference but have not yet been
// confirmed against a captured sandbox/live response. The first live/sandbox payment must be captured
// and the fixture in tests/fixtures replaced before this provider is switched on in live mode.
const TIMEOUT_MS = 10_000;
export const SUCCESS_STATUS = "1";

const base = () => (process.env.TOYYIBPAY_BASE_URL || "https://toyyibpay.com").replace(/\/$/, "");
export const isSandbox = () => /dev\.toyyibpay\.com/.test(base());

async function form(path: string, params: Record<string, string>): Promise<unknown> {
  const key = process.env.TOYYIBPAY_SECRET_KEY;
  if (!key) throw new PaymentError("unavailable", "toyyibPay is not configured");
  let res: Response;
  try {
    res = await fetch(`${base()}/index.php/api/${path}`, {
      method: "POST",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ userSecretKey: key, ...params }),
    });
  } catch {
    throw new PaymentError("provider_error", "toyyibPay did not answer");
  }
  if (!res.ok) throw new PaymentError("provider_error", `toyyibPay returned HTTP ${res.status}`);
  try {
    return await res.json();
  } catch {
    throw new PaymentError("provider_error", "toyyibPay returned a non-JSON reply");
  }
}

const CACHE_MS = 5 * 60_000;
let health: { at: number; ok: boolean } | null = null;

export const toyyibpay: PaymentProvider = {
  id: "toyyibpay",
  currency: "MYR",
  hasConfig() {
    return !!(process.env.TOYYIBPAY_SECRET_KEY && process.env.TOYYIBPAY_CATEGORY_CODE);
  },
  async isHealthy() {
    if (!this.hasConfig()) return false;
    if (health && Date.now() - health.at < CACHE_MS) return health.ok;
    let ok = false;
    try {
      const r = await form("getCategoryDetails", { categoryCode: String(process.env.TOYYIBPAY_CATEGORY_CODE) });
      ok = Array.isArray(r) && r.length > 0;
    } catch (e) {
      console.error("toyyibpay health check failed:", (e as Error).message);
    }
    health = { at: Date.now(), ok };
    return ok;
  },
  async packAvailable() {
    return this.hasConfig();
  },
  async createCheckout({ order, email, returnUrl, callbackUrl }: CheckoutInput) {
    // createBill answers HTTP 200 even on failure, so the body must be checked.
    const r = await form("createBill", {
      categoryCode: String(process.env.TOYYIBPAY_CATEGORY_CODE),
      billName: `Credits ${order.packTitle}`.slice(0, 30),
      billDescription: `${order.credits} credits`.slice(0, 100),
      billPriceSetting: "1",
      billPayorInfo: "0",
      billAmount: String(order.amountMinor), // sen
      billReturnUrl: returnUrl,
      billCallbackUrl: callbackUrl,
      billExternalReferenceNo: order.id,
      billEmail: email,
      billPaymentChannel: "0", // FPX only (DuitNow QR needs the owner's consent in the dashboard)
      billExpiryDays: "1",
    });
    const code = Array.isArray(r) ? (r[0] as { BillCode?: string } | undefined)?.BillCode : undefined;
    if (!code || typeof code !== "string") throw new PaymentError("provider_error", "toyyibPay did not create the bill");
    return { url: `${base()}/${code}`, checkoutRef: code };
  },
};

const TxRow = z.object({
  billExternalReferenceNo: z.string().nullable().optional(),
  billpaymentStatus: z.union([z.string(), z.number()]),
  billpaymentAmount: z.union([z.string(), z.number()]),
  billpaymentInvoiceNo: z.string().nullable().optional(),
});
const TxList = z.array(TxRow);

export type CallbackOutcome = { http: number; note: string };

/** Re-checks one order with toyyibPay and credits it if (and only if) a matching success row exists. */
export async function recheckToyyibPayOrder(orderId: string): Promise<CallbackOutcome> {
  const order = await getOrder(orderId);
  if (!order || order.provider !== "toyyibpay" || !order.checkoutRef) return { http: 200, note: "unknown order" };
  if (order.status !== "pending") return { http: 200, note: `already ${order.status}` };

  let rows: z.infer<typeof TxList>;
  try {
    const raw = await form("getBillTransactions", { billCode: order.checkoutRef });
    const p = TxList.safeParse(raw);
    if (!p.success) throw new PaymentError("provider_error", "unexpected getBillTransactions shape");
    rows = p.data;
  } catch (e) {
    // Provider down or reply malformed: credit nothing, leave pending, ask toyyibPay to call again.
    console.error("toyyibpay lookup failed:", (e as Error).message);
    return { http: 503, note: "lookup failed" };
  }

  const wins = rows.filter((r) => r.billExternalReferenceNo === order.id && String(r.billpaymentStatus) === SUCCESS_STATUS);
  if (!wins.length) return { http: 200, note: "not paid" };
  const first = wins[0];
  const amount = decimalToMinor(String(first.billpaymentAmount));
  if (amount === null) {
    await auditPayment("payment_bad_payload", order.id, "toyyibpay amount");
    return { http: 200, note: "bad amount" };
  }
  const r = await creditOrder({
    orderId: order.id,
    provider: "toyyibpay",
    providerRef: first.billpaymentInvoiceNo || `${order.checkoutRef}`,
    amountMinor: amount,
    currency: "MYR",
    testMode: isSandbox(),
  });
  if (wins.length > 1) await auditPayment("payment_duplicate_success", order.id, `${wins.length} rows`);
  if (r === "ignored") await auditPayment("payment_amount_mismatch", order.id, "toyyibpay");
  if (r === "duplicate_ref") await auditPayment("payment_duplicate_ref", order.id, "toyyibpay");
  return { http: 200, note: r };
}
