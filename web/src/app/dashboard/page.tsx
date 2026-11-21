import { db, schema } from "@/db";
import { requireUser } from "@/lib/session";
import { getExtState } from "@/lib/ext/gate";
import { workerUiOn } from "@/lib/ext/worker-gate";
import { credView, getWorkerState } from "@/lib/ext/worker-store";
import Connection from "@/components/app/connection";
import { sidesForCases } from "@/lib/case-sides";
import { asc, desc, eq, inArray } from "drizzle-orm";
import CaseList, { type CaseRow } from "@/components/app/case-list";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const { orgId } = await requireUser();
  const rows = await db.select().from(schema.cases).where(eq(schema.cases.orgId, orgId)).orderBy(desc(schema.cases.createdAt)).limit(200);
  // only what the list shows: which case, whether it is done, and what (if anything) it is missing
  const sides = await sidesForCases(rows.filter((c) => c.status === "done").map((c) => c.id)).catch(() => null);
  const ids = rows.filter((c) => c.status === "failed" || !c.plate).map((c) => c.id);
  const firsts = ids.length ? await db.select({ caseId: schema.caseFiles.caseId, name: schema.caseFiles.originalName }).from(schema.caseFiles).where(inArray(schema.caseFiles.caseId, ids)).orderBy(asc(schema.caseFiles.id)) : [];
  const first = new Map<string, string>();
  for (const f of firsts) if (!first.has(f.caseId)) first.set(f.caseId, f.name);
  const list: CaseRow[] = rows.map((c) => ({
    error: c.status === "failed" ? c.error : null,
    createdAt: c.createdAt.toISOString(),
    firstFile: first.get(c.id) ?? null,
    id: c.id,
    plate: c.plate,
    carModel: c.carModel,
    insurer: c.insurer,
    status: c.status,
    pendingDoc: c.pendingDoc,
    totalRm: c.totalRm,
    sides: sides?.get(c.id) ?? (c.status === "done" && sides ? [] : undefined),
  }));
  const worker = workerUiOn();
  return <CaseList rows={list} orgId={orgId} below={<Connection embedded mode={worker ? "worker" : "browser"} cred={worker ? await credView(orgId) : null} state={worker ? await getWorkerState(orgId) : await getExtState(orgId)} cases={list.map((c) => ({ id: c.id, plate: c.plate }))} />} />;
}
