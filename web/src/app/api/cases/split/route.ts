import { NextResponse, after } from "next/server";
import { eq } from "drizzle-orm";
import { del, get, put } from "@vercel/blob";
import { z } from "zod";
import { db, schema } from "@/db";
import { getUserOrNull } from "@/lib/session";
import { planVehicles, unzipVehicle, ZipRejected } from "@/lib/unzip-bundle";
import { scanCase } from "@/lib/scan-case";
import { CASE_COST, debitCase, enforcing, exempt, refundCase } from "@/lib/payments/case-credit";
import { creditBalance } from "@/lib/payments/credit";
import { runPool } from "@/lib/pool";
import { MAX_FILE_BYTES } from "@/lib/upload-rules";
import { ZIP_WHY } from "@/lib/case-text";

export const maxDuration = 300; // the zip is opened and stored in this call; the reading of most cases starts later (see below)

const Body = z.object({ url: z.string().url().max(1000), name: z.string().trim().min(1).max(300), size: z.number().int().positive().max(MAX_FILE_BYTES) });
const READ_NOW = 3; // cases read right after the response; the rest are started by the dashboard / case page self-heal

/**
 * A zip holding several cars (plate-named folders, each with its own PDF) becomes one case per car: the folder name is the
 * plate, each case takes one credit, its PDFs and photos are stored as ordinary case files and it is read like any upload.
 *
 * Order: every limit is checked from the zip's file list first (nothing stored yet). Then, one car at a time, its files are
 * inflated and stored, and only then are its case row, credit and file rows written. On a thrown error every case made so far is
 * refunded and deleted and every stored blob removed. A function killed by the time limit can still leave the cars finished
 * before it (each complete and charged once) and blobs of the car in progress; nothing half-made is visible as a case.
 * On success the uploaded zip is deleted, so a repeated call finds nothing to split (502).
 */
export async function POST(req: Request) {
  const me = await getUserOrNull();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const { url, name } = parsed.data;
  let u: URL;
  try { u = new URL(url); } catch { return NextResponse.json({ error: "prefix" }, { status: 400 }); }
  const path = decodeURIComponent(u.pathname);
  if (u.protocol !== "https:" || !u.hostname.endsWith(".blob.vercel-storage.com") || !path.startsWith(`/${me.orgId}/`) || path.includes("..") || !/\.zip$/i.test(name))
    return NextResponse.json({ error: "prefix" }, { status: 400 });

  let buf: Uint8Array;
  try {
    const r = await get(url, { access: "private" });
    if (!r || r.statusCode !== 200) return NextResponse.json({ error: "download" }, { status: 502 });
    buf = new Uint8Array(await new Response(r.stream).arrayBuffer());
  } catch { return NextResponse.json({ error: "download" }, { status: 502 }); }

  let plan;
  try { plan = planVehicles(buf); }
  catch (e) { return NextResponse.json({ error: e instanceof ZipRejected ? e.code : "corrupt", why: e instanceof ZipRejected ? e.message : ZIP_WHY.corrupt }, { status: 422 }); }
  if (enforcing() && !exempt(me.orgId) && (await creditBalance(me.orgId)) < CASE_COST * plan.length) return NextResponse.json({ error: "no_credits", needed: plan.length }, { status: 402 });

  const ids: string[] = [];
  const stored: string[] = [];
  try {
    for (const v of plan) {
      const id = crypto.randomUUID();
      const entries = unzipVehicle(buf, v.prefix);
      const seen = new Set<string>();
      const names = entries.map((e) => { let n = e.name; for (let k = 2; seen.has(n); k++) n = e.name.replace(/(\.[^.]+)?$/, `-${k}$1`); seen.add(n); return n; });
      const rows: (typeof schema.caseFiles.$inferInsert)[] = new Array(entries.length);
      await runPool(entries.length, 4, async (i) => {
        const e = entries[i];
        const b = await put(`${me.orgId}/${id}/${names[i]}`, Buffer.from(e.bytes.buffer, e.bytes.byteOffset, e.bytes.byteLength), { access: "private", contentType: e.type, addRandomSuffix: false, allowOverwrite: true });
        stored.push(b.url);
        rows[i] = { caseId: id, kind: e.kind, blobUrl: b.url, originalName: names[i], size: e.bytes.length };
      });
      await db.insert(schema.cases).values({ id, orgId: me.orgId, createdBy: me.user.id, plate: v.plate.toUpperCase().replace(/[\s-]+/g, "").slice(0, 20), status: "uploaded" });
      ids.push(id);
      if (!(await debitCase(me.orgId, id))) throw new Error("no_credits");
      await db.insert(schema.caseFiles).values(rows);
      await db.insert(schema.jobs).values({ caseId: id, step: "intake", state: "queued" });
      await db.insert(schema.caseEvents).values({ caseId: id, step: "upload", message: `Received ${rows.length} file(s)` });
      await db.insert(schema.auditLog).values({ orgId: me.orgId, userId: me.user.id, action: "case.create", detail: id });
    }
  } catch (e) {
    for (const id of ids) {
      await refundCase(me.orgId, id).catch((x) => console.error("split rollback: refund failed", id, x));
      await db.delete(schema.cases).where(eq(schema.cases.id, id)).catch((x) => console.error("split rollback: delete failed", id, x));
    }
    if (stored.length) await del(stored).catch((x) => console.error("split rollback: blob delete failed", x));
    if ((e as Error).message === "no_credits") return NextResponse.json({ error: "no_credits", needed: plan.length }, { status: 402 });
    console.error("split failed", e);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
  await del(url).catch(() => {}); // the cars are stored on their own now; the big zip is not kept
  // The first cases are read now. Each read can take minutes and this call has one time limit, so the rest are not queued here:
  // the dashboard starts cases still `uploaded` after a minute (a few per visit) and each case page does the same for itself.
  after(async () => { await runPool(Math.min(ids.length, READ_NOW), READ_NOW, async (i) => { await scanCase(ids[i], "auto").catch(() => {}); }); });
  return NextResponse.json({ ids, plates: plan.map((v) => v.plate) });
}
