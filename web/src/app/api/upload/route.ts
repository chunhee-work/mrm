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
      onUploadCompleted: async () => {},
    });
    return NextResponse.json(res);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
