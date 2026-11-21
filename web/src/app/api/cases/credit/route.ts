import { NextResponse } from "next/server";
import { getUserOrNull } from "@/lib/session";
import { hasCredit } from "@/lib/payments/case-credit";

// GET /api/cases/credit — asked before an upload starts: 200 if a new case can be paid for, 402 if not (so no file goes up first).
export async function GET() {
  const me = await getUserOrNull();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return (await hasCredit(me.orgId)) ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "no_credits" }, { status: 402 });
}
