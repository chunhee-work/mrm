import { sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { ProviderId } from "./types";
import { paymentsMode } from "./packs";

// The only two places that move credits for money. Both are ONE SQL statement each, because the
// production driver (neon-http) has no transactions. Replays and races change zero rows.

function rowsOf(res: unknown): any[] {
  const r = res as { rows?: any[] } | any[];
  return Array.isArray(r) ? r : (r.rows ?? []);
}

export type CreditResult = "credited" | "ignored" | "duplicate_ref" | "test_in_live";

/**
 * Marks a pending order paid and adds its credits, atomically.
 * Credits only if the order is still `pending` AND provider, amount (minor units) and currency match
 * what we priced. `expired` is display-only, so a late payment still credits.
 */
export async function creditOrder(a: {
  orderId: string;
  provider: ProviderId;
  providerRef: string;
  amountMinor: number;
  currency: string;
  testMode: boolean;
}): Promise<CreditResult> {
  // a payment made in the provider's test mode must never give real credits on the live site
  if (a.testMode && paymentsMode() === "live") {
    // written down once per order and payment: a toyyibPay order is asked again on every billing-page visit
    const detail = `${a.orderId} ${a.provider} ${a.providerRef}`;
    await db.execute(sql`
      INSERT INTO audit_log (action, detail) SELECT 'payment_test_in_live', ${detail}
      WHERE NOT EXISTS (SELECT 1 FROM audit_log WHERE action = 'payment_test_in_live' AND detail = ${detail})`);
    return "test_in_live";
  }
  try {
    const res = await db.execute(sql`
      WITH upd AS (
        UPDATE payment_orders
           SET status = 'paid', paid_at = now(), provider_ref = ${a.providerRef}, test_mode = ${a.testMode}
         WHERE id = ${a.orderId}
           AND provider = ${a.provider}
           AND status = 'pending'
           AND amount_minor = ${String(a.amountMinor)}::bigint
           AND currency = ${a.currency}
        RETURNING id, org_id, credits)
      INSERT INTO credits_ledger (org_id, delta, reason)
      SELECT org_id, credits, 'purchase:' || id FROM upd
      RETURNING id`);
    return rowsOf(res).length ? "credited" : "ignored";
  } catch (e) {
    // The same provider payment can never credit two orders (unique provider+provider_ref).
    if ((e as { code?: string; cause?: { code?: string } }).code === "23505" || (e as { cause?: { code?: string } }).cause?.code === "23505") return "duplicate_ref";
    throw e;
  }
}

/** Refund: marks a paid order refunded and debits its credits once. Balance may go negative. */
export async function refundOrder(orderId: string, provider?: ProviderId): Promise<"refunded" | "ignored"> {
  const res = await db.execute(sql`
    WITH upd AS (
      UPDATE payment_orders SET status = 'refunded'
       WHERE id = ${orderId} AND status = 'paid' AND (${provider ?? null}::text IS NULL OR provider = ${provider ?? null})
      RETURNING id, org_id, credits)
    INSERT INTO credits_ledger (org_id, delta, reason)
    SELECT org_id, -credits, 'refund:' || id FROM upd
    RETURNING id`);
  return rowsOf(res).length ? "refunded" : "ignored";
}

export async function auditPayment(action: string, orderId: string | null, detail?: string) {
  // Event type, order id and provider ref only. Never a raw webhook body or payer details.
  await db.insert(schema.auditLog).values({ action, detail: [orderId, detail].filter(Boolean).join(" ") || null });
}

export async function creditBalance(orgId: string): Promise<number> {
  const res = await db.execute(sql`SELECT COALESCE(SUM(delta), 0)::bigint AS bal FROM credits_ledger WHERE org_id = ${orgId}`);
  return Number(rowsOf(res)[0]?.bal ?? 0);
}
