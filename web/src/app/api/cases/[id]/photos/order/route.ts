import { bodyOf, photoRoute } from "@/lib/photos/route";
import { reorderPhotos } from "@/lib/photos/server";

export const PUT = photoRoute("photos.order", async ({ req, c }) => {
  const b = await bodyOf(req);
  return reorderPhotos(c, b.ids, b.rev);
});
