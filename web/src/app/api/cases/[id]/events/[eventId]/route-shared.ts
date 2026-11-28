import { NextResponse } from "next/server";
import { getUserOrNull } from "@/lib/session";
import { eventIdOf, setEventHidden } from "@/lib/case-events";

type Ctx = { params: Promise<{ id: string; eventId: string }> };

/** 401 not signed in; 404 a bad id, a line of another case, another organisation's or a deleted case; else 200 (also when nothing changed). */
export function eventRoute(hide: boolean) {
  return async function (_req: Request, ctx: Ctx) {
    const me = await getUserOrNull();
    if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    const { id, eventId } = await ctx.params;
    const ev = eventIdOf(eventId);
    if (!id || id.length > 64 || ev === null) return NextResponse.json({ error: "not found" }, { status: 404 });
    const ok = await setEventHidden(me.orgId, me.user.id, id, ev, hide).catch((e) => { console.error("hide event failed", id, ev, e); return null; });
    if (ok === null) return NextResponse.json({ error: "failed" }, { status: 500 });
    if (!ok) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  };
}
