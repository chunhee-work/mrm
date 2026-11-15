import { NextResponse } from "next/server";
import { recheckToyyibPayOrder } from "@/lib/payments/providers/toyyibpay";

export const dynamic = "force-dynamic";

// The callback body/hash is never trusted: it only tells us which order to re-check with toyyibPay directly.
export async function POST(req: Request) {
  let orderId = "";
  try {
    const form = await req.formData();
    orderId = String(form.get("order_id") ?? form.get("billExternalReferenceNo") ?? "").slice(0, 64);
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  if (!/^[0-9a-f-]{36}$/i.test(orderId)) return NextResponse.json({ ok: false }, { status: 400 });
  const out = await recheckToyyibPayOrder(orderId);
  return NextResponse.json({ ok: out.http < 300 }, { status: out.http });
}
