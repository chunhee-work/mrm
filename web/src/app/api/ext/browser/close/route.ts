import { NextResponse } from "next/server";
import { guard } from "../_guard";
import { closeBrowser } from "@/lib/ext/browser/session";

export async function POST() {
  const g = await guard(); if ("res" in g) return g.res;
  try { return NextResponse.json(await closeBrowser(g.me.orgId, g.me.user.id)); }
  catch { return NextResponse.json({ error: "browser_failed" }, { status: 502 }); }
}
