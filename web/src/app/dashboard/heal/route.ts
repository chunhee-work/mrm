import { NextResponse, after } from "next/server";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { getUserOrNull } from "@/lib/session";
import { notDeleted } from "@/lib/case-delete";
import { stuckReads } from "../stuck-reads";

export const maxDuration = 300; // the reads it starts run after the answer is sent

// POST /dashboard/heal: start the reads of cases that still wait (a zip of many cars makes many cases, read a few at a time).
// The first page does this each time it is read; this is the same step alone, for when that page is not refreshing itself
// (a hidden tab, the upload box open), so the reading of the remaining cars never waits for the user to look at the page.
// `waiting`: how many cases are still to be read or being read (0: nothing left to ask for).
export async function POST() {
  const me = await getUserOrNull();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const rows = await db.select({ id: schema.cases.id, status: schema.cases.status, error: schema.cases.error, createdAt: schema.cases.createdAt }).from(schema.cases)
    .where(and(eq(schema.cases.orgId, me.orgId), notDeleted, inArray(schema.cases.status, ["uploaded", "reading"]))).orderBy(asc(schema.cases.createdAt)).limit(200);
  const heal = await stuckReads(me.orgId, rows);
  if (heal.length) after(async () => { await Promise.all(heal.map((run) => run().catch(() => {}))); });
  return NextResponse.json({ waiting: rows.length }, { headers: { "cache-control": "no-store" } });
}
