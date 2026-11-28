import { NextResponse } from "next/server";
import { getUserOrNull } from "@/lib/session";
import { deleteCase } from "@/lib/case-delete";

// DELETE /api/cases/:id — the user deletes one of their organisation's cases from the case list (soft delete, see lib/case-delete).
// Only an open case that hit a problem on our side, with nothing running (plan #159, lib/case-delete).
// 404: not found (also another organisation's case). 409: a job is active (`busy`) or the case has no problem of ours (`not_allowed`).
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await getUserOrNull();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  if (!id || id.length > 64) return NextResponse.json({ error: "not found" }, { status: 404 });
  const r = await deleteCase(me.orgId, me.user.id, id).catch((e) => { console.error("delete case failed", id, e); return null; });
  if (!r) return NextResponse.json({ error: "failed" }, { status: 500 });
  if (!r.ok) return NextResponse.json({ error: r.reason === "not_found" ? "not found" : r.reason }, { status: r.reason === "not_found" ? 404 : 409 });
  return NextResponse.json({ ok: true, refunded: r.refunded });
}
