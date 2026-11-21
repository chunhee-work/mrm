import { handlers } from "@/lib/screenshots/server";

export const dynamic = "force-dynamic";
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handlers.list((await ctx.params).id);
}
