import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { UPLOAD_TYPES, MAX_FILE_BYTES } from "@/lib/case-body";
import { getUserOrNull } from "@/lib/session";

// Client-side upload token. Files go straight to (private) Vercel Blob under the org's prefix.
export async function POST(req: Request) {
  const me = await getUserOrNull();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as HandleUploadBody | null;
  if (!body) return NextResponse.json({ error: "invalid" }, { status: 400 });
  try {
    const res = await handleUpload({
      body, request: req,
      onBeforeGenerateToken: async (pathname) => {
        if (!pathname.startsWith(`${me.orgId}/`)) throw new Error("bad path");
        return {
          allowedContentTypes: UPLOAD_TYPES,
          maximumSizeInBytes: MAX_FILE_BYTES,
          addRandomSuffix: true,
        };
      },
      // No onUploadCompleted on purpose: with it, the file store calls this route back after every upload. That call carries no
      // sign-in, so it was answered 401 and filled the logs with errors. Nothing here needs to know that an upload finished
      // (the browser sends the stored URLs with the case), and without it the token asks for no call back.
    });
    return NextResponse.json(res);
  } catch (e) {
    // the reason stays in the server log; the browser only shows "upload failed" for any refusal here
    console.error("upload token refused:", (e as Error)?.name, String((e as Error)?.message ?? "").slice(0, 200));
    return NextResponse.json({ error: "refused" }, { status: 400 });
  }
}
