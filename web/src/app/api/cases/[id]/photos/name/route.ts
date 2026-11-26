import { NextResponse } from "next/server";
import { bodyOf, photoRoute } from "@/lib/photos/route";
import { runSlice } from "@/lib/photos/name-photos";
import { namingOwner, photoFallbackOn, photoWorkerOn } from "@/lib/photos/worker";
import { pendingCount, retryWorkerFailed } from "@/lib/photos/server";
import { workerFailedCount, workerOnline } from "@/lib/ext/worker-store";

export const maxDuration = 300;

// Names one slice of photos. The page keeps calling this while photos are waiting.
// PHOTO_WORKER=on leaves the photos for the on-site model. Claude is the fallback.
export const POST = photoRoute("photos.name", async ({ req, c, me }) => {
  const b = await bodyOf(req);
  const owner = namingOwner({
    photoWorker: photoWorkerOn(),
    workerOnline: photoWorkerOn() ? await workerOnline() : false,
    pending: photoWorkerOn() ? await pendingCount(c.id) : 0,
    workerFailed: photoWorkerOn() ? await workerFailedCount(c.id) : 0,
    fallback: photoFallbackOn(),
  });
  if (owner === "worker") {
    return NextResponse.json({ claimed: 0, named: 0, failed: 0, remaining: await pendingCount(c.id), capped: false, by: "worker" });
  }
  // Only what the on-site model gave up on. Claude's own failures wait for the page's retry (retryFailed below), so the
  // same failing photos are not sent again on every call.
  if (photoWorkerOn()) await retryWorkerFailed(c.id);
  return NextResponse.json(await runSlice(c, { retryFailed: b.retryFailed === true, userId: me.user.id }));
});
