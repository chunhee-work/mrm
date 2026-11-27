import { NextResponse } from "next/server";
import { desc, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { isLive, storedResetIdentifiers, tokenLooksRight } from "@/lib/reset-token";

// GET /api/reset-token?token=… — lets the reset page say "this link has expired" when it loads, not after the user typed a password.
export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token");
  const headers = { "cache-control": "no-store" }; // the address holds a token: no cache keeps a copy
  if (!tokenLooksRight(token)) return NextResponse.json({ valid: false }, { headers });
  const [row] = await db.select({ expiresAt: schema.verification.expiresAt }).from(schema.verification)
    .where(inArray(schema.verification.identifier, storedResetIdentifiers(token))).orderBy(desc(schema.verification.expiresAt)).limit(1);
  return NextResponse.json({ valid: isLive(row) }, { headers });
}
