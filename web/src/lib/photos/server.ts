import "server-only";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import {
  canonName, doneBlock, isPermutation, pathInCase, statusAfterRegister,
  MAX_EXTRAS, MAX_PHOTOS, MAX_REGISTER, SLICE,
} from "./rules";
import { logLine } from "./log";
import { deletePhoto, photoExists } from "./store";
import { applyCaseRules, arrangeOpening, sameOrder } from "./order-rules";
import { snapshotOf } from "./snapshot";
import { notDeleted } from "@/lib/case-delete";

// Database side of the photo naming desk (plan #9). Every function takes a case that the caller already
// checked against the signed-in member's organisation (see caseInOrg), so nothing here trusts an id from the client.

export type CaseRow = typeof schema.cases.$inferSelect;
type PhotoRow = typeof schema.casePhotos.$inferSelect;
export type Result = { status: number; body: Record<string, unknown> };
const ok = (body: Record<string, unknown> = {}): Result => ({ status: 200, body });
const fail = (status: number, error: string, more: Record<string, unknown> = {}): Result => ({ status, body: { error, ...more } });

const P = schema.casePhotos;
const rowsOf = <T>(r: unknown) => ((r as { rows?: T[] }).rows ?? []) as T[];

/**
 * Runs statements together: on Neon one HTTP batch, which is one transaction (all of them or none). The local test database
 * has no batch; there they run one after the other.
 */
async function together(qs: Parameters<typeof db.batch>[0]): Promise<unknown[]> {
  const d = db as unknown as { batch?: (q: typeof qs) => Promise<unknown[]> };
  if (typeof d.batch === "function") return d.batch(qs);
  const out: unknown[] = [];
  for (const q of qs) out.push(await q);
  return out;
}

export async function caseInOrg(orgId: string, caseId: string): Promise<CaseRow | null> {
  if (!caseId || caseId.length > 64) return null;
  const [c] = await db.select().from(schema.cases).where(and(eq(schema.cases.id, caseId), eq(schema.cases.orgId, orgId), notDeleted)).limit(1);
  return c ?? null;
}

/** What the page gets for one photo. Blob pathnames never leave the server. */
export function photoDto(p: PhotoRow) {
  return {
    id: p.id, origN: p.origN, position: p.position, srcName: p.srcName, state: p.nameState, how: p.how,
    modelName: p.modelName, confidence: p.confidence == null ? null : Number(p.confidence),
    alts: Array.isArray(p.alts) ? p.alts : [], finalName: p.finalName, error: p.nameError, version: p.version,
  };
}
export type PhotoDto = ReturnType<typeof photoDto>;

export async function photoState(c0: CaseRow): Promise<Result> {
  const c = (await finalizeNaming(c0)) ?? c0;
  const [photos, extras] = await Promise.all([
    db.select().from(P).where(eq(P.caseId, c.id)).orderBy(asc(P.position), asc(P.id)),
    db.select().from(schema.caseExtras).where(eq(schema.caseExtras.caseId, c.id)).orderBy(asc(schema.caseExtras.createdAt), asc(schema.caseExtras.id)),
  ]);
  return ok({
    caseId: c.id, plate: c.plate, carModel: c.carModel, status: c.status,
    done: c.photosDoneAt != null, rev: c.photosRev,
    photos: photos.map(photoDto), extras: extras.map((e) => ({ id: e.id, name: e.name })),
  });
}

/**
 * Once every photo has a name (and nobody has touched the order): the case rules on the model's names (Badge (LOGO) to Badge (BRAND),
 * Rear Lamp Inner/Outer pairing) and the opening order (four corners, Interior/Road Tax, Odometer, Chassis, Engine). Runs once per round of
 * photos: one statement claims it, so two open pages cannot both do it. Never touches a name the adjuster set. Returns the fresh case row.
 */
export async function finalizeNaming(c: CaseRow): Promise<CaseRow | null> {
  if (c.photosDoneAt || c.photosArrangedAt) return null;
  if ((await pendingCount(c.id)) > 0) return null;
  const claim = await db.execute(sql`
    UPDATE cases SET photos_arranged_at = now()
    WHERE id = ${c.id} AND photos_arranged_at IS NULL AND photos_done_at IS NULL
      AND EXISTS (SELECT 1 FROM case_photos WHERE case_id = ${c.id})
      AND NOT EXISTS (SELECT 1 FROM case_photos WHERE case_id = ${c.id} AND name_state IN ('pending', 'running'))
    RETURNING photos_rev`);
  const won = rowsOf<{ photos_rev: number }>(claim)[0];
  if (!won) return null;
  const rows = await db.select().from(P).where(eq(P.caseId, c.id)).orderBy(asc(P.position), asc(P.id));
  const vehicle = c.carModel || (c.caseData as { client_vehicle?: { model?: string | null } } | null)?.client_vehicle?.model || "";
  const changes = applyCaseRules(rows.filter((r) => !r.finalName).map((r) => ({ id: r.id, modelName: r.modelName, confidence: r.confidence == null ? null : Number(r.confidence) })), vehicle);
  const model = new Map(rows.map((r) => [r.id, r.modelName]));
  for (const ch of changes) {
    await db.execute(sql`
      UPDATE case_photos SET model_name = ${ch.modelName}, confidence = ${ch.confidence == null ? null : ch.confidence.toFixed(4)}
      WHERE id = ${ch.id} AND case_id = ${c.id} AND final_name IS NULL`);
    model.set(ch.id, ch.modelName);
  }
  const shown = rows.map((r) => ({ id: r.id, name: r.finalName ?? model.get(r.id) ?? null }));
  const next = arrangeOpening(shown);
  if (Number(won.photos_rev) === 0 && !sameOrder(shown, next)) await reorderPhotos(c, next.map((p) => p.id), 0);
  return (await caseInOrg(c.orgId, c.id)) ?? c;
}

// Past Phase B 完成 cannot be pressed again, so an edit there (which takes the tick away) is refused.
// Phase B is past once the worker has queued the case's `checks` job (it does that as Phase B ends). The status alone is not
// enough: a Merimen login problem moves a checking case back to waiting_user until the login is fixed, and checks then finishes it.
const PAST_B = new Set(["checking", "done"]);
// A checks job that failed for good while the case waits for a Merimen login (waiting_user) leaves the desk open again, so the
// adjuster can press 完成 again. A case still at `checking` stays locked by its status (it needs a hand to move it on).
const CHECKS_QUEUED = sql`EXISTS (SELECT 1 FROM jobs WHERE jobs.case_id = cases.id AND jobs.step = 'checks' AND jobs.state IN ('queued', 'running', 'paused', 'done'))`;
async function locked(c: CaseRow): Promise<boolean> {
  if (PAST_B.has(c.status)) return true;
  const r = await db.execute(sql`SELECT ${CHECKS_QUEUED} AS l FROM cases WHERE id = ${c.id}`);
  return Boolean(rowsOf<{ l: boolean }>(r)[0]?.l);
}
// Statuses from which 完成 can be pressed (reading a new document or a failed read only pause it).
const DONE_FROM = new Set(["uploaded", "phase_a", "pending_doc", "waiting_user", "naming", "phase_b"]);

/** Any edit after "done" takes the tick away again (plan, section D). Status only moves back from phase_b. */
export async function clearDone(caseId: string): Promise<boolean> {
  const r = await db.execute(sql`
    UPDATE cases SET photos_done_at = NULL, photos_snapshot = NULL, status = CASE WHEN status = 'phase_b' THEN 'waiting_user' ELSE status END
    WHERE id = ${caseId} AND photos_done_at IS NOT NULL AND status NOT IN ('checking', 'done') AND NOT ${CHECKS_QUEUED} RETURNING id`); /* the worker may have moved it on since the request read it */
  if (!rowsOf(r).length) return false;
  await db.update(P).set({ confirmed: false }).where(eq(P.caseId, caseId));
  // A Phase B that is still waiting in the queue must not run on names that are no longer final. One that is already running
  // checks the case before each Merimen write (worker photo_sync) and stops by itself.
  await db.execute(sql`UPDATE jobs SET state = 'cancelled', locked_by = NULL, locked_at = NULL WHERE case_id = ${caseId} AND step = 'phase_b' AND state IN ('queued', 'paused')`);
  return true;
}

// ---- rename ----
export async function renamePhoto(c: CaseRow, photoId: number, rawName: unknown, version: unknown): Promise<Result> {
  if (!Number.isInteger(photoId) || !Number.isInteger(version)) return fail(400, "invalid");
  if (await locked(c)) return fail(409, "status");
  let finalName: string | null = null;
  if (rawName != null && rawName !== "") {
    finalName = canonName(rawName);
    if (finalName == null) return fail(400, "name");
  }
  const [cur] = await db.select().from(P).where(and(eq(P.id, photoId), eq(P.caseId, c.id))).limit(1);
  if (!cur) return fail(404, "not_found");
  if (finalName != null && finalName === cur.modelName) finalName = null; // same as the suggestion = restore
  const [row] = await db.update(P).set({ finalName, version: sql`${P.version} + 1` })
    .where(and(eq(P.id, photoId), eq(P.caseId, c.id), eq(P.version, version as number))).returning();
  if (!row) {
    const [now] = await db.select().from(P).where(and(eq(P.id, photoId), eq(P.caseId, c.id))).limit(1);
    return now ? fail(409, "stale", { photo: photoDto(now) }) : fail(404, "not_found");
  }
  const cleared = await clearDone(c.id);
  return ok({ photo: photoDto(row), done: cleared ? false : c.photosDoneAt != null });
}

// ---- reorder ----
export async function reorderPhotos(c: CaseRow, ids: unknown, rev: unknown): Promise<Result> {
  if (!Number.isInteger(rev)) return fail(400, "invalid");
  if (await locked(c)) return fail(409, "status");
  const current = (await db.select({ id: P.id }).from(P).where(eq(P.caseId, c.id))).map((r) => r.id);
  if (!isPermutation(current, ids)) return fail(409, "stale_order");
  // One statement: the revision moves and the positions are written together, so another tab can never
  // read the new revision before the order that belongs to it is stored (the row lock on the case makes it wait).
  const bumped = await db.execute(sql`
    WITH bump AS (
      UPDATE cases SET photos_rev = photos_rev + 1 WHERE id = ${c.id} AND photos_rev = ${rev as number} RETURNING photos_rev
    ), moved AS (
      UPDATE case_photos p SET position = v.pos
      FROM bump, (SELECT (e.value)::int AS id, (e.ordinality - 1)::int AS pos FROM jsonb_array_elements_text(${JSON.stringify(ids)}::jsonb) WITH ORDINALITY AS e(value, ordinality)) v
      WHERE p.id = v.id AND p.case_id = ${c.id}
      RETURNING p.id
    )
    SELECT photos_rev FROM bump`);
  const next = rowsOf<{ photos_rev: number }>(bumped)[0];
  if (!next) return fail(409, "stale_order");
  const cleared = await clearDone(c.id);
  return ok({ rev: Number(next.photos_rev), done: cleared ? false : c.photosDoneAt != null });
}

// ---- done ----
export async function setDone(c: CaseRow, done: unknown): Promise<Result> {
  if (typeof done !== "boolean") return fail(400, "invalid");
  if (await locked(c)) return fail(409, "status");
  if (done && !DONE_FROM.has(c.status)) return fail(409, "status");
  if (!done) {
    await clearDone(c.id);
    const [now] = await db.select({ status: schema.cases.status }).from(schema.cases).where(eq(schema.cases.id, c.id));
    return ok({ done: false, status: now?.status ?? c.status });
  }
  // 完成 and its fingerprint go in as ONE write (the worker starts Phase B only on a case that has both). The names are read first;
  // the write goes through only if nothing changed since that read, else it is read again. A failure leaves the case not done.
  const namesOf = () => db.select({ id: P.id, nameState: P.nameState, modelName: P.modelName, finalName: P.finalName }).from(P)
    .where(eq(P.caseId, c.id)).orderBy(asc(P.position), asc(P.id));
  for (let attempt = 0; attempt < 3; attempt++) {
    const seen = rowsOf<{ fp: string }>(await db.execute(sql`SELECT ${stateFp(c.id)} AS fp`))[0]?.fp ?? ""; // before the names: a change in between fails the write
    const [photos, extras] = await Promise.all([
      namesOf(),
      db.select({ name: schema.caseExtras.name }).from(schema.caseExtras).where(eq(schema.caseExtras.caseId, c.id)),
    ]);
    const block = doneBlock(photos);
    if (block) return fail(409, "blocked", block);
    const snap = snapshotOf(photos.map((p) => ({ id: p.id, name: p.finalName ?? p.modelName })), extras.map((e) => e.name));
    const [r] = await together([
      // the checks and the write are one statement: photos added at the same moment cannot slip under the tick
      db.execute(sql`
        UPDATE cases SET photos_done_at = COALESCE(photos_done_at, now()), photos_snapshot = ${snap},
          status = CASE WHEN status IN ('waiting_user', 'naming') THEN 'phase_b' ELSE status END
        WHERE id = ${c.id}
          AND EXISTS (SELECT 1 FROM case_photos WHERE case_id = ${c.id})
          AND NOT EXISTS (SELECT 1 FROM case_photos WHERE case_id = ${c.id}
            AND final_name IS NULL AND (name_state IN ('pending', 'running') OR model_name IS NULL))
          AND ${stateFp(c.id)} = ${seen}
        RETURNING status`),
      // only while still done: an edit that came in after the write above has already cleared the tick and the confirmations
      db.execute(sql`UPDATE case_photos SET confirmed = true WHERE case_id = ${c.id}
        AND EXISTS (SELECT 1 FROM cases WHERE id = ${c.id} AND photos_done_at IS NOT NULL)`),
    ] as Parameters<typeof db.batch>[0]);
    const after = rowsOf<{ status: string }>(r)[0];
    if (!after) continue; // a name, the order, a part or a photo changed between the read and the write: look again
    // Looked at once more after the write: a change that landed while the write itself was running saw a case that was not
    // done yet, so it took nothing back, and the write could not see the change. Such a 完成 is taken back here and tried again.
    const now = rowsOf<{ fp: string }>(await db.execute(sql`SELECT ${stateFp(c.id)} AS fp`))[0]?.fp ?? "";
    if (now !== seen) { await clearDone(c.id); continue; }
    // The learning rows are extra: the worker writes the same rows when Phase B runs, so a failure here must not undo a 完成 that went through.
    await recordLearning(c.id, c.orgId).catch((e) => console.error(logLine("photos.learning", { caseId: c.id }, e)));
    return ok({ done: true, status: after.status });
  }
  // changed three times in a row: the page says it could not save, shows the latest, and 完成 is pressed again
  const block = doneBlock(await namesOf());
  return block ? fail(409, "blocked", block) : fail(409, "busy");
}

/**
 * Everything 完成 depends on, as one value the database works out at one moment: each photo's place, name and naming state, and the
 * parts with no photo. Only ever compared with itself (read, then checked again inside the write), so it need not match snapshotOf.
 */
const stateFp = (caseId: string) => sql`md5(
  (SELECT coalesce(jsonb_agg(jsonb_build_array(p.id, p.position, p.name_state, p.final_name, p.model_name) ORDER BY p.id), '[]'::jsonb)::text FROM case_photos p WHERE p.case_id = ${caseId})
  || (SELECT coalesce(jsonb_agg(lower(e.name) ORDER BY e.id), '[]'::jsonb)::text FROM case_extras e WHERE e.case_id = ${caseId}))`;

/**
 * The photo model's learning data: every photo's final name at Done (the label for the next training build), flagged `changed` when the
 * adjuster's name differs from the model's. One row per photo; Done again after a rename updates the label and puts the row back in the
 * queue (exported_at null). Own database only. The worker writes the same rows with the same statement when Phase B runs.
 */
export async function recordLearning(caseId: string, orgId: string): Promise<void> {
  await db.execute(sql`
    INSERT INTO photo_learning (case_id, org_id, photo_id, content_hash, blob_path, model_name, label, changed)
    SELECT p.case_id, ${orgId}, p.id, p.content_hash, p.blob_path, p.model_name, COALESCE(p.final_name, p.model_name),
           (p.final_name IS NOT NULL AND p.final_name IS DISTINCT FROM p.model_name)
    FROM case_photos p
    WHERE p.case_id = ${caseId} AND COALESCE(p.final_name, p.model_name) IS NOT NULL
    ON CONFLICT (case_id, photo_id) DO UPDATE
    SET label = EXCLUDED.label, changed = EXCLUDED.changed, model_name = EXCLUDED.model_name, updated_at = now(),
        exported_at = CASE WHEN photo_learning.label = EXCLUDED.label THEN photo_learning.exported_at ELSE NULL END`);
}

// ---- extras (parts with no photo) ----
export async function addExtra(c: CaseRow, rawName: unknown): Promise<Result> {
  const name = canonName(rawName); // 1 to 120 characters, the same rule as a photo name
  if (!name) return fail(400, "name");
  if (await locked(c)) return fail(409, "status");
  // the count is checked in the insert itself, so a script cannot fill a case with parts
  const made = rowsOf(await db.execute(sql`
    INSERT INTO case_extras (case_id, name)
    SELECT ${c.id}, ${name} WHERE (SELECT count(*) FROM case_extras WHERE case_id = ${c.id}) < ${MAX_EXTRAS}
    ON CONFLICT (case_id, lower(name)) DO NOTHING RETURNING id`)).length > 0;
  const [row] = await db.select().from(schema.caseExtras)
    .where(and(eq(schema.caseExtras.caseId, c.id), sql`lower(${schema.caseExtras.name}) = lower(${name})`)).limit(1);
  if (!row) return made ? fail(500, "server") : fail(400, "limit", { max: MAX_EXTRAS });
  // a part that was already there changes nothing, so 完成 stays
  if (made) await clearDone(c.id);
  return ok({ extra: { id: row.id, name: row.name }, changed: made });
}
export async function removeExtra(c: CaseRow, extraId: number): Promise<Result> {
  if (!Number.isInteger(extraId)) return fail(400, "invalid");
  if (await locked(c)) return fail(409, "status");
  const gone = await db.delete(schema.caseExtras).where(and(eq(schema.caseExtras.id, extraId), eq(schema.caseExtras.caseId, c.id))).returning({ id: schema.caseExtras.id });
  if (gone.length) await clearDone(c.id);
  return ok({ changed: gone.length > 0 }); // already gone = success, and nothing changed: 完成 stays
}

// ---- uploads ----
export type TokenCheck = { ok: true } | { ok: false; reason: "path" | "duplicate" | "limit" | "taken" | "status" };
/** Run before an upload token is issued: the path is noted so a stray blob can be swept later (plan, AC). */
export async function noteUpload(c: CaseRow, orgId: string, pathname: string, hash: string | null): Promise<TokenCheck> {
  if (!pathInCase(pathname, orgId, c.id)) return { ok: false, reason: "path" };
  if (await locked(c)) return { ok: false, reason: "status" }; // registering would be refused: the file is not uploaded at all
  if (hash && !/^[0-9a-f]{64}$/.test(hash)) return { ok: false, reason: "path" };
  if (hash) {
    const [dup] = await db.select({ id: P.id }).from(P).where(and(eq(P.caseId, c.id), eq(P.contentHash, hash))).limit(1);
    if (dup) return { ok: false, reason: "duplicate" };
  }
  const [used] = await db.select({ id: P.id }).from(P)
    .where(and(eq(P.caseId, c.id), sql`(${P.blobPath} = ${pathname} OR ${P.thumbPath} = ${pathname})`)).limit(1);
  if (used) return { ok: false, reason: "taken" }; // a stored photo is never replaced
  const n = rowsOf<{ photos: number; waiting: number }>(await db.execute(sql`
    SELECT (SELECT count(*) FROM case_photos WHERE case_id = ${c.id})::int AS photos,
           (SELECT count(*) FROM photo_uploads WHERE case_id = ${c.id})::int AS waiting`))[0];
  if (n && Number(n.photos) + Math.ceil(Number(n.waiting) / 2) >= MAX_PHOTOS + MAX_REGISTER) return { ok: false, reason: "limit" };
  await db.execute(sql`INSERT INTO photo_uploads (path, case_id) VALUES (${pathname}, ${c.id}) ON CONFLICT (path) DO UPDATE SET created_at = now()`);
  return { ok: true };
}

type RegisterItem = { blobPath: string; thumbPath: string; name: string; size: number; hash: string | null };
function parseItem(v: unknown, orgId: string, caseId: string): RegisterItem | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (!pathInCase(o.blobPath, orgId, caseId) || !pathInCase(o.thumbPath, orgId, caseId) || o.blobPath === o.thumbPath) return null;
  if (typeof o.name !== "string" || typeof o.size !== "number" || !Number.isFinite(o.size) || o.size < 0) return null;
  const hash = typeof o.hash === "string" && /^[0-9a-f]{64}$/.test(o.hash) ? o.hash : null;
  // eslint-disable-next-line no-control-regex
  const name = o.name.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 200) || "photo";
  return { blobPath: o.blobPath, thumbPath: o.thumbPath, name, size: Math.floor(o.size), hash };
}
const isUnique = (e: unknown) => {
  const c = (e as { code?: string; cause?: { code?: string } }) ?? {};
  return c.code === "23505" || c.cause?.code === "23505";
};

export async function registerPhotos(c: CaseRow, orgId: string, raw: unknown): Promise<Result> {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > MAX_REGISTER) return fail(400, "invalid");
  if (await locked(c)) return fail(409, "status");
  const rejected: string[] = [];
  const duplicates: string[] = [];
  let items: RegisterItem[] = [];
  for (const v of raw) {
    const it = parseItem(v, orgId, c.id);
    if (it) items.push(it);
    else rejected.push(typeof (v as { name?: unknown })?.name === "string" ? String((v as { name: string }).name).slice(0, 200) : "?");
  }
  // every path must have been handed out by the token route for this case, and the blobs must be there
  const paths = items.flatMap((i) => [i.blobPath, i.thumbPath]);
  const noted = new Set(paths.length
    ? (await db.select({ path: schema.photoUploads.path }).from(schema.photoUploads)
        .where(and(eq(schema.photoUploads.caseId, c.id), inArray(schema.photoUploads.path, paths)))).map((r) => r.path)
    : []);
  // A retry (the answer was lost, or the first try stopped half-way): the photo is already stored under this very path. That is a
  // success, not a duplicate and not a failure: the photo comes back as added, and what the first try left undone is done below.
  const stored = new Set(items.length
    ? (await db.select({ b: P.blobPath }).from(P).where(and(eq(P.caseId, c.id), inArray(P.blobPath, items.map((i) => i.blobPath))))).map((r) => r.b)
    : []);
  const present = await Promise.all(items.map(async (i) => stored.has(i.blobPath) ||
    (noted.has(i.blobPath) && noted.has(i.thumbPath) && (await photoExists(i.blobPath)) && (await photoExists(i.thumbPath)))));
  items = items.filter((i, k) => { if (!present[k]) rejected.push(i.name); return present[k]; });
  const again = new Map<string, RegisterItem>(); // by path: the same entry twice in one request is one photo
  items = items.filter((i) => { if (!stored.has(i.blobPath)) return true; again.set(i.blobPath, i); return false; });

  let added: PhotoRow[] = [];
  const strays: string[] = []; // blobs of identical files: not kept
  for (let attempt = 0; attempt < 3 && items.length; attempt++) {
    const have = await db.select({ hash: P.contentHash, blobPath: P.blobPath, origN: P.origN, position: P.position }).from(P).where(eq(P.caseId, c.id));
    const hashes = new Set(have.map((h) => h.hash).filter(Boolean) as string[]);
    const inCase = new Set(have.map((h) => h.blobPath));
    const taken = new Set<string>();
    const fresh: RegisterItem[] = [];
    for (const it of items) {
      // stored since the look above: the first try of this same upload (a retry that overlaps it) wrote it meanwhile. Same path = same upload.
      if (inCase.has(it.blobPath)) { again.set(it.blobPath, it); continue; }
      if (taken.has(it.blobPath)) { duplicates.push(it.name); continue; }
      taken.add(it.blobPath); // the same entry twice in one request is one photo
      if (it.hash && hashes.has(it.hash)) { duplicates.push(it.name); strays.push(it.blobPath, it.thumbPath); continue; }
      if (it.hash) hashes.add(it.hash);
      fresh.push(it);
    }
    items = fresh;
    if (!items.length) break;
    if (have.length + items.length > MAX_PHOTOS) return fail(400, "limit", { max: MAX_PHOTOS });
    const baseN = have.reduce((m, h) => Math.max(m, h.origN), 0);
    const basePos = have.reduce((m, h) => Math.max(m, h.position + 1), 0);
    try {
      added = await db.insert(P).values(items.map((it, k) => ({
        caseId: c.id, origN: baseN + 1 + k, position: basePos + k, srcName: it.name,
        blobPath: it.blobPath, thumbPath: it.thumbPath, contentHash: it.hash, nameState: "pending",
      }))).returning();
      break;
    } catch (e) {
      if (!isUnique(e) || attempt === 2) throw e; // another tab registered at the same moment: look again
    }
  }

  // The file rows are written last, so a stored photo without one marks a first try that stopped before the steps below were done.
  const filed = new Set(again.size
    ? (await db.select({ u: schema.caseFiles.blobUrl }).from(schema.caseFiles)
        .where(and(eq(schema.caseFiles.caseId, c.id), eq(schema.caseFiles.kind, "photo"), inArray(schema.caseFiles.blobUrl, [...again.keys()])))).map((r) => r.u)
    : []);
  const toFile = [...(added.length ? items : []), ...[...again.values()].filter((i) => !filed.has(i.blobPath))];
  if (toFile.length) {
    const next = statusAfterRegister(c.status);
    if (next !== c.status) await db.update(schema.cases).set({ status: next }).where(and(eq(schema.cases.id, c.id), eq(schema.cases.status, c.status)));
    await clearDone(c.id);
    await db.execute(sql`UPDATE cases SET photos_arranged_at = NULL WHERE id = ${c.id}`); // new photos: the opening order is looked at again once they are named
    // One statement that skips a photo which already has its file row: a retry or a second tab that looked just before the
    // first try wrote the row cannot list the same photo twice.
    await db.execute(sql`
      INSERT INTO case_files (case_id, kind, blob_url, original_name, size)
      SELECT ${c.id}, 'photo', e.v->>'url', e.v->>'name', (e.v->>'size')::bigint
      FROM jsonb_array_elements(${JSON.stringify(toFile.map((it) => ({ url: it.blobPath, name: it.name, size: it.size })))}::jsonb) WITH ORDINALITY AS e(v, ord)
      WHERE NOT EXISTS (SELECT 1 FROM case_files f WHERE f.case_id = ${c.id} AND f.kind = 'photo' AND f.blob_url = e.v->>'url')
      ORDER BY e.ord`);
    // Two tries that wrote at the very same moment could not see each other's row. Each one tidies up after its own write and
    // keeps the oldest row, so whichever finishes last leaves exactly one.
    await db.execute(sql`
      DELETE FROM case_files f USING case_files g
      WHERE f.case_id = ${c.id} AND g.case_id = ${c.id} AND f.kind = 'photo' AND g.kind = 'photo'
        AND f.blob_url = g.blob_url AND f.id > g.id AND f.blob_url IN (${sql.join(toFile.map((it) => sql`${it.blobPath}`), sql`, `)})`);
  }
  const consumed = [...[...items, ...again.values()].flatMap((i) => [i.blobPath, i.thumbPath]), ...strays];
  if (consumed.length) await db.delete(schema.photoUploads).where(and(eq(schema.photoUploads.caseId, c.id), inArray(schema.photoUploads.path, consumed)));
  // the photos that were already stored come back as they are now (some were only found stored inside the loop above)
  const before = again.size
    ? await db.select().from(P).where(and(eq(P.caseId, c.id), inArray(P.blobPath, [...again.keys()]))).orderBy(asc(P.origN))
    : [];
  const all = [...before, ...added];
  // a file that a photo kept in this request points at is never cleaned up
  const kept = new Set(all.flatMap((p) => [p.blobPath, p.thumbPath]));
  await Promise.all([...new Set(strays)].filter((p) => !kept.has(p)).map((p) => deletePhoto(p).catch(() => {})));
  return ok({ added: all.map(photoDto), duplicates, rejected });
}

/** Deletes blobs that were uploaded but will not be registered. A path that belongs to a stored photo is refused. */
export async function discardPaths(c: CaseRow, orgId: string, raw: unknown): Promise<Result> {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > 80) return fail(400, "invalid");
  const good = raw.filter((p): p is string => pathInCase(p, orgId, c.id));
  const used = new Set<string>();
  if (good.length) {
    const rows = await db.select({ b: P.blobPath, t: P.thumbPath }).from(P)
      .where(and(eq(P.caseId, c.id), sql`(${inArray(P.blobPath, good)} OR ${inArray(P.thumbPath, good)})`));
    for (const r of rows) { used.add(r.b); used.add(r.t); }
  }
  const deleted: string[] = [];
  const rejected: string[] = raw.filter((p) => !good.includes(p as string)).map((p) => String(p).slice(0, 200));
  for (const p of good) {
    if (used.has(p)) { rejected.push(p); continue; }
    await deletePhoto(p);
    deleted.push(p);
  }
  if (deleted.length) await db.delete(schema.photoUploads).where(and(eq(schema.photoUploads.caseId, c.id), inArray(schema.photoUploads.path, deleted)));
  return ok({ deleted, rejected });
}

/** Removes uploads of this case that were never registered and are older than a day. Best effort, at most 50 and 2 s. */
export async function sweepUploads(caseId: string): Promise<{ removed: number; failed: number }> {
  const until = Date.now() + 2000;
  const old = await db.select({ path: schema.photoUploads.path }).from(schema.photoUploads)
    .where(and(eq(schema.photoUploads.caseId, caseId), sql`${schema.photoUploads.createdAt} < now() - interval '24 hours'`)).limit(50);
  if (!old.length) return { removed: 0, failed: 0 };
  const paths = old.map((o) => o.path);
  const rows = await db.select({ b: P.blobPath, t: P.thumbPath }).from(P)
    .where(and(eq(P.caseId, caseId), sql`(${inArray(P.blobPath, paths)} OR ${inArray(P.thumbPath, paths)})`));
  const used = new Set(rows.flatMap((r) => [r.b, r.t]));
  const gone: string[] = [];
  let failed = 0;
  for (const p of paths) {
    if (Date.now() > until) break;
    if (used.has(p)) { gone.push(p); continue; } // registered after all: only the note goes
    try { await deletePhoto(p); gone.push(p); } catch { failed++; }
  }
  if (gone.length) await db.delete(schema.photoUploads).where(inArray(schema.photoUploads.path, gone));
  return { removed: gone.length, failed };
}

// ---- naming slices ----
export type Claimed = { id: number; claimedAt: string };
/**
 * Takes up to `limit` photos that still need a name, in display order, in ONE statement (the HTTP driver has no
 * multi-statement transactions). Rows left "running" for over 6 minutes are taken again. Two callers get different rows.
 */
export async function claimSlice(caseId: string, limit = SLICE): Promise<Claimed[]> {
  const r = await db.execute(sql`
    UPDATE case_photos SET name_state = 'running', claimed_at = now()
    WHERE id IN (
      SELECT id FROM case_photos
      WHERE case_id = ${caseId} AND (name_state = 'pending' OR (name_state = 'running' AND claimed_at < now() - interval '6 minutes'))
      ORDER BY position, id LIMIT ${limit} FOR UPDATE SKIP LOCKED)
    RETURNING id, position, claimed_at::text AS claimed_at`);
  // the database hands the changed rows back in no promised order: put them in display order here
  return rowsOf<{ id: number; position: number; claimed_at: string }>(r)
    .sort((a, b) => Number(a.position) - Number(b.position) || Number(a.id) - Number(b.id))
    .map((x) => ({ id: Number(x.id), claimedAt: x.claimed_at }));
}

/** Writes one answer. A row that was taken again in the meantime (or already answered) is left alone. */
export async function writeName(c: Claimed, v: { modelName: string | null; confidence: number | null; alts: string[]; how: string }): Promise<boolean> {
  const r = await db.execute(sql`
    UPDATE case_photos SET name_state = 'named', model_name = ${v.modelName}, confidence = ${v.confidence == null ? null : v.confidence.toFixed(4)},
      alts = ${JSON.stringify(v.alts)}::jsonb, how = ${v.how}, name_error = NULL, named_at = now()
    WHERE id = ${c.id} AND name_state = 'running' AND claimed_at = ${c.claimedAt}::timestamptz RETURNING id`);
  return rowsOf(r).length > 0;
}
export async function writeFailed(claimed: Claimed[], message: string): Promise<void> {
  for (const c of claimed) {
    await db.execute(sql`
      UPDATE case_photos SET name_state = 'failed', name_error = ${message.slice(0, 200)}
      WHERE id = ${c.id} AND name_state = 'running' AND claimed_at = ${c.claimedAt}::timestamptz`);
  }
}
/** PHOTO_WORKER=on: photos the on-site model gave up on go to Claude. A photo Claude itself failed on waits for the page's own retry. */
export async function retryWorkerFailed(caseId: string): Promise<void> {
  await db.update(P).set({ nameState: "pending", nameError: null, claimedAt: null })
    .where(and(eq(P.caseId, caseId), eq(P.nameState, "failed"), isNull(P.finalName), sql`${P.nameError} LIKE 'worker:%'`));
}
export async function retryFailed(caseId: string): Promise<void> {
  // a photo the adjuster has named by hand in the meantime is not sent to the model again
  await db.update(P).set({ nameState: "pending", nameError: null, claimedAt: null }).where(and(eq(P.caseId, caseId), eq(P.nameState, "failed"), isNull(P.finalName)));
}
export async function failPending(caseId: string, message: string): Promise<number> {
  const r = await db.update(P).set({ nameState: "failed", nameError: message }).where(and(eq(P.caseId, caseId), eq(P.nameState, "pending"))).returning({ id: P.id });
  return r.length;
}
export async function pendingCount(caseId: string): Promise<number> {
  const r = await db.execute(sql`SELECT count(*)::int AS n FROM case_photos WHERE case_id = ${caseId} AND name_state IN ('pending', 'running')`);
  return Number(rowsOf<{ n: number }>(r)[0]?.n ?? 0);
}
/** What naming the photos of this case has cost so far. Naming calls only: the document read is not part of the photo cap. */
export async function spentUsd(caseId: string): Promise<number> {
  const r = await db.execute(sql`SELECT COALESCE(sum(cost_usd), 0)::float8 AS usd FROM llm_calls WHERE case_id = ${caseId} AND purpose = 'name_photos'`);
  return Number(rowsOf<{ usd: number }>(r)[0]?.usd ?? 0);
}

/** Pathname of one photo of this case, or null. */
export async function photoPathOf(c: CaseRow, photoId: number, size: "s" | "full"): Promise<string | null> {
  if (!Number.isInteger(photoId)) return null;
  const [p] = await db.select({ b: P.blobPath, t: P.thumbPath }).from(P).where(and(eq(P.id, photoId), eq(P.caseId, c.id))).limit(1);
  if (!p) return null;
  return (size === "s" ? p.t : p.b) || null;
}
