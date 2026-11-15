import { bodyOf, photoRoute } from "@/lib/photos/route";
import { setDone } from "@/lib/photos/server";

export const PUT = photoRoute("photos.done", async ({ req, c }) => setDone(c, (await bodyOf(req)).done));
