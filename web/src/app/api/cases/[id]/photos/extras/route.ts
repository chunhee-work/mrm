import { bodyOf, photoRoute } from "@/lib/photos/route";
import { addExtra } from "@/lib/photos/server";

export const POST = photoRoute("photos.extra.add", async ({ req, c }) => addExtra(c, (await bodyOf(req)).name));
