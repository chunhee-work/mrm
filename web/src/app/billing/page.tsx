import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/session";
import { availableProviders } from "@/lib/payments/registry";
import { creditBalance } from "@/lib/payments/credit";
import { displayStatus, listOrders } from "@/lib/payments/orders";
import { PACKS, paymentsMode } from "@/lib/payments/packs";
import { recheckToyyibPayOrder } from "@/lib/payments/providers/toyyibpay";
import Billing, { type OrderView } from "@/components/app/billing";

export const dynamic = "force-dynamic";
const lastAsked = new Map<string, number>();

export default async function BillingPage({ searchParams }: { searchParams: Promise<{ order?: string }> }) {
  const { orgId } = await requireUser();
  const sp = await searchParams;
  // Back from toyyibPay: its one callback may have been missed (deploy, lookup timeout) and it does not call again,
  // so ask toyyibPay about this order here too. Only the caller's own pending order; crediting is still exactly-once.
  if (sp.order) {
    const [mine] = await db.select({ provider: schema.paymentOrders.provider, status: schema.paymentOrders.status }).from(schema.paymentOrders)
      .where(and(eq(schema.paymentOrders.id, sp.order), eq(schema.paymentOrders.orgId, orgId))).limit(1);
    // the page refreshes itself every few seconds while it waits: ask toyyibPay at most every 20 s per order
    const last = lastAsked.get(sp.order) ?? 0;
    if (mine?.provider === "toyyibpay" && mine.status === "pending" && Date.now() - last > 20_000) {
      lastAsked.set(sp.order, Date.now());
      if (lastAsked.size > 500) lastAsked.clear();
      await recheckToyyibPayOrder(sp.order).catch(() => null);
    }
  }
  const [org] = await db.select().from(schema.organizations).where(eq(schema.organizations.id, orgId)).limit(1);
  const [balance, providers, orders] = await Promise.all([creditBalance(orgId), availableProviders(), listOrders(orgId, 30)]);
  const now = Date.now();
  const rows: OrderView[] = orders.map((o) => ({
    id: o.id,
    createdAt: o.createdAt.toISOString(),
    packCredits: o.credits,
    amountMinor: o.amountMinor,
    currency: o.currency,
    status: displayStatus(o, now),
    testMode: o.testMode,
  }));
  const packs = PACKS.map((p) => ({ id: p.id, credits: p.credits, price: p.price }));
  const watching = sp.order ? orders.find((o) => o.id === sp.order) : undefined;
  return (
    <Billing
      balance={balance}
      orgName={org?.name ?? ""}
      testMode={paymentsMode() !== "live"}
      providers={providers}
      packs={packs}
      orders={rows}
      watching={watching ? { id: watching.id, status: displayStatus(watching, now) } : null}
    />
  );
}
