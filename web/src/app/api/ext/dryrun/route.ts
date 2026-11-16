// Plan #40, dry-run mode. Reads one case of the caller's own company and says what would be entered in Merimen. Writes nothing, does not use the browser.
import { NextResponse } from "next/server";
import { and, count, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { guard } from "../browser/_guard";
import { planCase } from "@/lib/ext/dryrun";

export async function POST(req: Request) {
  const g = await guard(); if ("res" in g) return g.res;
  const body = await req.json().catch(() => null) as { caseId?: unknown } | null;
  const caseId = typeof body?.caseId === "string" ? body.caseId : "";
  if (!caseId) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  // only once the customer is actually logged in to Merimen in our window
  const conn = (await db.select().from(schema.merimenConnections).where(eq(schema.merimenConnections.orgId, g.me.orgId)).limit(1))[0];
  if (!conn?.browserbaseSessionId || conn.status !== "connected") return NextResponse.json({ error: "not_connected" }, { status: 409 });
  const c = (await db.select().from(schema.cases).where(and(eq(schema.cases.id, caseId), eq(schema.cases.orgId, g.me.orgId))).limit(1))[0];
  if (!c) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const [f] = await db.select({ n: count() }).from(schema.caseFiles).where(eq(schema.caseFiles.caseId, c.id));
  const [p] = await db.select({ n: count() }).from(schema.casePhotos).where(eq(schema.casePhotos.caseId, c.id));
  return NextResponse.json(planCase({ caseData: c.caseData, files: Number(f?.n ?? 0), photos: Number(p?.n ?? 0), photosDone: !!c.photosDoneAt }));
}
