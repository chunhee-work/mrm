import { notFound } from "next/navigation";
import { splitRunning } from "@/lib/split-marks";
import { after } from "next/server";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/session";
import CaseView, { type CaseDetail } from "./view";
import { normalizeCaseData } from "@/lib/read-docs";
import { leaseTime, scanCase, STALE_MS } from "@/lib/scan-case";

import { sidesForCases } from "@/lib/case-sides";
import { CONFIRM_COUNT } from "@/lib/photos/confirm-sql";
import type { Metadata } from "next";
import { getT } from "@/lib/i18n-server";
import { pageMeta } from "@/lib/meta";
import { SITE } from "@/lib/site";
import { workerUiOn } from "@/lib/ext/worker-gate";
import { credView } from "@/lib/ext/worker-store";
import { orgWorkshops, caseSlot } from "@/lib/ext/workshops";
import { canSwitchWorkshop } from "@/lib/ext/workshop-rules";
import { credKeyReady } from "@/lib/crypto/merimen-cred";
import { timelineFor } from "@/lib/screenshots/server";
import { missingRelation } from "@/lib/ext/worker-gate";

/** R4-B04: the tab says which case it is ("WXY9999 · Case · Autopilotclaim"), so several open cases can be told apart.
 * `absolute`: the layout above sets a plain title, which drops the root "%s · brand" template for everything below it. */
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const base = await pageMeta("case.title", { index: false });
  const { t } = await getT();
  const { orgId } = await requireUser();
  const [c] = await db.select({ plate: schema.cases.plate }).from(schema.cases).where(and(eq(schema.cases.id, id), eq(schema.cases.orgId, orgId))).limit(1);
  const name = c ? `${c.plate || t("photos.noPlate")} · ${t("case.title")}` : t("case.title");
  return { ...base, title: { absolute: `${name} · ${SITE.brand}` } };
}
export const dynamic = "force-dynamic";
export const maxDuration = 300; // a recovery read runs after the page is sent

export default async function CasePage({ params }: { params: Promise<{ id: string }> }) {
  const { orgId, user } = await requireUser();
  const { id } = await params;
  const [c] = await db.select().from(schema.cases).where(and(eq(schema.cases.id, id), eq(schema.cases.orgId, orgId))).limit(1);
  if (!c) notFound();
  const events = await db.select().from(schema.caseEvents).where(eq(schema.caseEvents.caseId, id)).orderBy(asc(schema.caseEvents.at)).limit(100);
  const files = await db.select({ id: schema.caseFiles.id, name: schema.caseFiles.originalName, kind: schema.caseFiles.kind, size: schema.caseFiles.size }).from(schema.caseFiles).where(eq(schema.caseFiles.caseId, id)).orderBy(asc(schema.caseFiles.id)).limit(400);
  const [ph] = await db.select({ n: sql<number>`count(*)::int`, todo: sql<number>`count(*) filter (where final_name is null and (name_state <> 'named' or confidence is null or confidence < 0.9))::int` }).from(schema.casePhotos).where(eq(schema.casePhotos.caseId, id));
  // Self-heal, so no case waits forever: a dead read is started again (max 3 reads per case), and a case that never
  // got its first read (the after-upload trigger did not run) is claimed here.
  const lastEvent = events.length ? events[events.length - 1].at.getTime() : c.createdAt.getTime();
  const since = leaseTime(c.error) ?? lastEvent;
  const stale = c.status === "reading" && Date.now() - since > STALE_MS;
  if (stale) after(() => scanCase(id, "recover", c.error));
  else if (c.status === "uploaded" && Date.now() - c.createdAt.getTime() > 60_000 && !(await splitRunning(orgId))) after(() => scanCase(id, "auto")); // a running split may still roll this case back
  const d = normalizeCaseData(c.caseData);
  const [dk] = await db.select({
    total: sql<number>`count(*)::int`,
    confirm: CONFIRM_COUNT,
    edited: sql<number>`(count(*) filter (where final_name is not null))::int`,
  }).from(schema.casePhotos).where(eq(schema.casePhotos.caseId, id));
  const [plan] = await db.select().from(schema.photoUploadLog).where(eq(schema.photoUploadLog.caseId, id)).orderBy(desc(schema.photoUploadLog.createdAt), desc(schema.photoUploadLog.id)).limit(1)
    .catch((e) => { if (missingRelation(e)) return []; throw e; }); // the table comes with migration 0010
  const [same] = c.plate ? await db.select({ n: sql<number>`count(*)::int` }).from(schema.cases).where(and(eq(schema.cases.orgId, orgId), eq(schema.cases.plate, c.plate), sql`${schema.cases.id} <> ${id}`)) : [];
  const detail: CaseDetail = {
    sameCount: Number(same?.n ?? 0),
    createdAt: c.createdAt.toISOString(),
    id: c.id,
    plate: c.plate,
    status: c.status,
    insurer: c.insurer,
    carModel: c.carModel,
    totalRm: c.totalRm,
    sides: c.status === "done" ? await sidesForCases([c.id]).then((m) => m.get(c.id) ?? []).catch(() => undefined) : undefined,
    missing: d?.missing ?? (c.pendingDoc ? c.pendingDoc.split("; ") : []),
    fileCount: files.length,
    files: files.map((f) => ({ id: f.id, name: f.name, kind: f.kind, size: Number(f.size) })),
    orgId,
    error: c.status === "failed" ? c.error : null,
    photos: Number(ph?.n ?? 0),
    photosTodo: Number(ph?.todo ?? 0),
    facts: d && {
      owner: d.client_vehicle.owner.name,
      policyNo: d.client_policy?.policy_no || null,
      policeReport: d.police.report_no || null,
      accidentAt: d.police.accident_datetime || null,
      atFaultPlate: d.at_fault.plate || d.police.blamed_plate || null,
      atFaultInsurer: d.at_fault.policy?.insurer || null,
    },
    desk: dk ? { total: Number(dk.total), confirm: Number(dk.confirm), edited: Number(dk.edited), doneAt: c.photosDoneAt ? c.photosDoneAt.toISOString() : null } : null,
    photoPlan: plan ? { mode: plan.mode, action: plan.action, upload: plan.would.upload ?? 0, relabel: plan.would.relabel ?? 0, reorder: plan.would.reorder ?? 0 } : null,
    events: events.map((e) => ({ at: e.at.toISOString(), message: e.message })),
    stale,
    cred: await credView(orgId),
    credConfigured: credKeyReady(),
    workshops: await orgWorkshops(orgId),
    workshopSlot: await caseSlot(id),
    workshopLocked: !canSwitchWorkshop({ status: c.status, merimenCaseId: c.merimenCaseId }),
    // only the user who submitted the case gets this list; anyone else in the organisation gets none
    shots: workerUiOn() ? await timelineFor(id, user.id, c.createdBy).catch((e) => { if (missingRelation(e)) return null; throw e; }) : null,
  };
  return <CaseView c={detail} />;
}
