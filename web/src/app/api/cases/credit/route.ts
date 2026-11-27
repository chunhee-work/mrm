import { NextResponse } from "next/server";
import { getUserOrNull } from "@/lib/session";
import { profileBlocks } from "@/lib/ext/worker-store";
import { CASE_COST, enforcing, exempt, hasCredit } from "@/lib/payments/case-credit";
import { creditBalance } from "@/lib/payments/credit";
import { earlierCars } from "@/lib/split-marks";

// GET /api/cases/credit — asked before an upload starts: 200 if a new case can be paid for, 402 if not (so no file goes up first).
// ?n=<cases> asks for several at once (a zip of several cars); with &zip=<name>&size=<bytes> the cars an earlier split of that
// zip already made are not counted again (they are not charged again).
export async function GET(req: Request) {
  const me = await getUserOrNull();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (await profileBlocks(me.orgId)) return NextResponse.json({ error: "profile_incomplete" }, { status: 403 }); // before a single byte goes up
  const sp = new URL(req.url).searchParams;
  let n = Math.min(30, Math.max(1, Number(sp.get("n")) || 1));
  const zip = sp.get("zip")?.trim(); const size = Number(sp.get("size")); // trimmed like the split endpoint's name
  if (n > 1 && zip && size > 0) n -= (await earlierCars(me.orgId, zip.slice(0, 300), size)).size;
  if (n <= 0) return NextResponse.json({ ok: true });
  if (n > 1 && enforcing() && !exempt(me.orgId)) return (await creditBalance(me.orgId)) >= CASE_COST * n ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "no_credits", needed: n }, { status: 402 });
  return (await hasCredit(me.orgId)) ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "no_credits" }, { status: 402 });
}
