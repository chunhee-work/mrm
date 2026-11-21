// Progress screenshots: who may see one. Default deny. Pure functions and a handler factory with injected parts, so the
// rules are tested without a database, a session or a Blob store.

export const SHOT_STEPS = ["login_verified", "case_opened", "photos_named", "documents_uploaded", "case_complete", "failed"] as const;

export type Viewer = { userId: string; orgId: string };
export type CaseRef = { id: string; orgId: string; createdBy: string | null };
export type ShotRow = { id: string; caseId: string; userId: string; orgId: string; step: string; blobPathname: string; deletedAt: Date | null };

/** The viewer must be the user who submitted the case AND the row's owner, in the case's organisation. Anything else: no. */
export function mayView(v: Viewer | null, c: CaseRef | null, shot?: ShotRow | null): boolean {
  if (!v || !c) return false;
  if (!c.createdBy || c.createdBy !== v.userId || c.orgId !== v.orgId) return false;
  if (shot) {
    if (shot.deletedAt || shot.caseId !== c.id || shot.userId !== v.userId || shot.orgId !== c.orgId) return false;
    if (!shot.blobPathname.startsWith(`screenshots/${v.userId}/${c.id}/`)) return false;
  }
  return true;
}

export type Deps = {
  enabled: () => boolean; // the WORKER_UI flag
  viewer: () => Promise<Viewer | null>;
  loadCase: (caseId: string) => Promise<CaseRef | null>;
  listShots: (caseId: string, userId: string) => Promise<ShotRow[]>;
  loadShot: (shotId: string) => Promise<ShotRow | null>;
  open: (pathname: string) => Promise<{ body: BodyInit; contentType: string } | null>;
};

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "Cache-Control": "private, no-store" } });
const NOT_FOUND = () => json(404, { error: "not_found" });

export function shotHandlers(d: Deps) {
  return {
    async list(caseId: string): Promise<Response> {
      if (!d.enabled()) return NOT_FOUND();
      const v = await d.viewer();
      if (!v) return json(401, { error: "unauthorized" });
      const c = await d.loadCase(caseId);
      // other organisation, same organisation but another submitter, unknown case: all the same answer
      if (!mayView(v, c)) return NOT_FOUND();
      const rows = (await d.listShots(caseId, v.userId)).filter((r) => mayView(v, c, r));
      return json(200, { shots: rows.map((r) => ({ id: r.id, step: r.step })) });
    },
    async image(caseId: string, shotId: string): Promise<Response> {
      if (!d.enabled()) return NOT_FOUND();
      const v = await d.viewer();
      if (!v) return json(401, { error: "unauthorized" });
      const [c, shot] = await Promise.all([d.loadCase(caseId), d.loadShot(shotId)]);
      if (!mayView(v, c, shot)) return NOT_FOUND();
      const o = await d.open(shot!.blobPathname);
      if (!o) return NOT_FOUND();
      return new Response(o.body, { status: 200, headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
    },
  };
}
