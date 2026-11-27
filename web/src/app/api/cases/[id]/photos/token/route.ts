import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { photoRoute } from "@/lib/photos/route";
import { IMAGE_TYPES, MAX_BYTES } from "@/lib/photos/rules";
import { noteUpload } from "@/lib/photos/server";
import { takeUploadToken } from "@/lib/upload-cap";

const TOKEN_MS = 3 * 60_000; // how long one photo upload token works (one try of the page ends after 2 minutes)

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
        // S-U9: so many tokens per organisation and hour (upload-cap.ts), counted before anything else is looked up
        if (!(await takeUploadToken(me.orgId, "photo"))) { refused = "too_many"; throw new Error(refused); }
        const check = await noteUpload(c, me.orgId, pathname, hash);
        if (!check.ok) { refused = check.reason; throw new Error(check.reason); }
        // Overwrite stays on so a retry of the same file works, and a path that already belongs to a stored photo is refused
        // above ("taken"). S-P12: the token lives only as long as one try needs. The page gives a try up after 2 minutes and
        // asks for a new token for the next one, so 3 minutes is enough; at 10, a token got just before the photo was stored
        // could still put another picture under the stored photo's path for most of that time.
        return { allowedContentTypes: [...IMAGE_TYPES], maximumSizeInBytes: MAX_BYTES, addRandomSuffix: false, allowOverwrite: true, validUntil: Date.now() + TOKEN_MS };
      },
      // No onUploadCompleted: with one, every token tells the store to call this address after the upload. That call has no
      // session, so it got 401 each time and filled the log. Nothing here needs it: the page registers the photo itself.
    });
    return NextResponse.json(res);
  } catch (e) {
    if (refused) return NextResponse.json({ error: refused }, { status: refused === "duplicate" ? 409 : refused === "too_many" ? 429 : 400 });
    throw e;
  }
});
