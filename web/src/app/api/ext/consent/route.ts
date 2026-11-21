import { NextResponse } from "next/server";
import { z } from "zod";
import { db, schema } from "@/db";
import { getUserOrNull } from "@/lib/session";
import { getExtState } from "@/lib/ext/gate";
import { workerUiOn } from "@/lib/ext/worker-gate";
import { getWorkerState } from "@/lib/ext/worker-store";
import { CONSENT_WORDING_VERSION, cleanFirmLabel } from "@/lib/ext/pairing";

const Body = z.object({ confirm: z.literal(true), firmLabel: z.string().max(200).optional() });

// The customer says they have Merimen's permission for the account they will use. Stored server-side: user, org, time, wording version.
export async function POST(req: Request) {
  const me = await getUserOrNull();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const state = workerUiOn() ? await getWorkerState(me.orgId) : await getExtState(me.orgId);
  if (state === "off") return NextResponse.json({ error: "disabled" }, { status: 403 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  if (state === "ready") return NextResponse.json({ state }); // already acknowledged
  await db.insert(schema.extConsents).values({
    orgId: me.orgId, userId: me.user.id, wordingVersion: CONSENT_WORDING_VERSION, firmLabel: cleanFirmLabel(parsed.data.firmLabel),
  });
  await db.insert(schema.auditLog).values({ orgId: me.orgId, userId: me.user.id, action: "ext.consent", detail: `v${CONSENT_WORDING_VERSION}` });
  return NextResponse.json({ state: "ready" });
}
