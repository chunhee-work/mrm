import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getUserOrNull } from "@/lib/session";
import { workerUiOn } from "@/lib/ext/worker-gate";
import { credView, getWorkerState, workerOnline } from "@/lib/ext/worker-store";

export async function GET() {
  const me = await getUserOrNull();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!workerUiOn()) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const gate = await getWorkerState(me.orgId);
  if (gate === "off") return NextResponse.json({ error: "disabled" }, { status: 403 });
  let session: { status: string; accountKey: string } | null = null;
  try {
    const [s] = await db.select({ status: schema.workerSessions.status, accountKey: schema.workerSessions.accountKey })
      .from(schema.workerSessions).where(eq(schema.workerSessions.orgId, me.orgId)).limit(1);
    session = s ?? null;
  } catch { session = null; }
  const cred = await credView(me.orgId);
  return NextResponse.json({ gate, online: await workerOnline(), session, cred });
}
