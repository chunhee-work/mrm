import { NextResponse, type NextRequest } from "next/server";

// Cheap gate only (cookie present). Real checks happen server-side in requireUser().
export function middleware(req: NextRequest) {
  const has = req.cookies.get("better-auth.session_token") || req.cookies.get("__Secure-better-auth.session_token");
  if (!has) return NextResponse.redirect(new URL("/login", req.url));
  return NextResponse.next();
}
export const config = { matcher: ["/dashboard/:path*", "/cases/:path*"] };
