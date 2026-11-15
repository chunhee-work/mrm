import "server-only";
import { NextResponse } from "next/server";
import { getUserOrNull } from "@/lib/session";
import { logLine } from "./log";
import { caseInOrg, type CaseRow, type Result } from "./server";

type Me = NonNullable<Awaited<ReturnType<typeof getUserOrNull>>>;
type Ctx = { params: Promise<Record<string, string>> };
type Handler = (x: { req: Request; c: CaseRow; me: Me; params: Record<string, string> }) => Promise<Result | Response>;

/**
 * Every photo route goes through here: session, organisation membership (read from the database on each call) and
 * "this case belongs to that organisation" are checked first. Errors are logged as ids + error name only.
 */
export function photoRoute(route: string, fn: Handler) {
  return async (req: Request, ctx: Ctx): Promise<Response> => {
    const params = await ctx.params;
    try {
      const me = await getUserOrNull();
      if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
      const c = await caseInOrg(me.orgId, params.id);
      if (!c) return NextResponse.json({ error: "not_found" }, { status: 404 });
      const r = await fn({ req, c, me, params });
      return r instanceof Response ? r : NextResponse.json(r.body, { status: r.status });
    } catch (e) {
      console.error(logLine(route, { caseId: String(params.id).slice(0, 64), photoId: params.photoId?.slice(0, 20) }, e));
      return NextResponse.json({ error: "server" }, { status: 500 });
    }
  };
}
export const bodyOf = async (req: Request): Promise<Record<string, unknown>> => {
  const b = await req.json().catch(() => null);
  return b && typeof b === "object" && !Array.isArray(b) ? (b as Record<string, unknown>) : {};
};
