import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/session";
import { getExtState } from "@/lib/ext/gate";
import Connection from "@/components/app/connection";

export const dynamic = "force-dynamic";

export default async function ConnectionPage() {
  const { orgId } = await requireUser();
  const state = await getExtState(orgId);
  // the case list is only needed for the dry-run preview, which exists only when the feature is fully on
  const rows = state === "ready"
    ? await db.select({ id: schema.cases.id, plate: schema.cases.plate }).from(schema.cases).where(eq(schema.cases.orgId, orgId)).orderBy(desc(schema.cases.createdAt)).limit(200)
    : [];
  return <Connection state={state} cases={rows} />;
}
