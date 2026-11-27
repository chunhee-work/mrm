import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_COOKIE, ADMIN_COOKIE_SECURE, ADMIN_SESSION_MAX_AGE_MS, adminKey, signSession } from "@/lib/admin/key";
import { clientAddress, countKeyTry, keyMatches, keyTryWasRight } from "@/lib/admin/key-node";

export const dynamic = "force-dynamic";

const to = (req: NextRequest, path: string) => NextResponse.redirect(new URL(path, req.url), 303);

/** A plain form POST (no script needed). Wrong key: back to /admin with ?e=1. Right key: a signed cookie and on to /admin. */
export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (origin) { try { if (new URL(origin).host !== req.headers.get("host")) return new NextResponse(null, { status: 403 }); } catch { return new NextResponse(null, { status: 403 }); } }
  const key = adminKey();
  if (!key) return new NextResponse(null, { status: 404 });

  const who = clientAddress(req.headers);
  if (!(await countKeyTry(who))) return to(req, "/admin?e=2"); // locked: the key is not even looked at

  const typed = String((await req.formData().catch(() => null))?.get("key") ?? "");
  if (!typed || !keyMatches(typed, key)) {
    await new Promise((r) => setTimeout(r, 400)); // slows a guesser; the real defence is the 24+ character key
    return to(req, "/admin?e=1");
  }
  await keyTryWasRight(who);
  const res = to(req, "/admin");
  res.cookies.set(ADMIN_COOKIE, await signSession(key), {
    httpOnly: true, secure: ADMIN_COOKIE_SECURE, sameSite: "strict", path: "/", maxAge: ADMIN_SESSION_MAX_AGE_MS / 1000,
  });
  return res;
}
