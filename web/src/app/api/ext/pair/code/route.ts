import { NextResponse } from "next/server";
import { and, eq, isNull, lt, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { getUserOrNull } from "@/lib/session";
import { getExtState } from "@/lib/ext/gate";
import { CODE_TTL_MS, MAX_CODES_PER_HOUR, hashCode, hourBucket, isUniqueViolation, newCode } from "@/lib/ext/pairing";

// Issues a one-time pairing code to the signed-in user (10 minutes, single use, stored hashed). Only when the feature is fully on for the org.
// Race-proof without a transaction (the production driver has none): each code takes the next slot (1..5) of the user's clock-hour window and
// the database refuses a second code with the same slot, so concurrent requests cannot exceed the limit. Older codes are retired only after the
// new one is stored, and only those with a lower id, so a request that lost the race never kills the winner's code.
export async function POST() {
  const me = await getUserOrNull();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if ((await getExtState(me.orgId)) !== "ready") return NextResponse.json({ error: "disabled" }, { status: 403 });
  const bucket = hourBucket();
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.extPairingCodes)
    .where(and(eq(schema.extPairingCodes.userId, me.user.id), eq(schema.extPairingCodes.hourBucket, bucket)));
  if (n >= MAX_CODES_PER_HOUR) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  const code = newCode();
  const expiresAt = new Date(Date.now() + CODE_TTL_MS);
  let id: number;
  try {
    const [row] = await db.insert(schema.extPairingCodes)
      .values({ orgId: me.orgId, userId: me.user.id, codeHash: hashCode(code), expiresAt, hourBucket: bucket, slot: n + 1 })
      .returning({ id: schema.extPairingCodes.id });
    id = row.id;
  } catch (e) {
    if (isUniqueViolation(e)) return NextResponse.json({ error: "rate_limited" }, { status: 429 }); // another request took this slot
    throw e;
  }
  await db.update(schema.extPairingCodes).set({ usedAt: new Date() })
    .where(and(eq(schema.extPairingCodes.userId, me.user.id), isNull(schema.extPairingCodes.usedAt), lt(schema.extPairingCodes.id, id)));
  await db.insert(schema.auditLog).values({ orgId: me.orgId, userId: me.user.id, action: "ext.pair.code", detail: null });
  return NextResponse.json({ code, expiresAt: expiresAt.toISOString() });
}
