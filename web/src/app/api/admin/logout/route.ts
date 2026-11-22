import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_COOKIE, ADMIN_COOKIE_SECURE } from "@/lib/admin/key";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (origin) { try { if (new URL(origin).host !== req.headers.get("host")) return new NextResponse(null, { status: 403 }); } catch { return new NextResponse(null, { status: 403 }); } }
  const res = NextResponse.redirect(new URL("/admin", req.url), 303);
  res.cookies.set(ADMIN_COOKIE, "", { httpOnly: true, secure: ADMIN_COOKIE_SECURE, sameSite: "strict", path: "/", maxAge: 0 });
  return res;
}
