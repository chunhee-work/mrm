import { OPEN_STATUSES } from "@/lib/ext/workshop-rules";
import { NextResponse } from "next/server";
import { and, eq, inArray, sql } from "drizzle-orm";
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
    // workshops: the saved list replaces the old one. A workshop that open cases still use cannot be removed or renamed (409): move those
    // cases first. Cases the worker already made in Merimen (locked) do not count: their workshop is settled and they cannot be moved.
    const keep = profile.workshops.map((w) => w.slot);
    const have = await db.select({ slot: schema.merimenWorkshops.slot, name: schema.merimenWorkshops.name }).from(schema.merimenWorkshops).where(eq(schema.merimenWorkshops.orgId, me.orgId));
    const gone = [1, 2, 3].filter((n) => !keep.includes(n));
    const changed = [...gone, ...profile.workshops.filter((w) => have.some((h) => h.slot === w.slot && h.name !== w.name)).map((w) => w.slot)];
    const open = sql`c.merimen_caseid IS NULL AND c.status IN (${sql.join(OPEN_STATUSES.map((x) => sql`${x}`), sql`, `)})`;
    const inUse = async (slots: number[]) => {
      // a case with no row is workshop 1; locked cases (the worker already used their workshop) do not count
      const r = await db.execute(sql`SELECT 1 FROM cases c LEFT JOIN merimen_case_workshop cw ON cw.case_id = c.id
        WHERE c.org_id = ${me.orgId} AND cw.locked_at IS NULL AND ${open} AND COALESCE(cw.slot, 1) IN (${sql.join(slots.map((n) => sql`${n}`), sql`, `)}) LIMIT 1`);
      return ((r as unknown as { rows?: unknown[] }).rows ?? []).length > 0;
    };
    // renaming only matters when there is a choice: with one workshop an open case simply takes the corrected name
    const mustCheck = [...gone, ...(have.length >= 2 ? changed.filter((n) => !gone.includes(n)) : [])];
    if (mustCheck.length && (await inUse(mustCheck))) return NextResponse.json({ error: "workshop_in_use" }, { status: 409 });
    if (gone.length) {
      // the delete itself refuses a workshop an open case picked a moment ago; it runs before anything is saved
      await db.execute(sql`DELETE FROM merimen_workshops w WHERE w.org_id = ${me.orgId} AND w.slot IN (${sql.join(gone.map((n) => sql`${n}`), sql`, `)})
        AND NOT EXISTS (SELECT 1 FROM merimen_case_workshop cw JOIN cases c ON c.id = cw.case_id
          WHERE c.org_id = w.org_id AND cw.slot = w.slot AND cw.locked_at IS NULL AND ${open})`);
      const left = await db.select({ slot: schema.merimenWorkshops.slot }).from(schema.merimenWorkshops).where(and(eq(schema.merimenWorkshops.orgId, me.orgId), inArray(schema.merimenWorkshops.slot, gone)));
      if (left.length) return NextResponse.json({ error: "workshop_in_use" }, { status: 409 });
    }
    for (const w of profile.workshops) {
      await db.insert(schema.merimenWorkshops).values({ orgId: me.orgId, slot: w.slot, name: w.name })
        .onConflictDoUpdate({ target: [schema.merimenWorkshops.orgId, schema.merimenWorkshops.slot], set: { name: w.name, updatedAt: new Date() } });
    }
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
