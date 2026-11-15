import { NextResponse } from "next/server";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { getUserOrNull } from "@/lib/session";
import { getExtState } from "@/lib/ext/gate";
import { CODE_TTL_MS, MAX_CODES_PER_HOUR, hashCode, newCode } from "@/lib/ext/pairing";

// Issues a one-time pairing code to the signed-in user (10 minutes, single use, stored hashed). Only when the feature is fully on for the org.
export async function POST() {
  const me = await getUserOrNull();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if ((await getExtState(me.orgId)) !== "ready") return NextResponse.json({ error: "disabled" }, { status: 403 });
  const hourAgo = new Date(Date.now() - 3600_000);
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.extPairingCodes)
    .where(and(eq(schema.extPairingCodes.userId, me.user.id), gt(schema.extPairingCodes.createdAt, hourAgo)));
  if (n >= MAX_CODES_PER_HOUR) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  // an older unused code of this user stops working
  await db.update(schema.extPairingCodes).set({ usedAt: new Date() })
    .where(and(eq(schema.extPairingCodes.userId, me.user.id), isNull(schema.extPairingCodes.usedAt)));
  const code = newCode();
  const expiresAt = new Date(Date.now() + CODE_TTL_MS);
  await db.insert(schema.extPairingCodes).values({ orgId: me.orgId, userId: me.user.id, codeHash: hashCode(code), expiresAt });
  await db.insert(schema.auditLog).values({ orgId: me.orgId, userId: me.user.id, action: "ext.pair.code", detail: null });
  return NextResponse.json({ code, expiresAt: expiresAt.toISOString() });
}
