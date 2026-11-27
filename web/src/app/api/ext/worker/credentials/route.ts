import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { getUserOrNull } from "@/lib/session";
import { missingRelation } from "@/lib/ext/worker-gate";
import { credView } from "@/lib/ext/worker-store";
import { cleanSecret, masterKey, seal } from "@/lib/crypto/merimen-cred";
import { cleanProfile } from "@/lib/ext/profile";

// The user types their own Merimen login here; it is sealed (AES-GCM) and the worker tries it once.
// Always reachable for a signed-in user (owner 2026-11-27: the form must be there). The old org gate is replaced by the
// user's own tick box, which the server requires on every save and records in the audit table.
export async function GET() {
  const me = await getUserOrNull();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json(await credView(me.orgId));
}

export async function POST(req: Request) {
  const me = await getUserOrNull();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const key = masterKey(process.env.MERIMEN_CRED_KEY);
  if (!key) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const body = await req.json().catch(() => null);
  if (body?.consent !== true) return NextResponse.json({ error: "consent_required" }, { status: 400 });
  const profile = cleanProfile(body);
  if (!profile) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const wantsLogin = !!(body?.username || body?.password);
  const username = wantsLogin ? cleanSecret(body?.username, 80) : null;
  const password = wantsLogin ? cleanSecret(body?.password, 200) : null;
  if (wantsLogin && (!username || !password)) return NextResponse.json({ error: "invalid" }, { status: 400 });
  try {
    const [row] = await db.select({ id: schema.merimenCredentials.orgId }).from(schema.merimenCredentials).where(eq(schema.merimenCredentials.orgId, me.orgId)).limit(1);
    // first time: the login is needed. Later: the three names alone may be changed, the stored login stays as it is.
    if (!row && !wantsLogin) return NextResponse.json({ error: "invalid" }, { status: 400 });
    const names = { workshopName: profile.workshop, managerName: profile.manager, adjusterName: profile.adjuster };
    if (!row || (wantsLogin && username && password)) {
      const sealed = seal(key, me.orgId, username!, password!);
      const login = {
        usernameHint: sealed.usernameHint, wrappedDek: sealed.wrappedDek, dekNonce: sealed.dekNonce,
        usernameCt: sealed.usernameCt, usernameNonce: sealed.usernameNonce, passwordCt: sealed.passwordCt, passwordNonce: sealed.passwordNonce,
        // blocked stays as it is until the worker's single check succeeds, so a job cannot log in during the check
        verifyState: "queued", loginAttempts: 0,
      };
      await db.insert(schema.merimenCredentials).values({ orgId: me.orgId, ...login, ...names, profileVersion: 1, updatedBy: me.user.id })
        .onConflictDoUpdate({ target: schema.merimenCredentials.orgId, set: { ...login, ...names, profileVersion: sql`${schema.merimenCredentials.profileVersion} + 1`, updatedAt: new Date(), updatedBy: me.user.id } });
    } else {
      await db.update(schema.merimenCredentials).set({ ...names, profileVersion: sql`${schema.merimenCredentials.profileVersion} + 1`, updatedAt: new Date(), updatedBy: me.user.id })
        .where(eq(schema.merimenCredentials.orgId, me.orgId));
    }
    await db.insert(schema.merimenCredAudit).values({ orgId: me.orgId, userId: me.user.id, action: wantsLogin ? "save_consent" : "save_names" });
  } catch (e) { if (missingRelation(e)) return NextResponse.json({ error: "not_configured" }, { status: 503 }); throw e; }
  return NextResponse.json(await credView(me.orgId));
}

export async function DELETE() {
  const me = await getUserOrNull();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  await db.delete(schema.merimenCredentials).where(eq(schema.merimenCredentials.orgId, me.orgId));
  await db.insert(schema.merimenCredAudit).values({ orgId: me.orgId, userId: me.user.id, action: "delete" });
  return NextResponse.json({ saved: false });
}
