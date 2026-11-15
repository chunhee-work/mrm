import { bodyOf, photoRoute } from "@/lib/photos/route";
import { discardPaths } from "@/lib/photos/server";

export const POST = photoRoute("photos.discard", async ({ req, c, me }) => discardPaths(c, me.orgId, (await bodyOf(req)).paths));
