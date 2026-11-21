import "server-only";
import { and, eq } from "drizzle-orm";
import { get, put } from "@vercel/blob";
import { db, schema } from "@/db";
import { unzipBundle } from "@/lib/unzip-bundle";

/**
 * A `bundle_zip` case file is opened on the server: its PDFs and photos are stored as ordinary case files
 * (kind pdf / photo) so the reader and the photo desk see them. Safe to repeat: a zip that was already opened is skipped.
 * Throws a plain Error with a short reason when the zip is corrupt, empty or too large (the case then shows Failed).
 * Returns how many files were added.
 */
export async function expandBundles(caseId: string, orgId: string): Promise<number> {
  const rows = await db.select().from(schema.caseFiles).where(eq(schema.caseFiles.caseId, caseId));
  let added = 0;
  for (const z of rows.filter((r) => r.kind === "bundle_zip")) {
    const marker = `/unzipped-${z.id}/`;
    if (rows.some((r) => r.blobUrl.includes(marker))) continue;
    const r = await get(z.blobUrl, { access: "private" });
    if (!r || r.statusCode !== 200) throw new Error(`cannot download ${z.originalName}`);
    const bytes = new Uint8Array(await new Response(r.stream).arrayBuffer());
    let entries;
    try { entries = unzipBundle(bytes); } catch (e) { throw new Error(`${z.originalName}: ${(e as Error).message}`); }
    const seen = new Set<string>();
    for (const e of entries) {
      let name = e.name; // two folders may hold the same file name
      for (let n = 2; seen.has(name); n++) name = e.name.replace(/(\.[^.]+)?$/, `-${n}$1`);
      seen.add(name);
      const b = await put(`${orgId}/${caseId}${marker}${name}`, Buffer.from(e.bytes), { access: "private", contentType: e.type, addRandomSuffix: false, allowOverwrite: true });
      await db.insert(schema.caseFiles).values({ caseId, kind: e.kind, blobUrl: b.url, originalName: name, size: e.bytes.length });
      added++;
    }
    await db.insert(schema.caseEvents).values({ caseId, step: "read_docs", message: `Opened ${z.originalName}: ${entries.length} file(s)` });
  }
  return added;
}
