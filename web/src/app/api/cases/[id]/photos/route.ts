import { after } from "next/server";
import { bodyOf, photoRoute } from "@/lib/photos/route";
import { photoState, registerPhotos, sweepUploads } from "@/lib/photos/server";

export const GET = photoRoute("photos.state", async ({ c }) => {
  after(async () => {
    try {
      const r = await sweepUploads(c.id);
      if (r.failed) console.error(`cleanup failed: ${r.failed}`);
    } catch { console.error("cleanup failed: 1"); }
  });
  return photoState(c);
});

export const POST = photoRoute("photos.register", async ({ req, c, me }) => registerPhotos(c, me.orgId, (await bodyOf(req)).photos));
