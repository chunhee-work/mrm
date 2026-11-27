import { NextResponse } from "next/server";
import { getUserOrNull } from "@/lib/session";
import { deleteCase } from "@/lib/case-delete";

// DELETE /api/cases/:id — the user deletes one of their organisation's cases from the case list (soft delete, see lib/case-delete).
// 404: not found (also another organisation's case). 409: the worker has it or it was sent to Merimen.
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await getUserOrNull();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  if (!id || id.length > 64) return NextResponse.json({ error: "not found" }, { status: 404 });
  const r = await deleteCase(me.orgId, me.user.id, id).catch(() => null);
  if (!r) return NextResponse.json({ error: "failed" }, { status: 500 });
  if (!r.ok) return NextResponse.json({ error: r.reason === "busy" ? "busy" : "not found" }, { status: r.reason === "busy" ? 409 : 404 });
  return NextResponse.json({ ok: true, refunded: r.refunded });
}
