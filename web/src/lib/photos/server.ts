import "server-only";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import {
  canonName, doneBlock, isPermutation, pathInCase, statusAfterRegister,
  MAX_PHOTOS, MAX_REGISTER, SLICE,
} from "./rules";
import { deletePhoto, photoExists } from "./store";

// Database side of the photo naming desk (plan #9). Every function takes a case that the caller already
// checked against the signed-in member's organisation (see caseInOrg), so nothing here trusts an id from the client.

export type CaseRow = typeof schema.cases.$inferSelect;
type PhotoRow = typeof schema.casePhotos.$inferSelect;
export type Result = { status: number; body: Record<string, unknown> };
const ok = (body: Record<string, unknown> = {}): Result => ({ status: 200, body });
const fail = (status: number, error: string, more: Record<string, unknown> = {}): Result => ({ status, body: { error, ...more } });

const P = schema.casePhotos;
const rowsOf = <T>(r: unknown) => ((r as { rows?: T[] }).rows ?? []) as T[];

export async function caseInOrg(orgId: string, caseId: string): Promise<CaseRow | null> {
  if (!caseId || caseId.length > 64) return null;
  const [c] = await db.select().from(schema.cases).where(and(eq(schema.cases.id, caseId), eq(schema.cases.orgId, orgId))).limit(1);
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

export async function photoState(c: CaseRow): Promise<Result> {
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

/** Any edit after "done" takes the tick away again (plan, section D). Status only moves back from phase_b. */
export async function clearDone(caseId: string): Promise<boolean> {
  const r = await db.execute(sql`
    UPDATE cases SET photos_done_at = NULL, status = CASE WHEN status = 'phase_b' THEN 'waiting_user' ELSE status END
    WHERE id = ${caseId} AND photos_done_at IS NOT NULL RETURNING id`);
  if (!rowsOf(r).length) return false;
  await db.update(P).set({ confirmed: false }).where(eq(P.caseId, caseId));
  return true;
}

// ---- rename ----
export async function renamePhoto(c: CaseRow, photoId: number, rawName: unknown, version: unknown): Promise<Result> {
  if (!Number.isInteger(photoId) || !Number.isInteger(version)) return fail(400, "invalid");
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
  const current = (await db.select({ id: P.id }).from(P).where(eq(P.caseId, c.id))).map((r) => r.id);
  if (!isPermutation(current, ids)) return fail(409, "stale_order");
  const bumped = await db.execute(sql`UPDATE cases SET photos_rev = photos_rev + 1 WHERE id = ${c.id} AND photos_rev = ${rev as number} RETURNING photos_rev`);
  const next = rowsOf<{ photos_rev: number }>(bumped)[0];
  if (!next) return fail(409, "stale_order");
  await db.execute(sql`
    UPDATE case_photos p SET position = v.pos
    FROM (SELECT (e.value)::int AS id, (e.ordinality - 1)::int AS pos FROM jsonb_array_elements_text(${JSON.stringify(ids)}::jsonb) WITH ORDINALITY AS e(value, ordinality)) v
    WHERE p.id = v.id AND p.case_id = ${c.id}`);
  const cleared = await clearDone(c.id);
  return ok({ rev: Number(next.photos_rev), done: cleared ? false : c.photosDoneAt != null });
}

// ---- done ----
const DONE_FROM = new Set(["uploaded", "phase_a", "pending_doc", "waiting_user", "naming", "phase_b"]);
export async function setDone(c: CaseRow, done: unknown): Promise<Result> {
  if (typeof done !== "boolean") return fail(400, "invalid");
  if (!done) {
    await clearDone(c.id);
    const [now] = await db.select({ status: schema.cases.status }).from(schema.cases).where(eq(schema.cases.id, c.id));
    return ok({ done: false, status: now?.status ?? c.status });
  }
  if (!DONE_FROM.has(c.status)) return fail(409, "status");
  const photos = await db.select({ nameState: P.nameState, modelName: P.modelName, finalName: P.finalName }).from(P).where(eq(P.caseId, c.id));
  const block = doneBlock(photos);
  if (block) return fail(409, "blocked", block);
  const r = await db.execute(sql`
    UPDATE cases SET photos_done_at = COALESCE(photos_done_at, now()),
      status = CASE WHEN status IN ('waiting_user', 'naming') THEN 'phase_b' ELSE status END
    WHERE id = ${c.id} RETURNING status`);
  await db.update(P).set({ confirmed: true }).where(eq(P.caseId, c.id));
  return ok({ done: true, status: rowsOf<{ status: string }>(r)[0]?.status ?? c.status });
}

// ---- extras (parts with no photo) ----
export async function addExtra(c: CaseRow, rawName: unknown): Promise<Result> {
  const name = canonName(rawName);
  if (!name) return fail(400, "name");
  await db.execute(sql`INSERT INTO case_extras (case_id, name) VALUES (${c.id}, ${name}) ON CONFLICT (case_id, lower(name)) DO NOTHING`);
  const [row] = await db.select().from(schema.caseExtras)
    .where(and(eq(schema.caseExtras.caseId, c.id), sql`lower(${schema.caseExtras.name}) = lower(${name})`)).limit(1);
  if (!row) return fail(500, "server");
  await clearDone(c.id);
  return ok({ extra: { id: row.id, name: row.name } });
}
export async function removeExtra(c: CaseRow, extraId: number): Promise<Result> {
  if (!Number.isInteger(extraId)) return fail(400, "invalid");
  await db.delete(schema.caseExtras).where(and(eq(schema.caseExtras.id, extraId), eq(schema.caseExtras.caseId, c.id)));
  await clearDone(c.id);
  return ok({}); // already gone = success
}

// ---- uploads ----
export type TokenCheck = { ok: true } | { ok: false; reason: "path" | "duplicate" | "limit" | "taken" };
/** Run before an upload token is issued: the path is noted so a stray blob can be swept later (plan, AC). */
export async function noteUpload(c: CaseRow, orgId: string, pathname: string, hash: string | null): Promise<TokenCheck> {
  if (!pathInCase(pathname, orgId, c.id)) return { ok: false, reason: "path" };
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
  const present = await Promise.all(items.map(async (i) =>
    noted.has(i.blobPath) && noted.has(i.thumbPath) && (await photoExists(i.blobPath)) && (await photoExists(i.thumbPath))));
  items = items.filter((i, k) => { if (!present[k]) rejected.push(i.name); return present[k]; });

  let added: PhotoRow[] = [];
  const strays: string[] = []; // blobs of identical files: not kept
  for (let attempt = 0; attempt < 3 && items.length; attempt++) {
    const have = await db.select({ hash: P.contentHash, blobPath: P.blobPath, origN: P.origN, position: P.position }).from(P).where(eq(P.caseId, c.id));
    const hashes = new Set(have.map((h) => h.hash).filter(Boolean) as string[]);
    const taken = new Set(have.map((h) => h.blobPath));
    const fresh: RegisterItem[] = [];
    for (const it of items) {
      if (taken.has(it.blobPath)) { duplicates.push(it.name); continue; }
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

  if (added.length) {
    await db.insert(schema.caseFiles).values(items.map((it) => ({ caseId: c.id, kind: "photo", blobUrl: it.blobPath, originalName: it.name, size: it.size })));
    const next = statusAfterRegister(c.status);
    if (next !== c.status) await db.update(schema.cases).set({ status: next }).where(and(eq(schema.cases.id, c.id), eq(schema.cases.status, c.status)));
    await clearDone(c.id);
  }
  const consumed = [...items.flatMap((i) => [i.blobPath, i.thumbPath]), ...strays];
  if (consumed.length) await db.delete(schema.photoUploads).where(and(eq(schema.photoUploads.caseId, c.id), inArray(schema.photoUploads.path, consumed)));
  await Promise.all(strays.map((p) => deletePhoto(p).catch(() => {})));
  return ok({ added: added.map(photoDto), duplicates, rejected });
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
    RETURNING id, claimed_at::text AS claimed_at`);
  return rowsOf<{ id: number; claimed_at: string }>(r).map((x) => ({ id: Number(x.id), claimedAt: x.claimed_at }));
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
export async function retryFailed(caseId: string): Promise<void> {
  await db.update(P).set({ nameState: "pending", nameError: null, claimedAt: null }).where(and(eq(P.caseId, caseId), eq(P.nameState, "failed")));
}
export async function failPending(caseId: string, message: string): Promise<number> {
  const r = await db.update(P).set({ nameState: "failed", nameError: message }).where(and(eq(P.caseId, caseId), eq(P.nameState, "pending"))).returning({ id: P.id });
  return r.length;
}
export async function pendingCount(caseId: string): Promise<number> {
  const r = await db.execute(sql`SELECT count(*)::int AS n FROM case_photos WHERE case_id = ${caseId} AND name_state IN ('pending', 'running')`);
  return Number(rowsOf<{ n: number }>(r)[0]?.n ?? 0);
}
export async function spentUsd(caseId: string): Promise<number> {
  const r = await db.execute(sql`SELECT COALESCE(sum(cost_usd), 0)::float8 AS usd FROM usage WHERE case_id = ${caseId}`);
  return Number(rowsOf<{ usd: number }>(r)[0]?.usd ?? 0);
}

/** Pathname of one photo of this case, or null. */
export async function photoPathOf(c: CaseRow, photoId: number, size: "s" | "full"): Promise<string | null> {
  if (!Number.isInteger(photoId)) return null;
  const [p] = await db.select({ b: P.blobPath, t: P.thumbPath }).from(P).where(and(eq(P.id, photoId), eq(P.caseId, c.id))).limit(1);
  if (!p) return null;
  return (size === "s" ? p.t : p.b) || null;
}
