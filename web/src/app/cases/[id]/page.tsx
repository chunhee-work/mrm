import { notFound } from "next/navigation";
import { after } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/session";
import CaseView, { type CaseDetail } from "./view";
import type { CaseDataT } from "@/lib/read-docs";
import { scanCase, STALE_MS } from "@/lib/scan-case";

import { pageMeta } from "@/lib/meta";

export const generateMetadata = () => pageMeta("case.title", { index: false });
export const dynamic = "force-dynamic";
export const maxDuration = 300; // a recovery read runs after the page is sent

export default async function CasePage({ params }: { params: Promise<{ id: string }> }) {
  const { orgId } = await requireUser();
  const { id } = await params;
  const [c] = await db.select().from(schema.cases).where(and(eq(schema.cases.id, id), eq(schema.cases.orgId, orgId))).limit(1);
  if (!c) notFound();
  const events = await db.select().from(schema.caseEvents).where(eq(schema.caseEvents.caseId, id)).orderBy(asc(schema.caseEvents.at)).limit(100);
  const files = await db.select({ n: schema.caseFiles.id }).from(schema.caseFiles).where(eq(schema.caseFiles.caseId, id));
  const lastAt = events.length ? events[events.length - 1].at.getTime() : c.createdAt.getTime();
  const stale = c.status === "reading" && Date.now() - lastAt > STALE_MS;
  if (stale) after(() => scanCase(id, "recover")); // self-heal: a read that died is started again (max 3 reads per case)
  const d = (c.caseData ?? null) as CaseDataT | null;
  const detail: CaseDetail = {
    id: c.id,
    plate: c.plate,
    status: c.status,
    error: c.error,
    insurer: c.insurer,
    carModel: c.carModel,
    missing: d?.missing ?? (c.pendingDoc ? c.pendingDoc.split("; ") : []),
    fileCount: files.length,
    facts: d && {
      owner: d.client_vehicle.owner.name,
      policyNo: d.client_policy?.policy_no ?? null,
      policeReport: d.police.report_no,
      accidentAt: d.police.accident_datetime,
      atFaultPlate: d.at_fault.plate ?? d.police.blamed_plate,
      atFaultInsurer: d.at_fault.policy?.insurer ?? null,
    },
    events: events.map((e) => ({ at: e.at.toISOString(), message: e.message })),
    stale,
  };
  return <CaseView c={detail} />;
}
