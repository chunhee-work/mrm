import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { photoRoute } from "@/lib/photos/route";
import { openPhoto } from "@/lib/photos/store";
import { climbs, ownBlobPath } from "@/lib/blob-url";

// Opens one file the user uploaded to a case (PDF, photo, zip), straight from the PRIVATE store. No public URL exists.
// `photoRoute` has already checked the session, the organisation and that the case belongs to it; here the file must
// also belong to that case and sit under that organisation's folder in the store.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// The type sent to the browser is decided here, from the file name only: what the store or the uploader says is never
// trusted. Only these open in the browser; anything else (a zip, an unknown type) is offered as a download.
const INLINE: Record<string, string> = { pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };

/** A store path or blob URL of this organisation; anything else is never fetched. Dots inside a file name are fine, a ".." folder step is not. */
function ownPath(p: string, orgId: string) {
  if (!/^https?:/i.test(p)) return !climbs(p) && p.startsWith(`${orgId}/`);
  return ownBlobPath(p, orgId) !== null;
}

export const GET = photoRoute("cases.file", async ({ c, me, params }) => {
  const fileId = Number(params.fileId);
  if (!Number.isInteger(fileId) || fileId <= 0) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const [f] = await db.select({ blobUrl: schema.caseFiles.blobUrl, name: schema.caseFiles.originalName })
    .from(schema.caseFiles).where(and(eq(schema.caseFiles.id, fileId), eq(schema.caseFiles.caseId, c.id))).limit(1);
  if (!f || !ownPath(f.blobUrl, me.orgId)) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const o = await openPhoto(f.blobUrl);
  if (!o) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const type = INLINE[f.name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? ""];
  // the name goes out twice: plain ASCII for old browsers, the real name (any language) in the RFC 5987 form
  const ascii = f.name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return new Response(o.body as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": type ?? "application/octet-stream",
      "Content-Disposition": `${type ? "inline" : "attachment"}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(f.name)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
});
