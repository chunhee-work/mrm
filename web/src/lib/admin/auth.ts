import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { isAdmin } from "./config";

/**
 * Gate for every /admin page. Signed out, signed in but not an admin, unverified email, session older than 12 h,
 * ADMIN_EMAILS missing or malformed: all get the same notFound() (a plain 404, no redirect, no hint).
 */
export const requireAdmin = cache(async () => {
  let s: Awaited<ReturnType<typeof auth.api.getSession>> = null;
  try { s = await auth.api.getSession({ headers: await headers() }); } catch { s = null; }
  if (!s || !isAdmin({ email: s.user.email, emailVerified: s.user.emailVerified, sessionCreatedAt: s.session.createdAt })) notFound();
  return { email: s.user.email };
});
