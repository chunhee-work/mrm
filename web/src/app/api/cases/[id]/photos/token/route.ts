import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { photoRoute } from "@/lib/photos/route";
import { IMAGE_TYPES, MAX_BYTES } from "@/lib/photos/rules";
import { noteUpload } from "@/lib/photos/server";

// Upload token for one photo file. The browser sends the file straight to the private store, under this case's prefix.
export const POST = photoRoute("photos.token", async ({ req, c, me }) => {
  const body = (await req.json()) as HandleUploadBody;
  let refused: string | null = null;
  try {
    const res = await handleUpload({
      body, request: req,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        let hash: string | null = null;
        try { const h = (JSON.parse(clientPayload || "{}") as { hash?: unknown }).hash; hash = typeof h === "string" ? h : null; } catch { /* no hash */ }
        const check = await noteUpload(c, me.orgId, pathname, hash);
        if (!check.ok) { refused = check.reason; throw new Error(check.reason); }
        return { allowedContentTypes: [...IMAGE_TYPES], maximumSizeInBytes: MAX_BYTES, addRandomSuffix: false, allowOverwrite: true };
      },
      onUploadCompleted: async () => {},
    });
    return NextResponse.json(res);
  } catch (e) {
    if (refused) return NextResponse.json({ error: refused }, { status: refused === "duplicate" ? 409 : 400 });
    throw e;
  }
});
