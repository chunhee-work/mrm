import { handlers } from "@/lib/screenshots/server";

// Streams one picture from the PRIVATE Blob store, only to the user who submitted the case. No public URL exists.
export const dynamic = "force-dynamic";
export async function GET(_req: Request, ctx: { params: Promise<{ id: string; shotId: string }> }) {
  const { id, shotId } = await ctx.params;
  return handlers.image(id, shotId);
}
