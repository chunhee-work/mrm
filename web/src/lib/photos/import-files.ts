import "server-only";
import { createHash } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { get } from "@vercel/blob";
import sharp from "sharp";
import { db, schema } from "@/db";
import { MAX_BYTES, MAX_PHOTOS, photoPath } from "./rules";
import { savePhoto } from "./store";
import { clearDone } from "./server";
import { runPool } from "@/lib/pool";

/** Why photos of the upload did not reach the naming desk, as counts: HEIC, over the size cap, past the photo limit, not a readable picture. */
export type LeftOut = { heic: number; big: number; limit: number; unreadable: number };
export type PhotoImport = { added: number; skipped: string[]; leftOut: LeftOut };

/**
 * Photos that came in with the case upload (loose images or from a zip) are only `case_files` rows. The photo naming desk reads
 * `case_photos`, so this adds each one there: a ~900 px copy plus the original, in the desk's private store. Safe to repeat
 * (identical content is skipped by hash). HEIC, files over the size cap, pictures that cannot be opened and photos past the
 * case's limit are left out and reported with the reason (the caller says it on the case's activity list). Returns counts.
 */
export async function importCasePhotos(caseId: string, orgId: string): Promise<PhotoImport> {
  const files = (await db.select().from(schema.caseFiles).where(and(eq(schema.caseFiles.caseId, caseId), eq(schema.caseFiles.kind, "photo"))))
    .filter((f) => !f.blobUrl.startsWith(`${orgId}/${caseId}/photos/`)) // desk uploads are already on the desk
    .sort((a, b) => a.originalName.localeCompare(b.originalName, "en", { numeric: true })); // R2-B09: by file name, not zip-entry order
  const have = await db.select({ hash: schema.casePhotos.contentHash, n: schema.casePhotos.origN, pos: schema.casePhotos.position }).from(schema.casePhotos).where(eq(schema.casePhotos.caseId, caseId));
  const hashes = new Set(have.map((h) => h.hash).filter(Boolean) as string[]);
  let n = have.reduce((m, h) => Math.max(m, h.n), 0);
  let pos = have.reduce((m, h) => Math.max(m, h.pos + 1), 0);
  const skipped: string[] = [];
  const leftOut: LeftOut = { heic: 0, big: 0, limit: 0, unreadable: 0 };
  const skip = (f: (typeof files)[number], why: keyof LeftOut) => { skipped.push(f.originalName); leftOut[why]++; };
  let added = 0;
  // R2-B14: the slow part (download, thumbnail, two stores) runs 8 photos at a time; the rows are written afterwards in name order
  type Done = { f: (typeof files)[number]; hash: string; blobPath: string; thumbPath: string } | null;
  const results: Done[] = new Array(files.length).fill(null);
  // P14: the limit counts photos that are really new. A file already on the desk (the same picture, known by its hash) takes
  // no place, so adding photos to a case that has some no longer drops the new ones early. Places are given out in name order.
  const room = Math.max(0, MAX_PHOTOS - have.length);
  let fresh = 0;
  const taken = new Set<string>(); // new pictures given a place in this run
  const decided: Promise<void>[] = []; // decided[i] resolves once file i has its place, or none
  await runPool(files.length, 8, async (i) => {
    const f = files[i];
    let done!: () => void;
    decided[i] = new Promise<void>((r) => { done = r; });
    try {
      if (/\.(heic|heif)$/i.test(f.originalName)) return skip(f, "heic");
      if (f.size > MAX_BYTES) return skip(f, "big");
      const r = await get(f.blobUrl, { access: "private" });
      if (!r || r.statusCode !== 200) return skip(f, "unreadable");
      const bytes = Buffer.from(await new Response(r.stream).arrayBuffer());
      const hash = createHash("sha256").update(bytes).digest("hex");
      if (hashes.has(hash)) return; // already on the desk: nothing to store again
      // Every place is taken already (places only ever fill up, in name order): no small copy is made for a photo that cannot
      // get one. Without this a case past the limit made a small copy of every extra photo again on each read.
      const full = fresh >= room;
      // a file that is no picture is only known as such here; it is reported below, after the limit, so the same file gets the
      // same reason on every read whether or not its small copy was tried
      const thumb = full ? null : await sharp(bytes).rotate().resize({ width: 900, height: 900, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer().catch(() => null);
      await decided[i - 1]; // the files before this one (by name) are placed first
      if (taken.has(hash)) return; // the same picture twice is one photo
      if (fresh >= room) return skip(f, "limit");
      if (!thumb) return skip(f, "unreadable");
      taken.add(hash); fresh++;
      done(); // the next file need not wait for the two stores below
      const type = r.blob.contentType?.startsWith("image/") ? r.blob.contentType : "image/jpeg";
      const id = hash.slice(0, 12);
      const name = f.originalName.replace(/\.{2,}/g, "."); // "IMG..1.jpg": a stored path never holds ".." (the desk refuses such paths)
      const blobPath = photoPath(orgId, caseId, id, "f", name);
      const thumbPath = photoPath(orgId, caseId, id, "s", name.replace(/\.[^.]+$/, "") + ".jpg");
      await savePhoto(thumbPath, thumb, "image/jpeg");
      await savePhoto(blobPath, bytes, type);
      results[i] = { f, hash, blobPath, thumbPath };
    } catch {
      skip(f, "unreadable"); // not an image sharp can read: left out, the case still goes on
    } finally {
      done();
    }
  });
  for (const d of results) {
    if (!d || hashes.has(d.hash)) continue; // the same picture twice is one photo
    await db.insert(schema.casePhotos).values({ caseId, origN: ++n, position: pos++, srcName: d.f.originalName.slice(0, 200), blobPath: d.blobPath, thumbPath: d.thumbPath, contentHash: d.hash, nameState: "pending" });
    hashes.add(d.hash); added++;
  }
  if (added) {
    // new photos to name, as with a desk upload: the opening order is looked at again and a 完成 already pressed is taken back
    await db.execute(sql`UPDATE cases SET photos_arranged_at = NULL WHERE id = ${caseId}`);
    await clearDone(caseId);
  }
  return { added, skipped, leftOut };
}
