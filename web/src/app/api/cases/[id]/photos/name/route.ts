import { NextResponse } from "next/server";
import { bodyOf, photoRoute } from "@/lib/photos/route";
import { runSlice } from "@/lib/photos/name-photos";

export const maxDuration = 300;

// Names one slice of photos. The page keeps calling this while photos are waiting.
export const POST = photoRoute("photos.name", async ({ req, c }) => {
  const b = await bodyOf(req);
  return NextResponse.json(await runSlice(c, { retryFailed: b.retryFailed === true }));
});
