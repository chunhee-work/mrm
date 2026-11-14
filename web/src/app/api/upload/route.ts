import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { getUserOrNull } from "@/lib/session";

// Client-side upload token. Files go straight to (private) Vercel Blob under the org's prefix.
export async function POST(req: Request) {
  const me = await getUserOrNull();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = (await req.json()) as HandleUploadBody;
  try {
    const res = await handleUpload({
      body, request: req,
      onBeforeGenerateToken: async (pathname) => {
        if (!pathname.startsWith(`${me.orgId}/`)) throw new Error("bad path");
        return {
          allowedContentTypes: ["application/zip", "application/x-zip-compressed", "application/pdf", "image/jpeg", "image/png", "image/webp", "image/heic"],
          maximumSizeInBytes: 500 * 1024 * 1024,
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
