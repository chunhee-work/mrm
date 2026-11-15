import { bodyOf, photoRoute } from "@/lib/photos/route";
import { renamePhoto } from "@/lib/photos/server";

export const PATCH = photoRoute("photos.rename", async ({ req, c, params }) => {
  const b = await bodyOf(req);
  return renamePhoto(c, Number(params.photoId), b.finalName, b.version);
});
