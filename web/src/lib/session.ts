import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { auth } from "./auth";
import { db, schema } from "@/db";

// Hard test 2026-11-22: one page asked for the session up to three times (layout, page title, page), each a trip to the database.
// Now once per request: React's cache() keeps the answer for the rest of that one request only.
const signedIn = cache(async () => {
  const s = await auth.api.getSession({ headers: await headers() });
  if (!s) return null;
  const [m] = await db.select().from(schema.memberships).where(eq(schema.memberships.userId, s.user.id)).limit(1);
  return { user: s.user, orgId: m?.orgId ?? null };
});

export async function requireUser() {
  const me = await signedIn();
  if (!me?.orgId) {
    // set by middleware.ts on gated pages: the log-in address that comes back here (only ever a same-site "/login?next=…")
    const back = (await headers()).get("x-page");
    redirect(back && back.startsWith("/login") ? back : "/login");
  }
  return { user: me.user, orgId: me.orgId };
}

// the two names the session cookie can have (plain on http, __Secure- on https); middleware.ts looks for the same two
const SESSION_COOKIES = ["better-auth.session_token", "__Secure-better-auth.session_token"];

export async function getUserOrNull() {
  // no session cookie: nobody is signed in, so there is nothing to ask the database (every public page calls this)
  const jar = await cookies();
  if (!SESSION_COOKIES.some((name) => jar.has(name))) return null;
  const me = await signedIn();
  return me?.orgId ? { user: me.user, orgId: me.orgId } : null;
}
