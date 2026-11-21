import { notFound } from "next/navigation";
import { after } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/session";
import CaseView, { type CaseDetail } from "./view";
import { normalizeCaseData } from "@/lib/read-docs";
import { leaseTime, scanCase, STALE_MS } from "@/lib/scan-case";

import { pageMeta } from "@/lib/meta";
import { workerUiOn } from "@/lib/ext/worker-gate";
import { credView } from "@/lib/ext/worker-store";
import { timelineFor } from "@/lib/screenshots/server";
import { missingRelation } from "@/lib/ext/worker-gate";

export const generateMetadata = () => pageMeta("case.title", { index: false });
export const dynamic = "force-dynamic";
export const maxDuration = 300; // a recovery read runs after the page is sent

export default async function CasePage({ params }: { params: Promise<{ id: string }> }) {
  const { orgId, user } = await requireUser();
  const { id } = await params;
  const [c] = await db.select().from(schema.cases).where(and(eq(schema.cases.id, id), eq(schema.cases.orgId, orgId))).limit(1);
  if (!c) notFound();
  const events = await db.select().from(schema.caseEvents).where(eq(schema.caseEvents.caseId, id)).orderBy(asc(schema.caseEvents.at)).limit(100);
  const files = await db.select({ n: schema.caseFiles.id }).from(schema.caseFiles).where(eq(schema.caseFiles.caseId, id));
  // Self-heal, so no case waits forever: a dead read is started again (max 3 reads per case), and a case that never
  // got its first read (the after-upload trigger did not run) is claimed here.
  const lastEvent = events.length ? events[events.length - 1].at.getTime() : c.createdAt.getTime();
  const since = leaseTime(c.error) ?? lastEvent;
  const stale = c.status === "reading" && Date.now() - since > STALE_MS;
  if (stale) after(() => scanCase(id, "recover", c.error));
  else if (c.status === "uploaded" && Date.now() - c.createdAt.getTime() > 60_000) after(() => scanCase(id, "auto"));
  const d = normalizeCaseData(c.caseData);
  const detail: CaseDetail = {
    id: c.id,
    plate: c.plate,
    status: c.status,
    insurer: c.insurer,
    carModel: c.carModel,
    missing: d?.missing ?? (c.pendingDoc ? c.pendingDoc.split("; ") : []),
    fileCount: files.length,
    facts: d && {
      owner: d.client_vehicle.owner.name,
      policyNo: d.client_policy?.policy_no || null,
      policeReport: d.police.report_no || null,
      accidentAt: d.police.accident_datetime || null,
      atFaultPlate: d.at_fault.plate || d.police.blamed_plate || null,
      atFaultInsurer: d.at_fault.policy?.insurer || null,
    },
    events: events.map((e) => ({ at: e.at.toISOString(), message: e.message })),
    stale,
    cred: workerUiOn() ? await credView(orgId) : null,
    // only the user who submitted the case gets this list; anyone else in the organisation gets none
    shots: workerUiOn() ? await timelineFor(id, user.id, c.createdBy).catch((e) => { if (missingRelation(e)) return null; throw e; }) : null,
  };
  return <CaseView c={detail} />;
}
