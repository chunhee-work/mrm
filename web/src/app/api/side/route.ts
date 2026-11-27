import { NextResponse } from "next/server";
import { getUserOrNull } from "@/lib/session";
import { sideFacts } from "@/lib/side-facts";

// The side bar reads its numbers again after a move inside the app: a layout is not drawn again between pages of one section.
export async function GET() {
  const me = await getUserOrNull();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json(await sideFacts(me.orgId), { headers: { "cache-control": "no-store" } });
}
