import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { and, desc, eq, ne, notInArray, or, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { getLang, getT } from "@/lib/i18n-server";
import { cache } from "react";
import { caseInOrg as caseInOrgRaw, photoState } from "@/lib/photos/server";
import type { CaseState } from "@/lib/photos/desk-rules";
import { photoT } from "@/lib/photos/strings";
import { requireUser } from "@/lib/session";
import NamingDesk, { type DeskTab } from "@/components/photos/naming-desk";

export const dynamic = "force-dynamic";

// generateMetadata and the page both ask for this case: one database round trip per request, not two
const caseInOrg = cache(caseInOrgRaw);

/** Cases that are not on the desk: the documents are not read yet (or being read), or reading failed. */
const NO_DESK = ["uploaded", "reading", "failed"];

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const { orgId } = await requireUser();
  const c = await caseInOrg(orgId, id);
  const title = photoT(await getLang())("title");
  return { title: c?.plate ? `${c.plate} · ${title}` : title, robots: { index: false, follow: false } };
}

/** The photo naming desk: every open case of the organisation as a tab, this case in front. */
export default async function PhotosPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { orgId } = await requireUser();
  const c = await caseInOrg(orgId, id);
  if (!c) notFound(); // another organisation's case looks exactly like a case that does not exist
  if (NO_DESK.includes(c.status)) redirect(`/cases/${id}`); // not read yet, being read, or failed: nothing to name

  // one round trip for everything the head needs: the case list, the counts and the open case's photos run side by side (they used to run one after the other)
  const [rows0, n, tr, first] = await Promise.all([
    db.select({ id: schema.cases.id, plate: schema.cases.plate, carModel: schema.cases.carModel, doneAt: schema.cases.photosDoneAt, status: schema.cases.status, createdAt: schema.cases.createdAt, data: schema.cases.caseData })
      .from(schema.cases)
      .where(and(eq(schema.cases.orgId, orgId), or(and(ne(schema.cases.status, "done"), notInArray(schema.cases.status, NO_DESK)), eq(schema.cases.id, id))))
      .orderBy(desc(schema.cases.createdAt)).limit(40),
    db.select({ caseId: schema.casePhotos.caseId, n: sql<number>`count(*)::int`, edited: sql<number>`(count(*) filter (where final_name is not null))::int` }).from(schema.casePhotos)
      .innerJoin(schema.cases, eq(schema.cases.id, schema.casePhotos.caseId))
      .where(and(eq(schema.cases.orgId, orgId), notInArray(schema.cases.status, NO_DESK))).groupBy(schema.casePhotos.caseId),
    getT(),
    photoState(c),
  ]);
  const rows = rows0;
  if (!rows.some((r) => r.id === id)) rows.unshift({ id: c.id, plate: c.plate, carModel: c.carModel, doneAt: c.photosDoneAt, status: c.status, createdAt: c.createdAt, data: c.caseData });
  const count = new Map(n.map((x) => [x.caseId, Number(x.n)]));
  const editedBy = new Map(n.map((x) => [x.caseId, Number(x.edited)]));
  const noPlate = tr.t("photos.noPlate"); // the documents have not been read yet: say so instead of an empty tab
  // U12: only cases that can be named: this one, and the others that have photos and did not fail
  const naming = rows.filter((r) => r.id === id || ((count.get(r.id) ?? 0) > 0 && r.status !== "failed"));
  // R2-U02: tabs with the same plate are told apart by the upload time; the browser writes it in the page language (R3-B08)
  const samePlate = new Map<string, number>();
  for (const r of naming) samePlate.set(r.plate, (samePlate.get(r.plate) ?? 0) + 1);
  // the workshop shows when the case data has one (the documents sometimes name it)
  const workshopOf = (d: unknown) => { const w = d && typeof d === "object" ? (d as Record<string, unknown>).workshop : null; return typeof w === "string" && w.trim() ? w.trim() : null; };
  const tabs: DeskTab[] = naming.map((r) => ({
    id: r.id, plate: r.plate || noPlate, carModel: r.carModel, done: r.doneAt != null, photos: count.get(r.id) ?? 0,
    at: r.createdAt.toISOString(), dup: (samePlate.get(r.plate) ?? 0) > 1 || !r.plate, edited: editedBy.get(r.id) ?? 0, workshop: workshopOf(r.data),
  }));

  // Hard test 2026-11-22: the open case's photos come with the page, so the photos start loading at once
  // (before: page, then the page's script, then a request for the list, then the photos; about 0.7 s later on a fast line)
  return <NamingDesk orgId={orgId} tabs={tabs} initialId={id} initial={first.status === 200 ? (first.body as unknown as CaseState) : undefined} />;
}
