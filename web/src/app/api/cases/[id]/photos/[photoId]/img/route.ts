import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { photoRoute } from "@/lib/photos/route";
import { photoPathOf } from "@/lib/photos/server";
import { openPhoto } from "@/lib/photos/store";

// The only way a photo reaches the browser. The session and organisation are checked on every request:
// the browser has to ask again each time (no-cache + ETag), so a signed-out or removed member gets nothing from cache.
export const GET = photoRoute("photos.img", async ({ req, c, params }) => {
  const size = new URL(req.url).searchParams.get("size") === "full" ? "full" : "s";
  const path = await photoPathOf(c, Number(params.photoId), size);
  if (!path) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const etag = `"${createHash("sha256").update(path).digest("hex").slice(0, 24)}"`;
  const headers = { "Cache-Control": "private, no-cache", ETag: etag, "X-Content-Type-Options": "nosniff" };
  if (req.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers });
  const o = await openPhoto(path);
  if (!o) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const type = /^image\/(jpeg|png|webp)$/.test(o.contentType) ? o.contentType : "image/jpeg";
  return new Response(o.body as BodyInit, { status: 200, headers: { ...headers, "Content-Type": type } });
});
