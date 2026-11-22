import { NextResponse, type NextRequest } from "next/server";
import { accountRedirect } from "@/lib/hosts";
import { ADMIN_COOKIE, adminKey, verifySession } from "@/lib/admin/key";
import { GATED, loginUrl } from "@/lib/next-path";

export async function middleware(req: NextRequest) {
  // Log in, sign up and the system itself live on the app host: asked for on the bare domain, send them there
  // (the auth server refuses a sign-in posted from the bare domain, and a session there would not exist on the app host).
  const to = accountRedirect(req.headers.get("host"), req.nextUrl.pathname, req.nextUrl.search);
  if (to) return NextResponse.redirect(to, 307);
  // /admin takes a secret key: without a valid key session the visitor sees the key form (at the same address). No key set on the server: the page 404s.
  if (req.nextUrl.pathname === "/admin" || req.nextUrl.pathname.startsWith("/admin/")) {
    const key = adminKey();
    if (key && !(await verifySession(req.cookies.get(ADMIN_COOKIE)?.value, key))) {
      const url = req.nextUrl.clone();
      url.pathname = "/admin-gate";
      url.search = req.nextUrl.pathname === "/admin" ? req.nextUrl.search : "";
      return NextResponse.rewrite(url, { status: 200 });
    }
    return NextResponse.next();
  }
  // Cheap gate only (cookie present). Real checks happen server-side in requireUser().
  if (GATED.test(req.nextUrl.pathname)) {
    const has = req.cookies.get("better-auth.session_token") || req.cookies.get("__Secure-better-auth.session_token");
    if (!has) return NextResponse.redirect(new URL(loginUrl(req.nextUrl.pathname, req.nextUrl.search), req.url)); // back to this page after logging in
  }
  return NextResponse.next();
}
export const config = {
  matcher: ["/dashboard/:path*", "/cases/:path*", "/billing/:path*", "/settings/:path*", "/connection/:path*", "/admin/:path*", "/login", "/signup", "/forgot-password", "/reset-password"],
};
