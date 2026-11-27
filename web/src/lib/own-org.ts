import { db, schema } from "@/db";

/**
 * Every account owns one organization. Its id is worked out from the user id (always the same for the same user), so making it
 * a second time lands on the same row: sign-up that failed half way, or two pages asking at once, can never make two.
 * Shaped like the random ids older organizations have.
 */
export async function ownOrgId(userId: string): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`own-org:${userId}`)));
  const h = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

/**
 * Makes the user's own organization and their owner membership when they are missing; returns the organization id.
 * Safe to call again and from two requests at the same moment: both rows are "insert unless already there".
 */
export async function ensureOwnOrg(u: { id: string; name?: string | null; email: string }, d: typeof db = db): Promise<string> {
  const orgId = await ownOrgId(u.id);
  const org = d.insert(schema.organizations).values({ id: orgId, name: u.name || u.email }).onConflictDoNothing();
  const member = d.insert(schema.memberships).values({ orgId, userId: u.id, role: "owner" }).onConflictDoNothing();
  // On Neon both rows go in one HTTP batch (one transaction): never an organization without its owner.
  // The local test database has no batch; there one after the other, and a second call finishes a pair left half made.
  const b = d as unknown as { batch?: (q: [typeof org, typeof member]) => Promise<unknown> };
  if (typeof b.batch === "function") await b.batch([org, member]);
  else { await org; await member; }
  return orgId;
}
