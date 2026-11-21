import { db, schema } from "@/db";
import { requireUser } from "@/lib/session";
import { getExtState } from "@/lib/ext/gate";
import { workerUiOn } from "@/lib/ext/worker-gate";
import { credView, getWorkerState } from "@/lib/ext/worker-store";
import Connection from "@/components/app/connection";
import { asc, desc, eq, inArray, sql } from "drizzle-orm";
import CaseList, { type CaseRow } from "@/components/app/case-list";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const { orgId } = await requireUser();
  const rows = await db.select().from(schema.cases).where(eq(schema.cases.orgId, orgId)).orderBy(desc(schema.cases.createdAt)).limit(200);
  // only what the list shows: which case, whether it is done, and what (if anything) it is missing
  const ids = rows.filter((c) => c.status === "failed" || !c.plate).map((c) => c.id);
  const firsts = ids.length ? await db.select({ caseId: schema.caseFiles.caseId, name: schema.caseFiles.originalName }).from(schema.caseFiles).where(inArray(schema.caseFiles.caseId, ids)).orderBy(asc(schema.caseFiles.id)) : [];
  const first = new Map<string, string>();
  for (const f of firsts) if (!first.has(f.caseId)) first.set(f.caseId, f.name);
  // R2-B05: how many photos of each open case still wait for the user (the same count the case page shows)
  const open = rows.filter((c) => c.status !== "done" && c.status !== "failed").map((c) => c.id);
  const todo = open.length ? await db.select({
    caseId: schema.casePhotos.caseId,
    n: sql<number>`(count(*) filter (where final_name is null and ((model_name is null and name_state not in ('pending', 'running')) or (name_state = 'named' and model_name is not null and coalesce(confidence, 0) < 0.9 and coalesce(how, '') <> 'rule')))::int)`,
  }).from(schema.casePhotos).where(inArray(schema.casePhotos.caseId, open)).groupBy(schema.casePhotos.caseId) : [];
  const confirm = new Map(todo.map((x) => [x.caseId, Number(x.n)]));
  const list: CaseRow[] = rows.map((c) => ({
    deskConfirm: confirm.get(c.id) ?? 0,
    error: c.status === "failed" ? c.error : null,
    createdAt: c.createdAt.toISOString(),
    firstFile: first.get(c.id) ?? null,
    id: c.id,
    plate: c.plate,
    carModel: c.carModel,
    insurer: c.insurer,
    status: c.status,
    pendingDoc: c.pendingDoc,
  }));
  const worker = workerUiOn();
  return <CaseList rows={list} orgId={orgId} below={<Connection embedded mode={worker ? "worker" : "browser"} cred={worker ? await credView(orgId) : null} state={worker ? await getWorkerState(orgId) : await getExtState(orgId)} cases={list.map((c) => ({ id: c.id, plate: c.plate }))} />} />;
}
