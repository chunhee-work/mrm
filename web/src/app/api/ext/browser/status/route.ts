import { NextResponse } from "next/server";
import { guard } from "../_guard";
import { currentView } from "@/lib/ext/browser/session";

export const maxDuration = 30;
export async function GET() {
  const g = await guard(); if ("res" in g) return g.res;
  try { return NextResponse.json(await currentView(g.me.orgId, g.me.user.id)); }
  catch { return NextResponse.json({ error: "browser_failed" }, { status: 502 }); }
}
