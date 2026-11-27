import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { getUserOrNull } from "@/lib/session";
import { missingRelation } from "@/lib/ext/worker-gate";
import { credView } from "@/lib/ext/worker-store";
import { cleanPassword, masterKey, seal } from "@/lib/crypto/merimen-cred";
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
  const rawUser = typeof body?.username === "string" ? body.username.trim() : body?.username;
  const username = wantsLogin ? cleanPassword(rawUser, 80) : null; // refuses control characters instead of silently changing the name
  const password = wantsLogin ? cleanPassword(body?.password, 200) : null;
  if (wantsLogin && (!username || !password)) return NextResponse.json({ error: "invalid" }, { status: 400 });
  // each new login re-queues one check by the worker, so a loop of saves must not become a loop of Merimen log-ins:
  // at most 3 login saves (a wrong password retried must not lock the Merimen account) per organisation in 10 minutes. The audit row is written FIRST and then counted, so parallel
  // requests cannot all pass the count; refused attempts count too (a sliding limit). An error here is not allowed to pass.
  if (wantsLogin) {
    try {
      await db.insert(schema.merimenCredAudit).values({ orgId: me.orgId, userId: me.user.id, action: "save_consent" });
      const r = await db.execute(sql`SELECT count(*)::int AS n FROM merimen_cred_audit WHERE org_id = ${me.orgId} AND action = 'save_consent' AND at > now() - interval '10 minutes'`);
      const n = Number(((r as unknown as { rows?: { n: number }[] }).rows ?? [])[0]?.n ?? 99);
      if (n > 3) return NextResponse.json({ error: "too_many" }, { status: 429 });
    } catch (e) { if (missingRelation(e)) return NextResponse.json({ error: "not_configured" }, { status: 503 }); throw e; }
  }
  // from a database sequence: atomic, and still rising after a delete and a new first save (the worker compares versions)
  const nextVersion = sql<number>`nextval('merimen_profile_seq')::int`;
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
        // `blocked` is left as it is; the worker's single check (queued, attempts 0) decides
        verifyState: "queued", loginAttempts: 0,
      };
      await db.insert(schema.merimenCredentials).values({ orgId: me.orgId, ...login, ...names, profileVersion: nextVersion, updatedBy: me.user.id })
        .onConflictDoUpdate({ target: schema.merimenCredentials.orgId, set: { ...login, ...names, profileVersion: nextVersion, updatedAt: new Date(), updatedBy: me.user.id } });
    } else {
      await db.update(schema.merimenCredentials).set({ ...names, profileVersion: nextVersion, updatedAt: new Date(), updatedBy: me.user.id })
        .where(eq(schema.merimenCredentials.orgId, me.orgId));
    }
    if (!wantsLogin) await db.insert(schema.merimenCredAudit).values({ orgId: me.orgId, userId: me.user.id, action: "save_names" });
  } catch (e) { if (missingRelation(e)) return NextResponse.json({ error: "not_configured" }, { status: 503 }); throw e; }
  return NextResponse.json(await credView(me.orgId));
}

export async function DELETE() {
  const me = await getUserOrNull();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    await db.delete(schema.merimenCredentials).where(eq(schema.merimenCredentials.orgId, me.orgId));
    await db.insert(schema.merimenCredAudit).values({ orgId: me.orgId, userId: me.user.id, action: "delete" });
  } catch (e) { if (missingRelation(e)) return NextResponse.json({ error: "not_configured" }, { status: 503 }); throw e; }
  return NextResponse.json({ saved: false });
}
