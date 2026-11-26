// Plan #40. Closes idle/expired remote browsers without anyone visiting the page. Needs a scheduler to call it with `Authorization: Bearer $CRON_SECRET`.
import { NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { envOn } from "@/lib/ext/gate";
import { sweepExpired } from "@/lib/ext/browser/session";

export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const got = req.headers.get("authorization") ?? "";
  const want = `Bearer ${secret ?? ""}`;
  // compare fixed-size digests: equal lengths in characters can still differ in bytes, and timingSafeEqual throws on that
  const dig = (v: string) => createHash("sha256").update(v).digest();
  const ok = !!secret && timingSafeEqual(dig(got), dig(want));
  if (!ok) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!envOn()) return NextResponse.json({ closed: 0 });
  return NextResponse.json({ closed: await sweepExpired() });
}
