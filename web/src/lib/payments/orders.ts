import { randomUUID } from "node:crypto";
import { and, desc, eq, gt, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Pack } from "./packs";
import { PaymentError, type OrderRow, type ProviderId } from "./types";
import type { Currency } from "./packs";

export const MAX_PENDING_PER_10_MIN = 3;
export const DISPLAY_EXPIRY_MS = 3600_000;

function toRow(r: typeof schema.paymentOrders.$inferSelect): OrderRow {
  return { ...r, provider: r.provider as ProviderId, currency: r.currency as Currency, status: r.status as OrderRow["status"] };
}

/** Creates a fresh pending order from a pack snapshot. Every click is a new order (no reuse). */
export async function createPendingOrder(a: { orgId: string; userId: string; provider: ProviderId; pack: Pack; currency: Currency }): Promise<OrderRow> {
  const since = new Date(Date.now() - 10 * 60_000);
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.paymentOrders)
    .where(and(eq(schema.paymentOrders.orgId, a.orgId), eq(schema.paymentOrders.provider, a.provider), eq(schema.paymentOrders.status, "pending"), gt(schema.paymentOrders.createdAt, since)));
  if (n >= MAX_PENDING_PER_10_MIN) throw new PaymentError("rate_limited", "Too many pending payments. Please wait a few minutes.");
  const [row] = await db
    .insert(schema.paymentOrders)
    .values({
      id: randomUUID(),
      orgId: a.orgId,
      userId: a.userId,
      provider: a.provider,
      packId: a.pack.id,
      packTitle: a.pack.title,
      packVersion: a.pack.version,
      credits: a.pack.credits,
      amountMinor: a.pack.price[a.currency],
      currency: a.currency,
    })
    .returning();
  return toRow(row);
}

export async function getOrder(id: string): Promise<OrderRow | null> {
  const [r] = await db.select().from(schema.paymentOrders).where(eq(schema.paymentOrders.id, id)).limit(1);
  return r ? toRow(r) : null;
}

export async function getOrderForOrg(id: string, orgId: string): Promise<OrderRow | null> {
  const [r] = await db.select().from(schema.paymentOrders).where(and(eq(schema.paymentOrders.id, id), eq(schema.paymentOrders.orgId, orgId))).limit(1);
  return r ? toRow(r) : null;
}

export async function listOrders(orgId: string, limit = 30): Promise<OrderRow[]> {
  const rows = await db.select().from(schema.paymentOrders).where(eq(schema.paymentOrders.orgId, orgId)).orderBy(desc(schema.paymentOrders.createdAt)).limit(limit);
  return rows.map(toRow);
}

export async function setCheckoutRef(id: string, checkoutRef: string) {
  await db.update(schema.paymentOrders).set({ checkoutRef }).where(eq(schema.paymentOrders.id, id));
}
export async function markFailed(id: string) {
  await db.update(schema.paymentOrders).set({ status: "failed" }).where(and(eq(schema.paymentOrders.id, id), eq(schema.paymentOrders.status, "pending")));
}

/** Display state only: a pending order older than 1 h shows as not completed (a checkout the customer walked away from); the stored status stays pending. */
export function displayStatus(o: Pick<OrderRow, "status" | "createdAt">, now = Date.now()): OrderRow["status"] | "expired" {
  return o.status === "pending" && now - o.createdAt.getTime() > DISPLAY_EXPIRY_MS ? "expired" : o.status;
}
