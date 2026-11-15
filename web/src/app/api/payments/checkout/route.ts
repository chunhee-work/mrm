import { NextResponse } from "next/server";
import { z } from "zod";
import { getUserOrNull } from "@/lib/session";
import { canSell } from "@/lib/payments/registry";
import { createPendingOrder, markFailed, setCheckoutRef } from "@/lib/payments/orders";
import { auditPayment } from "@/lib/payments/credit";
import { PaymentError, type ProviderId } from "@/lib/payments/types";
import { paymentsMode } from "@/lib/payments/packs";

const Body = z.object({ provider: z.enum(["lemonsqueezy", "toyyibpay", "mock"]), packId: z.string().max(40) });

function appUrl(req: Request) {
  return (process.env.BETTER_AUTH_URL || new URL(req.url).origin).replace(/\/$/, "");
}

export async function POST(req: Request) {
  const me = await getUserOrNull();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const provider = parsed.data.provider as ProviderId;
  const sell = await canSell(provider, parsed.data.packId);
  if (!sell) return NextResponse.json({ error: "unavailable" }, { status: 409 });

  let orderId: string | null = null;
  try {
    const order = await createPendingOrder({ orgId: me.orgId, userId: me.user.id, provider, pack: sell.pack, currency: sell.provider.currency });
    orderId = order.id;
    const base = appUrl(req);
    const out = await sell.provider.createCheckout({
      order: { ...order, testMode: paymentsMode() !== "live" },
      email: me.user.email,
      returnUrl: `${base}/billing?order=${order.id}`,
      callbackUrl: `${base}/api/payments/${provider}/callback`,
    });
    await setCheckoutRef(order.id, out.checkoutRef);
    await auditPayment("payment.checkout", order.id);
    return NextResponse.json({ url: out.url, orderId: order.id });
  } catch (e) {
    if (orderId) await markFailed(orderId);
    if (e instanceof PaymentError) {
      const status = e.code === "rate_limited" ? 429 : e.code === "bad_request" ? 400 : 502;
      return NextResponse.json({ error: e.code }, { status });
    }
    return NextResponse.json({ error: "provider_error" }, { status: 502 });
  }
}
