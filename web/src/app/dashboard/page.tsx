import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/session";
import { getExtState } from "@/lib/ext/gate";
import Connection from "@/components/app/connection";
import CaseList, { type CaseRow } from "@/components/app/case-list";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const { orgId } = await requireUser();
  const rows = await db.select().from(schema.cases).where(eq(schema.cases.orgId, orgId)).orderBy(desc(schema.cases.createdAt)).limit(200);
  // only what the list shows: which case, whether it is done, and what (if anything) it is missing
  const list: CaseRow[] = rows.map((c) => ({
    id: c.id,
    plate: c.plate,
    carModel: c.carModel,
    insurer: c.insurer,
    status: c.status,
    pendingDoc: c.pendingDoc,
  }));
  return <CaseList rows={list} orgId={orgId} below={<Connection embedded state={await getExtState(orgId)} cases={list.map((c) => ({ id: c.id, plate: c.plate }))} />} />;
}
