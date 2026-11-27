import { NextResponse } from "next/server";
import { eq, inArray } from "drizzle-orm";
import { del, get, put } from "@vercel/blob";
import { z } from "zod";
import { db, schema } from "@/db";
import { getUserOrNull } from "@/lib/session";
import { profileBlocks } from "@/lib/ext/worker-store";
import { planVehicles, unzipVehicle, ZipRejected } from "@/lib/unzip-bundle";
import { normPlate } from "@/lib/peek-files";
import { earlierCars, lockSplit, splitKey } from "@/lib/split-marks";
import { CASE_COST, debitCase, enforcing, exempt, refundCase } from "@/lib/payments/case-credit";
import { creditBalance } from "@/lib/payments/credit";
import { runPool } from "@/lib/pool";
import { MAX_FILE_BYTES } from "@/lib/upload-rules";
import { slotToStore } from "@/lib/ext/workshops";
import { ZIP_WHY } from "@/lib/case-text";

export const maxDuration = 300; // the zip is opened and stored in this call; the reading of most cases starts later (see below)

const Body = z.object({ url: z.string().url().max(1000), name: z.string().trim().min(1).max(300), size: z.number().int().positive().max(MAX_FILE_BYTES), fallback: z.boolean().optional(), workshop: z.number().int().min(1).max(3).optional() });


/**
 * Writes the rows of one car together: on Neon one HTTP batch (one transaction), so a case never exists without its files,
 * its job and its split record. The local test database has no batch; there the rows go one after the other.
 */
async function writeCar(qs: Parameters<typeof db.batch>[0]) {
  const d = db as unknown as { batch?: (q: typeof qs) => Promise<unknown> };
  if (typeof d.batch === "function") await d.batch(qs);
  else for (const q of qs) await q;
}

/** The whole stream in one buffer sized from the declared size up front, so the zip is never held twice while it is read. */
async function readAll(stream: ReadableStream<Uint8Array>, size: number): Promise<Uint8Array> {
  let buf = new Uint8Array(size);
  let n = 0;
  const rd = stream.getReader();
  for (;;) {
    const { done, value } = await rd.read();
    if (done) break;
    if (n + value.length > buf.length) { if (n + value.length > MAX_FILE_BYTES) throw new Error("too_large"); const b = new Uint8Array(Math.min(MAX_FILE_BYTES, Math.max(n + value.length, buf.length * 2))); b.set(buf.subarray(0, n)); buf = b; }
    buf.set(value, n); n += value.length;
  }
  return n === buf.length ? buf : buf.subarray(0, n);
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
 * asked to fall back (`fallback`): then the browser makes it one ordinary case. A fallback zip that does hold several cars is not
 * split: 409 "cars" sends its plates back, so the user first sees the cars and their price and then sends it again.
 */
export async function POST(req: Request) {
  let me: Awaited<ReturnType<typeof getUserOrNull>>;
  try {
    me = await getUserOrNull();
    if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    if (await profileBlocks(me.orgId)) return NextResponse.json({ error: "profile_incomplete" }, { status: 403 }); // details not filled in on the front page
  } catch (e) { console.error("split failed before reading the request", e); return NextResponse.json({ error: "failed", kept: 0 }, { status: 500 }); }
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const { url, name, size, fallback } = parsed.data;
  let slot: Awaited<ReturnType<typeof slotToStore>>;
  try { slot = await slotToStore(me.orgId, parsed.data.workshop); } // a database failure here answers like the other checks: 500, nothing made
  catch (e) { console.error("split failed reading the workshop", e); return NextResponse.json({ error: "failed", kept: 0 }, { status: 500 }); }
  if (slot === "unknown") return NextResponse.json({ error: "workshop_unknown" }, { status: 400 });
  let u: URL;
  let path: string;
  try { u = new URL(url); path = decodeURIComponent(u.pathname); } catch { return NextResponse.json({ error: "prefix" }, { status: 400 }); }
  if (u.protocol !== "https:" || !u.hostname.endsWith(".blob.vercel-storage.com") || !path.startsWith(`/${me.orgId}/`) || path.split("/").includes("..") || !/\.zip$/i.test(name))
    return NextResponse.json({ error: "prefix" }, { status: 400 });
  // Only the caller's own upload may be read and deleted here: `<org>/<batch>/<file>`, and the batch folder is not a case's folder
  // (case files live under `<org>/<case id>/`), so a stored case file can never be passed in and deleted.
  const seg = path.split("/");
  // Ordinary case files also live under `<org>/<batch>/<file>` (new cases) or `<org>/<case id>-add-<uuid>/<file>` (added files),
  // so three checks: the stored file itself is a zip, its folder is not (and does not start with) a case id, and no case file row
  // points at this URL. A stored case file can then never be read or deleted here.
  if (seg.length !== 4 || !/\.zip$/i.test(seg[3])) return NextResponse.json({ error: "prefix" }, { status: 400 });
  const caseLike = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i.exec(seg[2])?.[1];
  try {
    if (caseLike && (await db.select({ id: schema.cases.id }).from(schema.cases).where(eq(schema.cases.id, caseLike.toLowerCase())).limit(1)).length)
      return NextResponse.json({ error: "prefix" }, { status: 400 });
    if ((await db.select({ id: schema.caseFiles.id }).from(schema.caseFiles).where(inArray(schema.caseFiles.blobUrl, [...new Set([url, `${u.origin}${u.pathname}`, `${u.origin}${path}`, `${u.origin}${encodeURI(path)}`])])).limit(1)).length)
      return NextResponse.json({ error: "prefix" }, { status: 400 });
  } catch (e) { // not yet known to be the caller's own upload, so it is not deleted
    console.error("split failed before reading the zip", e);
    return NextResponse.json({ error: "failed", kept: 0 }, { status: 500 });
  }
  const dropZip = () => del(url).catch((x) => console.error("split: zip delete failed", x)); // the cars are stored on their own (or the zip was refused): the big zip is not kept

  let buf: Uint8Array;
  try {
    const r = await get(url, { access: "private" });
    if (!r || r.statusCode !== 200) return NextResponse.json({ error: "download" }, { status: 502 });
    // the size sent is the zip's key for the lock and the repeat check: it must be the stored file's real size
    if (r.blob.size !== size) return NextResponse.json({ error: "invalid" }, { status: 400 });
    buf = await readAll(r.stream, r.blob.size);
    // a download cut short without an error is a download failure, not a damaged zip: the zip is kept and can be sent again
    if (buf.length !== size) return NextResponse.json({ error: "download" }, { status: 502 });
  } catch { return NextResponse.json({ error: "download" }, { status: 502 }); }

  let plan;
  try { plan = planVehicles(buf); }
  catch (e) {
    const code = e instanceof ZipRejected ? e.code : "corrupt";
    if (!(e instanceof ZipRejected)) console.error("split: reading the zip threw", e); // answered as "cannot be opened", but logged
    if (!(code === "empty" && fallback)) await dropZip(); // "empty" with fallback: the browser makes it one ordinary case
    return NextResponse.json({ error: code, why: e instanceof ZipRejected ? e.message : ZIP_WHY.corrupt }, { status: 422 });
  }

  // The browser could not read this zip's list, so the user was never told it holds several cars or what they cost. Nothing is
  // made or charged: the plates go back, the page shows them with the price, and the user sends it again as a multi-car zip.
  if (fallback) { await dropZip(); return NextResponse.json({ error: "cars", cars: plan.map((v) => v.plate) }, { status: 409 }); }

  // Only one call at a time splits a given zip (two tabs, or a retry while the first call still runs), and cars an earlier call
  // already made are kept as they are, not made or charged again.
  let release: (() => Promise<void>) | null = null;
  let earlier = new Map<string, string>();
  let todo: typeof plan;
  try {
    release = await lockSplit(me.orgId, me.user.id, size);
    if (!release) { await dropZip(); return NextResponse.json({ error: "busy" }, { status: 409 }); } // this upload is its own copy: the running call deletes only its own
    // only folders of THIS zip count: a different zip of the same size may have left marks for other folders
    earlier = new Map([...(await earlierCars(me.orgId, size))].filter(([p]) => plan.some((v) => v.prefix === p)));
    todo = plan.filter((v) => !earlier.has(v.prefix));
    if (todo.length && enforcing() && !exempt(me.orgId) && (await creditBalance(me.orgId)) < CASE_COST * todo.length) {
      await release(); await dropZip();
      return NextResponse.json({ error: "no_credits", needed: todo.length, kept: earlier.size }, { status: 402 });
    }
  } catch (e) {
    if (release) await release();
    await dropZip();
    console.error("split failed before making cases", e);
    return NextResponse.json({ error: "failed", kept: earlier.size }, { status: 500 }); // cars an earlier call made are listed
  }
  const key = splitKey(name, size);

  const made: string[] = [];
  const madeFor = new Map<string, string>(); // folder prefix -> case id made in this call
  const stored = new Map<string, string[]>(); // case id -> its stored blobs (also for the car in progress, which has no case yet)
  const unsure = new Set<string>(); // a car whose write failed and whose case was not found: its blobs are never deleted
  try {
    for (const v of todo) {
      const id = crypto.randomUUID();
      const entries = unzipVehicle(buf, v.prefix);
      // planVehicles only keeps cars with a non-empty PDF: a car that still inflates to nothing is refused, never silently left out
      if (!entries.some((e) => e.kind === "pdf")) throw new ZipRejected("car_no_pdf", ZIP_WHY.car_no_pdf); // also when its PDFs inflate to nothing
      const seen = new Set<string>();
      const names = entries.map((e) => { let n = e.name; for (let k = 2; seen.has(n); k++) n = e.name.replace(/(\.[^.]+)?$/, `-${k}$1`); seen.add(n); return n; });
      const rows: (typeof schema.caseFiles.$inferInsert)[] = new Array(entries.length);
      await runPool(entries.length, 4, async (i) => {
        const e = entries[i];
        const b = await put(`${me.orgId}/${id}/${names[i]}`, Buffer.from(e.bytes.buffer, e.bytes.byteOffset, e.bytes.byteLength), { access: "private", contentType: e.type, addRandomSuffix: false, allowOverwrite: true });
        (stored.get(id) ?? stored.set(id, []).get(id)!).push(b.url);
        rows[i] = { caseId: id, kind: e.kind, blobUrl: b.url, originalName: names[i], size: e.bytes.length };
      });
      try {
        await writeCar([
          db.insert(schema.cases).values({ id, orgId: me.orgId, createdBy: me.user.id, plate: normPlate(v.plate), status: "uploaded" }),
          db.insert(schema.caseFiles).values(rows),
          db.insert(schema.jobs).values({ caseId: id, step: "intake", state: "queued" }),
          db.insert(schema.caseEvents).values({ caseId: id, step: "upload", message: `Received ${rows.length} file(s)` }),
          db.insert(schema.auditLog).values({ orgId: me.orgId, userId: me.user.id, action: "case.create", detail: id }),
          db.insert(schema.auditLog).values({ orgId: me.orgId, userId: me.user.id, action: "case.split", detail: `${id}|${key}${v.prefix}` }),
          ...(slot ? [db.insert(schema.merimenCaseWorkshop).values({ caseId: id, slot })] : []),
        ] as Parameters<typeof db.batch>[0]);
      } catch (e) {
        // the batch may have committed although its answer was lost: then the case exists with its files, and the rollback must
        // treat it as made (refund, then delete it with its blobs), never delete its blobs and leave a case without files
        // A lost answer can also mean the transaction has not committed YET: look again twice, 1.5 s apart, and when the case is
        // still not there keep its blobs anyway (a late commit then finds its files; otherwise a few files are left unused).
        // A check that fails tells nothing: the car is treated as made (refund, delete) AND its blobs are kept, as when unsure.
        const check = () => db.select({ id: schema.cases.id }).from(schema.cases).where(eq(schema.cases.id, id)).limit(1).then((r) => (r.length > 0 ? "yes" : "no"), () => "error");
        let seen = await check();
        for (let k = 0; seen === "no" && k < 2; k++) { await new Promise((r) => setTimeout(r, 1500)); seen = await check(); }
        if (seen !== "no") { made.push(id); madeFor.set(v.prefix, id); }
        if (seen !== "yes") unsure.add(id);
        throw e;
      }
      made.push(id); madeFor.set(v.prefix, id);
      if (!(await debitCase(me.orgId, id))) throw new Error("no_credits");
    }
  } catch (e) {
    const kept = new Set<string>(); // a case whose row could not be deleted keeps its files, so it is never a case without files
    for (const id of made) {
      // a case whose credit could not be given back is kept too: it stays paid for, counts as made, and is not charged again
      const back = await refundCase(me.orgId, id).then(() => true, (x) => { console.error("split rollback: refund failed", id, x); return false; });
      if (!back) { kept.add(id); continue; }
      await db.delete(schema.cases).where(eq(schema.cases.id, id)).catch((x) => { kept.add(id); console.error("split rollback: delete failed", id, x); });
    }
    // `kept` = cars of this zip now in the case list: the ones this call could not undo plus the ones an earlier call made,
    // so the page never says "nothing was kept" while earlier cars of the same zip are listed
    const listed = kept.size + earlier.size;
    const gone = [...stored].filter(([id]) => !kept.has(id) && !unsure.has(id)).flatMap(([, urls]) => urls);
    if (gone.length) await del(gone).catch((x) => console.error("split rollback: blob delete failed", x));
    await dropZip();
    await release();
    if ((e as Error).message === "no_credits") return NextResponse.json({ error: "no_credits", needed: todo.length, kept: listed }, { status: 402 });
    if (e instanceof ZipRejected) return NextResponse.json({ error: e.code, why: e.message, kept: listed }, { status: 422 }); // a car folder that does not inflate
    console.error("split failed", e);
    return NextResponse.json({ error: "failed", kept: listed }, { status: 500 });
  }
  await dropZip();
  await release();
  // No read starts here: a read takes up to 5 minutes and this call's 300 s are mostly spent. The dashboard and each case page
  // start cases still `uploaded` a minute after they were made, once no split of the organisation is running.
  const done = plan.filter((v) => earlier.has(v.prefix) || madeFor.has(v.prefix));
  const ids = done.map((v) => (earlier.get(v.prefix) ?? madeFor.get(v.prefix)) as string);
  return NextResponse.json({ ids, plates: done.map((v) => normPlate(v.plate)), made: made.length });
}
