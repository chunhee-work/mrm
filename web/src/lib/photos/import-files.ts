import "server-only";
import { createHash } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { get } from "@vercel/blob";
import sharp from "sharp";
import { db, schema } from "@/db";
import { MAX_BYTES, MAX_PHOTOS, photoPath } from "./rules";
import { savePhoto } from "./store";

/**
 * Photos that came in with the case upload (loose images or from a zip) are only `case_files` rows. The photo naming desk reads
 * `case_photos`, so this adds each one there: a ~900 px copy plus the original, in the desk's private store. Safe to repeat
 * (identical content is skipped by hash). HEIC and files over the size cap are left out and reported. Returns counts.
 */
export async function importCasePhotos(caseId: string, orgId: string): Promise<{ added: number; skipped: string[] }> {
  const files = (await db.select().from(schema.caseFiles).where(and(eq(schema.caseFiles.caseId, caseId), eq(schema.caseFiles.kind, "photo"))))
    .filter((f) => !f.blobUrl.startsWith(`${orgId}/${caseId}/photos/`)); // desk uploads are already on the desk
  const have = await db.select({ hash: schema.casePhotos.contentHash, n: schema.casePhotos.origN, pos: schema.casePhotos.position }).from(schema.casePhotos).where(eq(schema.casePhotos.caseId, caseId));
  const hashes = new Set(have.map((h) => h.hash).filter(Boolean) as string[]);
  let n = have.reduce((m, h) => Math.max(m, h.n), 0);
  let pos = have.reduce((m, h) => Math.max(m, h.pos + 1), 0);
  let count = have.length;
  const skipped: string[] = [];
  let added = 0;
  for (const f of files) {
    if (/\.(heic|heif)$/i.test(f.originalName) || f.size > MAX_BYTES || count >= MAX_PHOTOS) { skipped.push(f.originalName); continue; }
    try {
      const r = await get(f.blobUrl, { access: "private" });
      if (!r || r.statusCode !== 200) { skipped.push(f.originalName); continue; }
      const bytes = Buffer.from(await new Response(r.stream).arrayBuffer());
      const hash = createHash("sha256").update(bytes).digest("hex");
      if (hashes.has(hash)) continue; // the same picture twice is one photo
      const thumb = await sharp(bytes).rotate().resize({ width: 900, height: 900, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer();
      const type = r.blob.contentType?.startsWith("image/") ? r.blob.contentType : "image/jpeg";
      const id = hash.slice(0, 12);
      const blobPath = photoPath(orgId, caseId, id, "f", f.originalName);
      const thumbPath = photoPath(orgId, caseId, id, "s", f.originalName.replace(/\.[^.]+$/, "") + ".jpg");
      await savePhoto(thumbPath, thumb, "image/jpeg");
      await savePhoto(blobPath, bytes, type);
      await db.insert(schema.casePhotos).values({ caseId, origN: ++n, position: pos++, srcName: f.originalName.slice(0, 200), blobPath, thumbPath, contentHash: hash, nameState: "pending" });
      hashes.add(hash); count++; added++;
    } catch {
      skipped.push(f.originalName); // not an image sharp can read: left out, the case still goes on
    }
  }
  return { added, skipped };
}
