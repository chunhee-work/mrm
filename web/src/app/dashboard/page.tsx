import { db, schema } from "@/db";
import { requireUser } from "@/lib/session";
import { getExtState } from "@/lib/ext/gate";
import { workerUiOn } from "@/lib/ext/worker-gate";
import { credView, getWorkerState } from "@/lib/ext/worker-store";
import Connection from "@/components/app/connection";
import { asc, desc, eq, inArray, sql } from "drizzle-orm";
import { CONFIRM_COUNT } from "@/lib/photos/confirm-sql";
import CaseTable, { type CaseRow } from "@/components/app/case-table";
import Home, { type HomeCounts } from "@/components/app/home";
import { bucketOf, VIEWS, type View } from "@/components/app/status";

export const dynamic = "force-dynamic";

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ view?: string; q?: string }> }) {
  const { user, orgId } = await requireUser();
  const sp = await searchParams;
  const view = (VIEWS as readonly string[]).includes(sp.view ?? "") ? (sp.view as View) : null;
  const q = typeof sp.q === "string" ? sp.q.slice(0, 40) : "";
  const rows = await db.select().from(schema.cases).where(eq(schema.cases.orgId, orgId)).orderBy(desc(schema.cases.createdAt)).limit(200);
  // only what the count and the table show: which case, whether it is done, and what (if anything) it is missing
  const ids = rows.filter((c) => c.status === "failed" || !c.plate).map((c) => c.id);
  const firsts = ids.length ? await db.select({ caseId: schema.caseFiles.caseId, name: schema.caseFiles.originalName }).from(schema.caseFiles).where(inArray(schema.caseFiles.caseId, ids)).orderBy(asc(schema.caseFiles.id)) : [];
  const first = new Map<string, string>();
  for (const f of firsts) if (!first.has(f.caseId)) first.set(f.caseId, f.name);
  // R2-B05: how many photos of each open case still wait for the user (the same count the case page shows)
  const open = rows.filter((c) => c.status !== "done" && c.status !== "failed").map((c) => c.id);
  const todo = open.length ? await db.select({
    caseId: schema.casePhotos.caseId,
    n: CONFIRM_COUNT,
    total: sql<number>`count(*)::int`,
  }).from(schema.casePhotos).where(inArray(schema.casePhotos.caseId, open)).groupBy(schema.casePhotos.caseId) : [];
  const confirm = new Map(todo.map((x) => [x.caseId, Number(x.n)]));
  const total = new Map(todo.map((x) => [x.caseId, Number(x.total)]));
  const list: CaseRow[] = rows.map((c) => ({
    deskConfirm: confirm.get(c.id) ?? 0,
    deskTotal: total.get(c.id) ?? 0,
    photosDone: c.photosDoneAt != null,
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
  }));
  // a row of the count was opened, or something was searched for: the table of those cases
  if (view || q) return <CaseTable rows={list} view={view} q0={q} />;

  // the first page: who is logged in, a search, three buttons, and how many open cases wait for what
  const counts: HomeCounts = { docs: 0, photos: 0, hold: 0, active: 0, closed: 0 };
  for (const c of list) counts[bucketOf(c)]++;
  const worker = workerUiOn();
  const state = worker ? await getWorkerState(orgId) : await getExtState(orgId);
  // while the Merimen connection is switched off there is nothing to do or read about it: the page ends with the count
  const below = state === "off" ? undefined : <Connection embedded mode={worker ? "worker" : "browser"} cred={worker ? await credView(orgId) : null} state={state} cases={list.map((c) => ({ id: c.id, plate: c.plate }))} />;
  return <Home name={user.name} counts={counts} below={below} />;
}
