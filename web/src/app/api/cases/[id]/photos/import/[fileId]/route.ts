import { NextResponse } from "next/server";
import { get } from "@vercel/blob";
import { photoRoute } from "@/lib/photos/route";
import { fileBlobUrl, markImported } from "@/lib/photos/server";
import { openPhoto } from "@/lib/photos/store";

// Taking the photos of the case upload (loose photos, zip bundles) onto the desk. The browser asks for the file here, because the
// store is private; the session, the organisation and "this file belongs to this case" are checked on every request.
export const GET = photoRoute("photos.import.read", async ({ c, params }) => {
  const f = await fileBlobUrl(c.id, Number(params.fileId));
  if (!f) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Type": "application/octet-stream" };
  if (!/^https:/.test(f.url)) { // local test store only (PHOTO_STORE_DIR, never in production)
    const o = await openPhoto(f.url);
    return o ? new Response(o.body as BodyInit, { status: 200, headers }) : NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const r = await get(f.url, { access: "private" });
  if (!r || r.statusCode !== 200) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return new Response(r.stream, { status: 200, headers });
});

/** The browser reports that every photo of this file is on the desk (or was already there). */
export const POST = photoRoute("photos.import.done", async ({ c, params }) => {
  const ok = await markImported(c.id, Number(params.fileId));
  return { status: ok ? 200 : 404, body: ok ? {} : { error: "not_found" } };
});
