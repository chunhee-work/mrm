// Daily (vercel.json crons): removes the files of cases the user deleted more than 7 days ago. Vercel calls it with `Authorization: Bearer $CRON_SECRET`.
import { NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { purgeDeletedCases } from "@/lib/purge-deleted-cases";
import { deletePhoto } from "@/lib/photos/store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const got = req.headers.get("authorization") ?? "";
  const dig = (v: string) => createHash("sha256").update(v).digest();
  if (!secret || !timingSafeEqual(dig(got), dig(`Bearer ${secret}`))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const r = await purgeDeletedCases(deletePhoto).catch((e) => { console.error("purge run failed", e); return null; });
  if (!r) return NextResponse.json({ error: "failed" }, { status: 500 });
  return NextResponse.json(r);
}
