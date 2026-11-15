import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { and, desc, eq, inArray, ne, or, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { getLang } from "@/lib/i18n-server";
import { caseInOrg } from "@/lib/photos/server";
import { photoT } from "@/lib/photos/strings";
import { requireUser } from "@/lib/session";
import NamingDesk, { type DeskTab } from "@/components/photos/naming-desk";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const { orgId } = await requireUser();
  const c = await caseInOrg(orgId, id);
  const title = photoT(await getLang())("title");
  return { title: c ? `${c.plate} · ${title}` : title, robots: { index: false, follow: false } };
}

/** The photo naming desk: every open case of the organisation as a tab, this case in front. */
export default async function PhotosPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { orgId } = await requireUser();
  const c = await caseInOrg(orgId, id);
  if (!c) notFound(); // another organisation's case looks exactly like a case that does not exist

  const rows = await db.select({ id: schema.cases.id, plate: schema.cases.plate, carModel: schema.cases.carModel, doneAt: schema.cases.photosDoneAt })
    .from(schema.cases)
    .where(and(eq(schema.cases.orgId, orgId), or(ne(schema.cases.status, "done"), eq(schema.cases.id, id))))
    .orderBy(desc(schema.cases.createdAt)).limit(40);
  if (!rows.some((r) => r.id === id)) rows.unshift({ id: c.id, plate: c.plate, carModel: c.carModel, doneAt: c.photosDoneAt });
  const n = rows.length
    ? await db.select({ caseId: schema.casePhotos.caseId, n: sql<number>`count(*)::int` }).from(schema.casePhotos)
        .where(inArray(schema.casePhotos.caseId, rows.map((r) => r.id))).groupBy(schema.casePhotos.caseId)
    : [];
  const count = new Map(n.map((x) => [x.caseId, Number(x.n)]));
  const tabs: DeskTab[] = rows.map((r) => ({ id: r.id, plate: r.plate, carModel: r.carModel, done: r.doneAt != null, photos: count.get(r.id) ?? 0 }));

  return <NamingDesk orgId={orgId} tabs={tabs} initialId={id} />;
}
