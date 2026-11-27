import { NextResponse } from "next/server";
import { getUserOrNull } from "@/lib/session";
import { CASE_COST, enforcing, exempt, hasCredit } from "@/lib/payments/case-credit";
import { creditBalance } from "@/lib/payments/credit";

// GET /api/cases/credit — asked before an upload starts: 200 if a new case can be paid for, 402 if not (so no file goes up first).
// ?n=<cases> asks for several at once (a zip of several cars).
export async function GET(req: Request) {
  const me = await getUserOrNull();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const n = Math.min(30, Math.max(1, Number(new URL(req.url).searchParams.get("n")) || 1));
  if (n > 1 && enforcing() && !exempt(me.orgId)) return (await creditBalance(me.orgId)) >= CASE_COST * n ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "no_credits", needed: n }, { status: 402 });
  return (await hasCredit(me.orgId)) ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "no_credits" }, { status: 402 });
}
