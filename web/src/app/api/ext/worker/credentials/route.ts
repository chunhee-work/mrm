import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getUserOrNull } from "@/lib/session";
import { missingRelation, workerUiOn } from "@/lib/ext/worker-gate";
import { credView, getWorkerState } from "@/lib/ext/worker-store";
import { cleanSecret, masterKey, seal } from "@/lib/crypto/merimen-cred";

// Saves a Merimen login only after the PR #39 gate is ready. The worker tries it once.
export async function GET() {
  const me = await getUserOrNull();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!workerUiOn()) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if ((await getWorkerState(me.orgId)) === "off") return NextResponse.json({ error: "disabled" }, { status: 403 });
  return NextResponse.json(await credView(me.orgId));
}

export async function POST(req: Request) {
  const me = await getUserOrNull();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!workerUiOn()) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if ((await getWorkerState(me.orgId)) !== "ready") return NextResponse.json({ error: "disabled" }, { status: 403 });
  const key = masterKey(process.env.MERIMEN_CRED_KEY);
  if (!key) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const body = await req.json().catch(() => null);
  const username = cleanSecret(body?.username, 80);
  const password = cleanSecret(body?.password, 200);
  if (!username || !password) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const sealed = seal(key, me.orgId, username, password);
  // blocked stays as it is until the worker's single check succeeds, so a job cannot log in during the check
  try { await db.insert(schema.merimenCredentials).values({
    orgId: me.orgId,
    usernameHint: sealed.usernameHint,
    wrappedDek: sealed.wrappedDek,
    dekNonce: sealed.dekNonce,
    usernameCt: sealed.usernameCt,
    usernameNonce: sealed.usernameNonce,
    passwordCt: sealed.passwordCt,
    passwordNonce: sealed.passwordNonce,
    verifyState: "queued",
    loginAttempts: 0,
    updatedBy: me.user.id,
  }).onConflictDoUpdate({
    target: schema.merimenCredentials.orgId,
    set: {
      usernameHint: sealed.usernameHint,
      wrappedDek: sealed.wrappedDek,
      dekNonce: sealed.dekNonce,
      usernameCt: sealed.usernameCt,
      usernameNonce: sealed.usernameNonce,
      passwordCt: sealed.passwordCt,
      passwordNonce: sealed.passwordNonce,
      verifyState: "queued",
      loginAttempts: 0,
      updatedAt: new Date(),
      updatedBy: me.user.id,
    },
  });
  await db.insert(schema.merimenCredAudit).values({ orgId: me.orgId, userId: me.user.id, action: "save" });
  } catch (e) { if (missingRelation(e)) return NextResponse.json({ error: "not_configured" }, { status: 503 }); throw e; }
  return NextResponse.json({ saved: true, usernameHint: sealed.usernameHint, verifyState: "queued" });
}

export async function DELETE() {
  const me = await getUserOrNull();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!workerUiOn()) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if ((await getWorkerState(me.orgId)) !== "ready") return NextResponse.json({ error: "disabled" }, { status: 403 });
  await db.delete(schema.merimenCredentials).where(eq(schema.merimenCredentials.orgId, me.orgId));
  await db.insert(schema.merimenCredAudit).values({ orgId: me.orgId, userId: me.user.id, action: "delete" });
  return NextResponse.json({ saved: false });
}
