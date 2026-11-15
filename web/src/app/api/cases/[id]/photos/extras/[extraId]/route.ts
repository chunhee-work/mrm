import { photoRoute } from "@/lib/photos/route";
import { removeExtra } from "@/lib/photos/server";

export const DELETE = photoRoute("photos.extra.remove", async ({ c, params }) => removeExtra(c, Number(params.extraId)));
