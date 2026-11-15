import { createHmac, timingSafeEqual } from "node:crypto";
import type { Pack } from "../packs";
import type { CheckoutInput, PaymentProvider } from "../types";
import { PaymentError } from "../types";
import { creditOrder, refundOrder, auditPayment } from "../credit";
import { getOrder } from "../orders";
import { z } from "zod";

// Lemon Squeezy (merchant of record). Cards and PayPal. Charges in USD (one currency per store).
// Plan: chunhee-work/mrm#12. Server-only; never import from a client component.

const API = "https://api.lemonsqueezy.com/v1";
const TIMEOUT_MS = 10_000;

export const variantEnvName = (pack: Pack) => `LEMONSQUEEZY_VARIANT_${pack.id.toUpperCase()}`;
const variantId = (pack: Pack) => process.env[variantEnvName(pack)] || "";

async function ls(path: string, init: RequestInit = {}) {
  const key = process.env.LEMONSQUEEZY_API_KEY;
  if (!key) throw new PaymentError("unavailable", "Lemon Squeezy is not configured");
  let res: Response;
  try {
    res = await fetch(`${API}${path}`, {
      ...init,
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { Accept: "application/vnd.api+json", "Content-Type": "application/vnd.api+json", Authorization: `Bearer ${key}`, ...(init.headers ?? {}) },
    });
  } catch {
    throw new PaymentError("provider_error", "Lemon Squeezy did not answer");
  }
  if (!res.ok) throw new PaymentError("provider_error", `Lemon Squeezy returned HTTP ${res.status}`);
  return res.json() as Promise<any>;
}

const CACHE_MS = 5 * 60_000;
const cache = new Map<string, { at: number; v: unknown }>();
async function cached<T>(key: string, f: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.v as T;
  const v = await f();
  cache.set(key, { at: Date.now(), v });
  return v;
}

export const lemonsqueezy: PaymentProvider = {
  id: "lemonsqueezy",
  currency: "USD",
  hasConfig() {
    return !!(process.env.LEMONSQUEEZY_API_KEY && process.env.LEMONSQUEEZY_STORE_ID && process.env.LEMONSQUEEZY_WEBHOOK_SECRET);
  },
  async isHealthy() {
    if (!this.hasConfig()) return false;
    try {
      return await cached("health", async () => {
        await ls(`/stores/${process.env.LEMONSQUEEZY_STORE_ID}`);
        return true;
      });
    } catch (e) {
      console.error("lemonsqueezy health check failed:", (e as Error).message);
      return false;
    }
  },
  async packAvailable(pack) {
    const id = variantId(pack);
    if (!id) return false;
    try {
      // One source of truth: PACKS. The variant price in Lemon Squeezy must match it.
      const price = await cached(`variant:${id}`, async () => (await ls(`/variants/${id}`)).data?.attributes?.price as number | undefined);
      if (price !== pack.price.USD) {
        await auditPayment("payment_price_mismatch", null, `${pack.id} variant ${id}`);
        return false;
      }
      return true;
    } catch (e) {
      console.error("lemonsqueezy variant check failed:", (e as Error).message);
      return false;
    }
  },
  async createCheckout({ order, email, returnUrl }: CheckoutInput) {
    const variant = process.env[`LEMONSQUEEZY_VARIANT_${order.packId.toUpperCase()}`];
    if (!variant) throw new PaymentError("unavailable", "This pack is not available with Lemon Squeezy");
    const body = {
      data: {
        type: "checkouts",
        attributes: {
          checkout_options: { discount: false },
          checkout_data: { email, billing_address: { country: "MY" }, custom: { order_id: order.id } },
          product_options: { redirect_url: returnUrl },
        },
        relationships: {
          store: { data: { type: "stores", id: String(process.env.LEMONSQUEEZY_STORE_ID) } },
          variant: { data: { type: "variants", id: String(variant) } },
        },
      },
    };
    const json = await ls("/checkouts", { method: "POST", body: JSON.stringify(body) });
    const url = json?.data?.attributes?.url as string | undefined;
    const id = json?.data?.id as string | undefined;
    if (!url || !id) throw new PaymentError("provider_error", "Lemon Squeezy returned no checkout URL");
    return { url, checkoutRef: id };
  },
};

// ---- webhook ----

/** X-Signature is the hex HMAC-SHA256 of the RAW body with the signing secret. Constant-time compare. */
export function verifySignature(rawBody: string, signature: string | null, secret: string | undefined): boolean {
  if (!signature || !secret) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

// Fields we trust (plan #12, DPR-12-4 D1). The test fixtures are the captured payloads.
const OrderEvent = z.object({
  meta: z.object({ event_name: z.string(), custom_data: z.object({ order_id: z.string() }).partial().optional() }),
  data: z.object({
    id: z.union([z.string(), z.number()]),
    attributes: z.object({ status: z.string(), subtotal: z.number(), currency: z.string(), test_mode: z.boolean().optional() }),
  }),
});

export type WebhookOutcome = { http: number; note: string };

export async function handleLemonSqueezyWebhook(rawBody: string, signature: string | null): Promise<WebhookOutcome> {
  if (!verifySignature(rawBody, signature, process.env.LEMONSQUEEZY_WEBHOOK_SECRET)) return { http: 401, note: "bad signature" };
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return { http: 400, note: "bad json" };
  }
  const name = (parsed as { meta?: { event_name?: string } })?.meta?.event_name;
  if (name !== "order_created" && name !== "order_refunded") return { http: 200, note: "ignored event" };
  const ev = OrderEvent.safeParse(parsed);
  if (!ev.success) {
    await auditPayment("payment_bad_payload", null, `ls ${name}`);
    return { http: 400, note: "unexpected payload" };
  }
  const { meta, data } = ev.data;
  const providerRef = String(data.id);

  if (name === "order_created") {
    if (data.attributes.status !== "paid") return { http: 200, note: "not paid yet" };
    const orderId = meta.custom_data?.order_id;
    if (!orderId) return { http: 200, note: "no order id" };
    const order = await getOrder(orderId);
    if (!order || order.provider !== "lemonsqueezy") return { http: 200, note: "unknown order" };
    const r = await creditOrder({
      orderId,
      provider: "lemonsqueezy",
      providerRef,
      amountMinor: data.attributes.subtotal,
      currency: data.attributes.currency.toUpperCase(),
      testMode: data.attributes.test_mode === true,
    });
    if (r === "ignored") {
      // Paid at the provider but we did not credit: wrong amount/currency, or already handled.
      if (order.status === "pending") await auditPayment("payment_amount_mismatch", orderId, `ls ${providerRef}`);
      return { http: 200, note: "not credited" };
    }
    if (r === "duplicate_ref") await auditPayment("payment_duplicate_ref", orderId, `ls ${providerRef}`);
    return { http: 200, note: r };
  }

  // order_refunded: find our order by the Lemon Squeezy order id stored when it was paid
  const { db, schema } = await import("@/db");
  const { and, eq } = await import("drizzle-orm");
  const [o] = await db.select().from(schema.paymentOrders).where(and(eq(schema.paymentOrders.provider, "lemonsqueezy"), eq(schema.paymentOrders.providerRef, providerRef))).limit(1);
  if (!o) return { http: 200, note: "unknown order" };
  const r = await refundOrder(o.id, "lemonsqueezy");
  if (r === "refunded") await auditPayment("payment_refunded", o.id, `ls ${providerRef}`);
  return { http: 200, note: r };
}
