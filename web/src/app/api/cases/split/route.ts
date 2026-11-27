import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { del, get, put } from "@vercel/blob";
import { z } from "zod";
import { db, schema } from "@/db";
import { getUserOrNull } from "@/lib/session";
import { planVehicles, unzipVehicle, ZipRejected } from "@/lib/unzip-bundle";
import { earlierCars, lockSplit, splitKey } from "@/lib/split-marks";
import { CASE_COST, debitCase, enforcing, exempt, refundCase } from "@/lib/payments/case-credit";
import { creditBalance } from "@/lib/payments/credit";
import { runPool } from "@/lib/pool";
import { MAX_FILE_BYTES } from "@/lib/upload-rules";
import { ZIP_WHY } from "@/lib/case-text";

export const maxDuration = 300; // the zip is opened and stored in this call; the reading of most cases starts later (see below)

const Body = z.object({ url: z.string().url().max(1000), name: z.string().trim().min(1).max(300), size: z.number().int().positive().max(MAX_FILE_BYTES), fallback: z.boolean().optional() });

const normPlate = (folder: string) => folder.toUpperCase().replace(/[\s-]+/g, "").slice(0, 20);

/**
 * Writes the rows of one car together: on Neon one HTTP batch (one transaction), so a case never exists without its files,
 * its job and its split record. The local test database has no batch; there the rows go one after the other.
 */
async function writeCar(qs: Parameters<typeof db.batch>[0]) {
  const d = db as unknown as { batch?: (q: typeof qs) => Promise<unknown> };
  if (typeof d.batch === "function") await d.batch(qs);
  else for (const q of qs) await q;
}

/**
 * A zip holding several cars (plate-named folders, each with its own PDF) becomes one case per car: the folder name is the
 * plate, each case takes one credit, its PDFs and photos are stored as ordinary case files and it is read like any upload.
 *
 * Order: every limit is checked from the zip's file list first (nothing stored yet). Then, one car at a time, its files are
 * inflated and stored, then its case, file rows, intake job, event and audit rows are written in one batch, then its credit is taken.
 * A `case.split` audit row records which zip (name and size) and which folder each case came from: when the same zip is sent
 * again (after a time-out, say), the cars already made are kept and not charged again; only the missing ones are made.
 * A lock row lets only one call split the same zip at a time (409 "busy" for the other); while it is held the self-heal reads none
 * of the organisation's new cases, since a rollback may still delete them.
 * On a thrown error every case made in this call is refunded and deleted and every stored blob removed. A function killed by the
 * time limit leaves the cars finished before it (each complete and charged once, or complete and not yet charged) and blobs of the
 * car in progress. The uploaded zip is deleted when the call ends, except when it is not a multi-car zip ("empty") and the browser
 * asked to fall back (`fallback`): then the browser makes it one ordinary case.
 */
export async function POST(req: Request) {
  const me = await getUserOrNull();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const { url, name, size, fallback } = parsed.data;
  let u: URL;
  let path: string;
  try { u = new URL(url); path = decodeURIComponent(u.pathname); } catch { return NextResponse.json({ error: "prefix" }, { status: 400 }); }
  if (u.protocol !== "https:" || !u.hostname.endsWith(".blob.vercel-storage.com") || !path.startsWith(`/${me.orgId}/`) || path.split("/").includes("..") || !/\.zip$/i.test(name))
    return NextResponse.json({ error: "prefix" }, { status: 400 });
  const dropZip = () => del(url).catch(() => {}); // the cars are stored on their own (or the zip was refused): the big zip is not kept

  let buf: Uint8Array;
  try {
    const r = await get(url, { access: "private" });
    if (!r || r.statusCode !== 200) return NextResponse.json({ error: "download" }, { status: 502 });
    buf = new Uint8Array(await new Response(r.stream).arrayBuffer());
  } catch { return NextResponse.json({ error: "download" }, { status: 502 }); }

  let plan;
  try { plan = planVehicles(buf); }
  catch (e) {
    const code = e instanceof ZipRejected ? e.code : "corrupt";
    if (!(code === "empty" && fallback)) await dropZip(); // "empty" with fallback: the browser makes it one ordinary case
    return NextResponse.json({ error: code, why: e instanceof ZipRejected ? e.message : ZIP_WHY.corrupt }, { status: 422 });
  }

  // Only one call at a time splits a given zip (two tabs, or a retry while the first call still runs), and cars an earlier call
  // already made are kept as they are, not made or charged again.
  let release: (() => Promise<void>) | null = null;
  let earlier: Map<string, string>;
  let todo: typeof plan;
  try {
    release = await lockSplit(me.orgId, me.user.id, name, size);
    if (!release) { await dropZip(); return NextResponse.json({ error: "busy" }, { status: 409 }); } // this upload is its own copy: the running call deletes only its own
    earlier = await earlierCars(me.orgId, name, size);
    todo = plan.filter((v) => !earlier.has(v.prefix));
    if (todo.length && enforcing() && !exempt(me.orgId) && (await creditBalance(me.orgId)) < CASE_COST * todo.length) {
      await release(); await dropZip();
      return NextResponse.json({ error: "no_credits", needed: todo.length }, { status: 402 });
    }
  } catch (e) {
    if (release) await release();
    await dropZip();
    console.error("split failed before making cases", e);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
  const key = splitKey(name, size);

  const made: string[] = [];
  const madeFor = new Map<string, string>(); // folder prefix -> case id made in this call
  const stored = new Map<string, string[]>(); // case id -> its stored blobs (also for the car in progress, which has no case yet)
  try {
    for (const v of todo) {
      const id = crypto.randomUUID();
      const entries = unzipVehicle(buf, v.prefix);
      if (!entries.length) continue; // planVehicles only keeps cars with a non-empty PDF; nothing to make otherwise
      const seen = new Set<string>();
      const names = entries.map((e) => { let n = e.name; for (let k = 2; seen.has(n); k++) n = e.name.replace(/(\.[^.]+)?$/, `-${k}$1`); seen.add(n); return n; });
      const rows: (typeof schema.caseFiles.$inferInsert)[] = new Array(entries.length);
      await runPool(entries.length, 4, async (i) => {
        const e = entries[i];
        const b = await put(`${me.orgId}/${id}/${names[i]}`, Buffer.from(e.bytes.buffer, e.bytes.byteOffset, e.bytes.byteLength), { access: "private", contentType: e.type, addRandomSuffix: false, allowOverwrite: true });
        (stored.get(id) ?? stored.set(id, []).get(id)!).push(b.url);
        rows[i] = { caseId: id, kind: e.kind, blobUrl: b.url, originalName: names[i], size: e.bytes.length };
      });
      await writeCar([
        db.insert(schema.cases).values({ id, orgId: me.orgId, createdBy: me.user.id, plate: normPlate(v.plate), status: "uploaded" }),
        db.insert(schema.caseFiles).values(rows),
        db.insert(schema.jobs).values({ caseId: id, step: "intake", state: "queued" }),
        db.insert(schema.caseEvents).values({ caseId: id, step: "upload", message: `Received ${rows.length} file(s)` }),
        db.insert(schema.auditLog).values({ orgId: me.orgId, userId: me.user.id, action: "case.create", detail: id }),
        db.insert(schema.auditLog).values({ orgId: me.orgId, userId: me.user.id, action: "case.split", detail: `${id}|${key}${v.prefix}` }),
      ]);
      made.push(id); madeFor.set(v.prefix, id);
      if (!(await debitCase(me.orgId, id))) throw new Error("no_credits");
    }
  } catch (e) {
    const kept = new Set<string>(); // a case whose row could not be deleted keeps its files, so it is never a case without files
    for (const id of made) {
      await refundCase(me.orgId, id).catch((x) => console.error("split rollback: refund failed", id, x));
      await db.delete(schema.cases).where(eq(schema.cases.id, id)).catch((x) => { kept.add(id); console.error("split rollback: delete failed", id, x); });
    }
    const gone = [...stored].filter(([id]) => !kept.has(id)).flatMap(([, urls]) => urls);
    if (gone.length) await del(gone).catch((x) => console.error("split rollback: blob delete failed", x));
    await dropZip();
    await release();
    if ((e as Error).message === "no_credits") return NextResponse.json({ error: "no_credits", needed: todo.length }, { status: 402 });
    if (e instanceof ZipRejected) return NextResponse.json({ error: e.code, why: e.message }, { status: 422 }); // a car folder that does not inflate
    console.error("split failed", e);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
  await dropZip();
  await release();
  // No read starts here: a read takes up to 5 minutes and this call's 300 s are mostly spent. The dashboard and each case page
  // start cases still `uploaded` a minute after they were made, once no split of the organisation is running.
  const done = plan.filter((v) => earlier.has(v.prefix) || madeFor.has(v.prefix));
  const ids = done.map((v) => (earlier.get(v.prefix) ?? madeFor.get(v.prefix)) as string);
  return NextResponse.json({ ids, plates: done.map((v) => normPlate(v.plate)), made: made.length });
}
