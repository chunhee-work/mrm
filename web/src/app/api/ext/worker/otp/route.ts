import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getUserOrNull } from "@/lib/session";
import { cleanSecret, masterKey, sealOtp } from "@/lib/crypto/merimen-cred";

// The code the user types when Merimen asks. Stored with the org data key. One code, five minutes.
export async function POST(req: Request) {
  const me = await getUserOrNull();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const key = masterKey(process.env.MERIMEN_CRED_KEY);
  if (!key) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const body = await req.json().catch(() => null);
  const code = cleanSecret(body?.code, 12);
  if (!code) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const [row] = await db.select().from(schema.merimenCredentials).where(eq(schema.merimenCredentials.orgId, me.orgId)).limit(1);
  if (!row || row.verifyState !== "otp") return NextResponse.json({ error: "not_waiting" }, { status: 409 });
  const sealed = sealOtp(key, me.orgId, row, code);
  const exp = new Date(Date.now() + 5 * 60_000);
  await db.insert(schema.merimenOtp).values({ orgId: me.orgId, state: "submitted", codeCt: sealed.codeCt, codeNonce: sealed.codeNonce, expiresAt: exp });
  await db.update(schema.merimenCredentials).set({ verifyState: "otp_submitted" }).where(and(eq(schema.merimenCredentials.orgId, me.orgId), eq(schema.merimenCredentials.verifyState, "otp")));
  await db.insert(schema.merimenCredAudit).values({ orgId: me.orgId, userId: me.user.id, action: "otp" });
  return NextResponse.json({ ok: true });
}
