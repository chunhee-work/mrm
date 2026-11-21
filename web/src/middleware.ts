import { NextResponse, type NextRequest } from "next/server";
import { accountRedirect } from "@/lib/hosts";

const GATED = /^\/(dashboard|cases|billing|settings)(\/|$)/;

export function middleware(req: NextRequest) {
  // Log in, sign up and the system itself live on the app host: asked for on the bare domain, send them there
  // (the auth server refuses a sign-in posted from the bare domain, and a session there would not exist on the app host).
  const to = accountRedirect(req.headers.get("host"), req.nextUrl.pathname, req.nextUrl.search);
  if (to) return NextResponse.redirect(to, 307);
  // Cheap gate only (cookie present). Real checks happen server-side in requireUser().
  if (GATED.test(req.nextUrl.pathname)) {
    const has = req.cookies.get("better-auth.session_token") || req.cookies.get("__Secure-better-auth.session_token");
    if (!has) return NextResponse.redirect(new URL("/login", req.url));
  }
  return NextResponse.next();
}
export const config = {
  matcher: ["/dashboard/:path*", "/cases/:path*", "/billing/:path*", "/settings/:path*", "/admin/:path*", "/login", "/signup", "/forgot-password", "/reset-password"],
};
