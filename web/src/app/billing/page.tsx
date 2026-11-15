import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/session";
import { availableProviders } from "@/lib/payments/registry";
import { creditBalance } from "@/lib/payments/credit";
import { displayStatus, listOrders } from "@/lib/payments/orders";
import { PACKS, paymentsMode } from "@/lib/payments/packs";
import Billing, { type OrderView } from "@/components/app/billing";

export const dynamic = "force-dynamic";

export default async function BillingPage({ searchParams }: { searchParams: Promise<{ order?: string }> }) {
  const { orgId } = await requireUser();
  const sp = await searchParams;
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
