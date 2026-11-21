import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { isLive, resetIdentifier, tokenLooksRight } from "@/lib/reset-token";

// GET /api/reset-token?token=… — lets the reset page say "this link has expired" when it loads, not after the user typed a password.
export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token");
  if (!tokenLooksRight(token)) return NextResponse.json({ valid: false });
  const [row] = await db.select({ expiresAt: schema.verification.expiresAt }).from(schema.verification).where(eq(schema.verification.identifier, resetIdentifier(token))).limit(1);
  return NextResponse.json({ valid: isLive(row) }, { headers: { "cache-control": "no-store" } });
}
