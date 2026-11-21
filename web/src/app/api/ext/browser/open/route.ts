import { NextResponse } from "next/server";
import { guard } from "../_guard";
import { openBrowser } from "@/lib/ext/browser/session";

export const maxDuration = 60;
export async function POST() {
  const g = await guard(); if ("res" in g) return g.res;
  try { return NextResponse.json(await openBrowser(g.me.orgId, g.me.user.id)); }
  catch { return NextResponse.json({ error: "browser_failed" }, { status: 502 }); } // no detail: errors from the service can hold secrets
}
