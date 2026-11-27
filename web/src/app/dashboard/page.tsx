import { db, schema } from "@/db";
import { requireUser } from "@/lib/session";
import { getExtState } from "@/lib/ext/gate";
import { workerUiOn } from "@/lib/ext/worker-gate";
import { credView, getWorkerState } from "@/lib/ext/worker-store";
import Connection from "@/components/app/connection";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { CONFIRM_COUNT } from "@/lib/photos/confirm-sql";
import CaseTable, { type CaseRow } from "@/components/app/case-table";
import Home, { type HomeCounts } from "@/components/app/home";
import { bucketOf, VIEWS, type View } from "@/components/app/status";
import { after } from "next/server";
import { leaseTime, scanCase, STALE_MS } from "@/lib/scan-case";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // a few waiting cases are read after the page is sent

const HEAL_PER_VISIT = 3; // a zip of many cars makes many cases at once: each visit starts a few more of those still waiting

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ view?: string; q?: string }> }) {
  const { user, orgId } = await requireUser();
  const sp = await searchParams;
  const view = (VIEWS as readonly string[]).includes(sp.view ?? "") ? (sp.view as View) : null;
  const q = typeof sp.q === "string" ? sp.q.slice(0, 40) : "";
  // A row of the count was opened: its table must hold every case the count counted (counts are over all cases), so no 200 cap there.
  const cap = view ? 5000 : 200;
  const newest = await db.select().from(schema.cases).where(eq(schema.cases.orgId, orgId)).orderBy(desc(schema.cases.createdAt)).limit(cap);
  // A search looks at every case, not only the newest 200: older matches join the list (the table filters it as before).
  // The needle is squashed like the table's own filter, and % _ \ are escaped so they match themselves.
  const needle = q.replace(/\s+/g, "").toLowerCase().replace(/[\\%_]/g, (c) => `\\${c}`);
  const older = needle && newest.length === cap
    ? await db.select().from(schema.cases).where(and(eq(schema.cases.orgId, orgId), sql`regexp_replace(${schema.cases.plate}, '\\s', '', 'g') ilike ${`%${needle}%`}`))
      .orderBy(desc(schema.cases.createdAt)).limit(1000)
    : [];
  // Self-heal, as on the case page: a case still `uploaded` a minute after it was made never got its read started.
  // A read cut off by a time limit (a split's own reads share its 300 s) stays `reading`: after STALE_MS it is started again, as
  // the case page does. At most HEAL_PER_VISIT reads of this organisation run at once, counting the live ones.
  const now = Date.now();
  const stale = (c: (typeof newest)[number]) => c.status === "reading" && now - (leaseTime(c.error) ?? c.createdAt.getTime()) > STALE_MS;
  const live = newest.filter((c) => c.status === "reading" && !stale(c)).length;
  const heal = [
    ...newest.filter(stale).map((c) => () => scanCase(c.id, "recover", c.error)),
    ...newest.filter((c) => c.status === "uploaded" && now - c.createdAt.getTime() > 60_000).map((c) => () => scanCase(c.id, "auto")),
  ].slice(0, Math.max(0, HEAL_PER_VISIT - live));
  if (heal.length) after(async () => { await Promise.all(heal.map((run) => run().catch(() => {}))); });
  const have = new Set(newest.map((c) => c.id));
  const rows = [...newest, ...older.filter((c) => !have.has(c.id))];
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

  // the first page: who is logged in, a search, two buttons, and how many open cases wait for what
  // Counted over every case of the org, not only the newest 200: per status, and how many of those still have photos to name
  // (bucketOf needs only that, and only for open cases). Then bucketOf places each group, so the rule stays in one place.
  const toName = sql`(select ${CONFIRM_COUNT} from ${schema.casePhotos} where ${schema.casePhotos.caseId} = ${schema.cases.id})`;
  const groups = await db.select({
    status: schema.cases.status,
    n: sql<number>`count(*)::int`,
    naming: sql<number>`(count(*) filter (where ${schema.cases.status} not in ('done', 'failed') and ${toName} > 0))::int`,
  }).from(schema.cases).where(eq(schema.cases.orgId, orgId)).groupBy(schema.cases.status);
  const counts: HomeCounts = { docs: 0, photos: 0, hold: 0, active: 0, closed: 0 };
  for (const g of groups) {
    const naming = Number(g.naming);
    counts[bucketOf({ status: g.status, deskConfirm: 1 })] += naming;
    counts[bucketOf({ status: g.status, deskConfirm: 0 })] += Number(g.n) - naming;
  }
  const worker = workerUiOn();
  const state = worker ? await getWorkerState(orgId) : await getExtState(orgId);
  // while the Merimen connection is switched off there is nothing to do or read about it: the page ends with the count
  const below = state === "off" ? undefined : <Connection embedded mode={worker ? "worker" : "browser"} cred={worker ? await credView(orgId) : null} state={state} cases={list.map((c) => ({ id: c.id, plate: c.plate }))} />;
  return <Home name={user.name} counts={counts} below={below} />;
}
