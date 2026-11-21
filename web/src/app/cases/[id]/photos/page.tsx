import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { and, desc, eq, inArray, ne, notInArray, or, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { getLang, getT } from "@/lib/i18n-server";
import { caseInOrg } from "@/lib/photos/server";
import { photoT } from "@/lib/photos/strings";
import { requireUser } from "@/lib/session";
import NamingDesk, { type DeskTab } from "@/components/photos/naming-desk";

export const dynamic = "force-dynamic";

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

  const rows = await db.select({ id: schema.cases.id, plate: schema.cases.plate, carModel: schema.cases.carModel, doneAt: schema.cases.photosDoneAt, status: schema.cases.status, createdAt: schema.cases.createdAt })
    .from(schema.cases)
    .where(and(eq(schema.cases.orgId, orgId), or(and(ne(schema.cases.status, "done"), notInArray(schema.cases.status, NO_DESK)), eq(schema.cases.id, id))))
    .orderBy(desc(schema.cases.createdAt)).limit(40);
  if (!rows.some((r) => r.id === id)) rows.unshift({ id: c.id, plate: c.plate, carModel: c.carModel, doneAt: c.photosDoneAt, status: c.status, createdAt: c.createdAt });
  const n = rows.length
    ? await db.select({ caseId: schema.casePhotos.caseId, n: sql<number>`count(*)::int` }).from(schema.casePhotos)
        .where(inArray(schema.casePhotos.caseId, rows.map((r) => r.id))).groupBy(schema.casePhotos.caseId)
    : [];
  const count = new Map(n.map((x) => [x.caseId, Number(x.n)]));
  const noPlate = (await getT()).t("photos.noPlate"); // the documents have not been read yet: say so instead of an empty tab
  // U12: only cases that can be named: this one, and the others that have photos and did not fail
  const naming = rows.filter((r) => r.id === id || ((count.get(r.id) ?? 0) > 0 && r.status !== "failed"));
  // R2-U02: tabs with the same plate are told apart by the upload time (formatted here, in Malaysia time, so server and browser agree)
  const samePlate = new Map<string, number>();
  for (const r of naming) samePlate.set(r.plate, (samePlate.get(r.plate) ?? 0) + 1);
  const when = (d: Date) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Kuala_Lumpur" }).format(d);
  const tabs: DeskTab[] = naming.map((r) => ({ id: r.id, plate: r.plate || noPlate, carModel: r.carModel, done: r.doneAt != null, photos: count.get(r.id) ?? 0, when: (samePlate.get(r.plate) ?? 0) > 1 || !r.plate ? when(r.createdAt) : undefined }));

  return <NamingDesk orgId={orgId} tabs={tabs} initialId={id} />;
}
