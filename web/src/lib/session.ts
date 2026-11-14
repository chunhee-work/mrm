import { headers } from "next/headers";
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

export async function getUserOrNull() {
  const s = await auth.api.getSession({ headers: await headers() });
  if (!s) return null;
  const [m] = await db.select().from(schema.memberships).where(and(eq(schema.memberships.userId, s.user.id))).limit(1);
  return m ? { user: s.user, orgId: m.orgId } : null;
}
