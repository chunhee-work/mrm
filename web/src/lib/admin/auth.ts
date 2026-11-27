import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { ADMIN_COOKIE, adminKey, verifySession } from "./key";
import { adminSessionEnded } from "./key-node";

/**
 * Gate for every /admin page: a valid secret-key session cookie (see key.ts). The middleware already shows the key form to
 * anyone without one; this is the second check, on the server, for every page. No key configured, no cookie, a forged,
 * expired, logged-out or old-key cookie: notFound() (a plain 404, no redirect, no hint).
 */
const adminOrNull = cache(async () => {
  const key = adminKey();
  const token = (await cookies()).get(ADMIN_COOKIE)?.value;
  // a cookie that was logged out is refused here even though its signature is still good (the middleware cannot ask the database)
  return token && (await verifySession(token, key)) && !(await adminSessionEnded(token)) ? { admin: true as const } : null;
});

export const requireAdmin = cache(async () => {
  const a = await adminOrNull();
  if (!a) notFound();
  return a;
});

/** The same check without the 404, for things that must not differ between an outsider's /admin and any other missing page. */
export const isAdminRequest = async () => !!(await adminOrNull());
