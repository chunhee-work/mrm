import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { getOrderForOrg } from "@/lib/payments/orders";
import { creditOrder } from "@/lib/payments/credit";
import { mockEnabled } from "@/lib/payments/providers/mock";

export const dynamic = "force-dynamic";

async function pay(form: FormData) {
  "use server";
  if (!mockEnabled()) notFound();
  const { orgId } = await requireUser();
  const o = await getOrderForOrg(String(form.get("order")), orgId);
  if (!o || o.provider !== "mock") notFound();
  await creditOrder({ orderId: o.id, provider: "mock", providerRef: `mock-${o.id}`, amountMinor: o.amountMinor, currency: o.currency, testMode: true });
  redirect(`/billing?order=${o.id}`);
}

export default async function MockPay({ searchParams }: { searchParams: Promise<{ order?: string }> }) {
  if (!mockEnabled()) notFound();
  const { orgId } = await requireUser();
  const o = await getOrderForOrg((await searchParams).order ?? "", orgId);
  if (!o || o.provider !== "mock") notFound();
  return (
    <main className="wrap py-12">
      <h1 className="text-[24px] font-semibold text-ink">Mock payment (local only)</h1>
      <p className="mt-2 text-deep">{o.credits} credits · {(o.amountMinor / 100).toFixed(2)} {o.currency}</p>
      <form action={pay} className="mt-6"><input type="hidden" name="order" value={o.id} /><button className="btn-primary">Pay (no money)</button></form>
    </main>
  );
}
