import { NextResponse } from "next/server";
import { getUserOrNull } from "@/lib/session";
import { healWaiting } from "@/app/dashboard/stuck-reads";

export const maxDuration = 300; // the reads it starts run after the answer is sent

// POST /api/cases/heal: start the reads of cases that still wait (a zip of many cars makes many cases, read a few at a time).
// The first page does this each time it is read; this is the same step alone, for when that page is not refreshing itself
// (a hidden tab, the upload box open), so the reading of the remaining cars never waits for the user to look at the page.
// `waiting`: how many cases are still to be read or being read (0: nothing left to ask for). Signed out: 401, and the page stops asking.
export async function POST() {
  const me = await getUserOrNull();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ waiting: await healWaiting(me.orgId) }, { headers: { "cache-control": "no-store" } });
}
