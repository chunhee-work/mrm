import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/session";
import CaseList, { type CaseRow } from "@/components/app/case-list";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const { orgId } = await requireUser();
  const rows = await db.select().from(schema.cases).where(eq(schema.cases.orgId, orgId)).orderBy(desc(schema.cases.createdAt)).limit(200);
  const list: CaseRow[] = rows.map((c) => ({
    id: c.id,
    plate: c.plate,
    carModel: c.carModel,
    insurer: c.insurer,
    status: c.status,
    pendingDoc: c.pendingDoc,
    createdAt: c.createdAt.toISOString(),
    doneAt: c.doneAt ? c.doneAt.toISOString() : null,
  }));
  return <CaseList rows={list} now={Date.now()} />;
}
