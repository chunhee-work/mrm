import "server-only";
import { and, asc, eq, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { getUserOrNull } from "@/lib/session";
import { workerUiOn } from "@/lib/ext/worker-gate";
import { openPhoto } from "@/lib/photos/store";
import { shotHandlers, type ShotRow } from "./access";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const toRow = (r: typeof schema.caseScreenshots.$inferSelect): ShotRow => ({
  id: r.id, caseId: r.caseId, userId: r.userId, orgId: r.orgId, step: r.step, blobPathname: r.blobPathname, deletedAt: r.deletedAt,
});

export const handlers = shotHandlers({
  enabled: () => workerUiOn(),
  viewer: async () => { const me = await getUserOrNull(); return me ? { userId: me.user.id, orgId: me.orgId } : null; },
  loadCase: async (id) => {
    const [c] = await db.select({ id: schema.cases.id, orgId: schema.cases.orgId, createdBy: schema.cases.createdBy }).from(schema.cases).where(eq(schema.cases.id, id)).limit(1);
    return c ?? null;
  },
  listShots: async (caseId, userId) =>
    (await db.select().from(schema.caseScreenshots)
      .where(and(eq(schema.caseScreenshots.caseId, caseId), eq(schema.caseScreenshots.userId, userId), isNull(schema.caseScreenshots.deletedAt)))
      .orderBy(asc(schema.caseScreenshots.createdAt))).map(toRow),
  loadShot: async (id) => {
    if (!UUID.test(id)) return null;
    const [r] = await db.select().from(schema.caseScreenshots).where(eq(schema.caseScreenshots.id, id)).limit(1);
    return r ? toRow(r) : null;
  },
  open: (p) => openPhoto(p).then((o) => (o ? { body: o.body as BodyInit, contentType: o.contentType } : null)),
});

/** For the case page: this viewer's pictures of the case, oldest first; null for anyone who did not submit it (the section is not shown). */
export async function timelineFor(caseId: string, userId: string, createdBy: string | null) {
  if (!createdBy || createdBy !== userId) return null;
  const rows = await db.select().from(schema.caseScreenshots)
    .where(and(eq(schema.caseScreenshots.caseId, caseId), eq(schema.caseScreenshots.userId, userId), isNull(schema.caseScreenshots.deletedAt)))
    .orderBy(asc(schema.caseScreenshots.createdAt)).limit(60);
  return rows.map((r) => ({ id: r.id, step: r.step, at: r.createdAt.toISOString(), zh: r.captionZh, en: r.captionEn }));
}
