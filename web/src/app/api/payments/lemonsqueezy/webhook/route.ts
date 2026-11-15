import { NextResponse } from "next/server";
import { handleLemonSqueezyWebhook } from "@/lib/payments/providers/lemonsqueezy";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const raw = await req.text(); // raw body: the signature covers the exact bytes
  const out = await handleLemonSqueezyWebhook(raw, req.headers.get("x-signature"));
  return NextResponse.json({ ok: out.http < 300 }, { status: out.http });
}
