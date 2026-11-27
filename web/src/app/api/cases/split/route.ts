import { NextResponse, after } from "next/server";
import { eq } from "drizzle-orm";
import { get, put } from "@vercel/blob";
import { z } from "zod";
import { db, schema } from "@/db";
import { getUserOrNull } from "@/lib/session";
import { unzipVehicles, ZipRejected, MAX_VEHICLES } from "@/lib/unzip-bundle";
import { scanCase } from "@/lib/scan-case";
import { CASE_COST, debitCase, refundCase } from "@/lib/payments/case-credit";
import { creditBalance } from "@/lib/payments/credit";
import { enforcing, exempt } from "@/lib/payments/case-credit";
import { runPool } from "@/lib/pool";
import { MAX_FILE_BYTES } from "@/lib/upload-rules";

export const maxDuration = 300; // the zip is opened and stored in this call; the reading runs after the response

const Body = z.object({ url: z.string().url().max(1000), name: z.string().trim().min(1).max(300), size: z.number().int().positive().max(MAX_FILE_BYTES) });

/**
 * A zip holding several vehicles (one folder per plate, each with its own PDF) becomes one case per vehicle: the folder name is the
 * plate, each case takes one credit, its PDFs and photos are stored as ordinary case files and it is read like any upload.
 * All or nothing: when a credit or a store fails, the cases made so far are removed and the credits go back.
 */
export async function POST(req: Request) {
  const me = await getUserOrNull();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const { url, name } = parsed.data;
  let path = "";
  try { path = decodeURIComponent(new URL(url).pathname); } catch { return NextResponse.json({ error: "prefix" }, { status: 400 }); }
  if (!path.startsWith(`/${me.orgId}/`) || path.includes("..") || !/\.zip$/i.test(name)) return NextResponse.json({ error: "prefix" }, { status: 400 });

  const r = await get(url, { access: "private" });
  if (!r || r.statusCode !== 200) return NextResponse.json({ error: "download" }, { status: 502 });
  let vehicles;
  try { vehicles = unzipVehicles(new Uint8Array(await new Response(r.stream).arrayBuffer())); }
  catch (e) { return NextResponse.json({ error: e instanceof ZipRejected ? e.code : "corrupt" }, { status: 422 }); }
  const plates = [...vehicles.keys()].slice(0, MAX_VEHICLES);
  if (enforcing() && !exempt(me.orgId) && (await creditBalance(me.orgId)) < CASE_COST * plates.length) return NextResponse.json({ error: "no_credits", needed: plates.length }, { status: 402 });

  const ids: string[] = [];
  try {
    for (const plate of plates) {
      const id = crypto.randomUUID();
      await db.insert(schema.cases).values({ id, orgId: me.orgId, createdBy: me.user.id, plate: plate.toUpperCase().replace(/\s+/g, "").slice(0, 20), status: "uploaded" });
      ids.push(id);
      if (!(await debitCase(me.orgId, id))) throw new Error("no_credits");
      const entries = vehicles.get(plate)!;
      const seen = new Set<string>();
      const rows: (typeof schema.caseFiles.$inferInsert)[] = new Array(entries.length);
      await runPool(entries.length, 4, async (i) => {
        const e = entries[i];
        let n = e.name;
        for (let k = 2; seen.has(n); k++) n = e.name.replace(/(\.[^.]+)?$/, `-${k}$1`);
        seen.add(n);
        const b = await put(`${me.orgId}/${id}/${n}`, Buffer.from(e.bytes), { access: "private", contentType: e.type, addRandomSuffix: false, allowOverwrite: true });
        rows[i] = { caseId: id, kind: e.kind, blobUrl: b.url, originalName: n, size: e.bytes.length };
      });
      await db.insert(schema.caseFiles).values(rows);
      await db.insert(schema.jobs).values({ caseId: id, step: "intake", state: "queued" });
      await db.insert(schema.caseEvents).values({ caseId: id, step: "upload", message: `Received ${rows.length} file(s)` });
      await db.insert(schema.auditLog).values({ orgId: me.orgId, userId: me.user.id, action: "case.create", detail: id });
    }
  } catch (e) {
    for (const id of ids) { await refundCase(me.orgId, id).catch(() => {}); await db.delete(schema.cases).where(eq(schema.cases.id, id)).catch(() => {}); }
    if ((e as Error).message === "no_credits") return NextResponse.json({ error: "no_credits", needed: plates.length }, { status: 402 });
    throw e;
  }
  // three read at a time; a case still `uploaded` a minute later is picked up when its page or the list is opened (page self-heal)
  after(async () => { await runPool(ids.length, 3, async (i) => { await scanCase(ids[i], "auto").catch(() => {}); }); });
  return NextResponse.json({ ids, plates });
}
