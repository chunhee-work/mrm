// Plan #40. Closes idle/expired remote browsers without anyone visiting the page. Needs a scheduler to call it with `Authorization: Bearer $CRON_SECRET`.
import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { envOn } from "@/lib/ext/gate";
import { sweepExpired } from "@/lib/ext/browser/session";

export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const got = req.headers.get("authorization") ?? "";
  const want = `Bearer ${secret ?? ""}`;
  const ok = !!secret && got.length === want.length && timingSafeEqual(Buffer.from(got), Buffer.from(want));
  if (!ok) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!envOn()) return NextResponse.json({ closed: 0 });
  return NextResponse.json({ closed: await sweepExpired() });
}
