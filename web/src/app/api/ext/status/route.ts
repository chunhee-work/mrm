import { NextResponse } from "next/server";
import { getUserOrNull } from "@/lib/session";
import { getExtState } from "@/lib/ext/gate";

export async function GET() {
  const me = await getUserOrNull();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ state: await getExtState(me.orgId) });
}
