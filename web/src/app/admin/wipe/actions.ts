"use server";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin/auth";
import { wipeUser } from "@/lib/admin/wipe-user";
import { deletePhoto, listPrefix } from "@/lib/photos/store";

/** The one button that erases a person. Admin only (checked here again, not just by the page), and the e-mail must be typed twice. */
export async function wipeAction(form: FormData) {
  await requireAdmin();
  const email = String(form.get("email") ?? "");
  const confirm = String(form.get("confirm") ?? "");
  const r = await wipeUser(email, confirm, { remove: deletePhoto, listPrefix }).catch((e) => { console.error("wipe failed", e); return { ok: false as const, reason: "error" as const }; });
  const q = new URLSearchParams({ email });
  if (r.ok) redirect(`/admin/wipe?${new URLSearchParams({ done: "1", cases: String(r.counts.cases), files: String(r.removedFiles), left: String(r.leftFiles) })}`);
  q.set("err", r.reason);
  redirect(`/admin/wipe?${q}`);
}
