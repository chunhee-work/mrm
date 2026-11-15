import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { auth } from "./auth";
import { db, schema } from "@/db";

export async function requireUser() {
  const s = await auth.api.getSession({ headers: await headers() });
  if (!s) redirect("/login");
  const [m] = await db.select().from(schema.memberships).where(eq(schema.memberships.userId, s.user.id)).limit(1);
  if (!m) redirect("/login");
  return { user: s.user, orgId: m.orgId };
}

// the two names the session cookie can have (plain on http, __Secure- on https); middleware.ts looks for the same two
const SESSION_COOKIES = ["better-auth.session_token", "__Secure-better-auth.session_token"];

export async function getUserOrNull() {
  // no session cookie: nobody is signed in, so there is nothing to ask the database (every public page calls this)
  const jar = await cookies();
  if (!SESSION_COOKIES.some((name) => jar.has(name))) return null;
  const s = await auth.api.getSession({ headers: await headers() });
  if (!s) return null;
  const [m] = await db.select().from(schema.memberships).where(and(eq(schema.memberships.userId, s.user.id))).limit(1);
  return m ? { user: s.user, orgId: m.orgId } : null;
}
