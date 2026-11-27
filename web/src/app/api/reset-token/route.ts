import { NextResponse } from "next/server";
import { desc, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { isLive, storedResetIdentifiers, tokenLooksRight } from "@/lib/reset-token";

const headers = { "cache-control": "no-store" };

async function answer(token: unknown) {
  if (typeof token !== "string" || !tokenLooksRight(token)) return NextResponse.json({ valid: false }, { headers });
  const [row] = await db.select({ expiresAt: schema.verification.expiresAt }).from(schema.verification)
    .where(inArray(schema.verification.identifier, storedResetIdentifiers(token))).orderBy(desc(schema.verification.expiresAt)).limit(1);
  return NextResponse.json({ valid: isLive(row) }, { headers });
}

// POST /api/reset-token { token } — lets the reset page say "this link has expired" when it loads, not after the user typed a
// password. The token goes in the body, so this request's address (which is kept in request logs) does not hold it.
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { token?: unknown } | null;
  return answer(body?.token);
}

// GET ?token=… — the same answer for a reset page that was opened before this change and is still on screen.
export async function GET(req: Request) {
  return answer(new URL(req.url).searchParams.get("token"));
}
