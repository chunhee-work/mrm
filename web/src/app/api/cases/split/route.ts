import { NextResponse, after } from "next/server";
import { and, eq, gt, inArray, like } from "drizzle-orm";
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
const REPEAT_MS = 24 * 3600_000; // a second upload of the same zip (name and size) within a day only makes the cars still missing

const normPlate = (folder: string) => folder.toUpperCase().replace(/[\s-]+/g, "").slice(0, 20);
const esc = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

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
 * On a thrown error every case made in this call is refunded and deleted and every stored blob removed. A function killed by the
 * time limit leaves the cars finished before it (each complete and charged once, or complete and not yet charged) and blobs of the
 * car in progress. The uploaded zip is deleted when the call ends, except when it is not a multi-car zip ("empty"): then the
 * browser makes it one ordinary case.
 */
export async function POST(req: Request) {
  const me = await getUserOrNull();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const { url, name, size } = parsed.data;
  let u: URL;
  let path: string;
  try { u = new URL(url); path = decodeURIComponent(u.pathname); } catch { return NextResponse.json({ error: "prefix" }, { status: 400 }); }
  if (u.protocol !== "https:" || !u.hostname.endsWith(".blob.vercel-storage.com") || !path.startsWith(`/${me.orgId}/`) || path.includes("..") || !/\.zip$/i.test(name))
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
    if (code !== "empty") await dropZip();
    return NextResponse.json({ error: code, why: e instanceof ZipRejected ? e.message : ZIP_WHY.corrupt }, { status: 422 });
  }

  // cars of this zip already made by an earlier call (same zip name and size, case still there)
  const key = `${name}|${size}|`;
  const marks = await db.select({ detail: schema.auditLog.detail }).from(schema.auditLog).where(and(eq(schema.auditLog.orgId, me.orgId),
    eq(schema.auditLog.action, "case.split"), like(schema.auditLog.detail, `%|${esc(key)}%`), gt(schema.auditLog.at, new Date(Date.now() - REPEAT_MS))));
  const earlier = new Map<string, string>(); // folder prefix -> case id
  for (const m of marks) { const d = m.detail ?? ""; const i = d.indexOf("|"); if (d.slice(i + 1).startsWith(key)) earlier.set(d.slice(i + 1 + key.length), d.slice(0, i)); }
  if (earlier.size) {
    const alive = new Set((await db.select({ id: schema.cases.id }).from(schema.cases).where(and(eq(schema.cases.orgId, me.orgId), inArray(schema.cases.id, [...earlier.values()])))).map((c) => c.id));
    for (const [p, id] of earlier) if (!alive.has(id)) earlier.delete(p);
  }
  const todo = plan.filter((v) => !earlier.has(v.prefix));
  if (todo.length && enforcing() && !exempt(me.orgId) && (await creditBalance(me.orgId)) < CASE_COST * todo.length) {
    await dropZip();
    return NextResponse.json({ error: "no_credits", needed: todo.length }, { status: 402 });
  }

  const made: string[] = [];
  const madeFor = new Map<string, string>(); // folder prefix -> case id made in this call
  const stored: string[] = [];
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
        stored.push(b.url);
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
    for (const id of made) {
      await refundCase(me.orgId, id).catch((x) => console.error("split rollback: refund failed", id, x));
      await db.delete(schema.cases).where(eq(schema.cases.id, id)).catch((x) => console.error("split rollback: delete failed", id, x));
    }
    if (stored.length) await del(stored).catch((x) => console.error("split rollback: blob delete failed", x));
    await dropZip();
    if ((e as Error).message === "no_credits") return NextResponse.json({ error: "no_credits", needed: todo.length }, { status: 402 });
    console.error("split failed", e);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
  await dropZip();
  const ids = plan.map((v) => earlier.get(v.prefix) ?? madeFor.get(v.prefix)).filter((x): x is string => !!x);
  // The first new cases are read now. Each read can take minutes and this call has one time limit, so the rest are not queued here:
  // the dashboard starts cases still `uploaded` after a minute (a few per visit) and each case page does the same for itself.
  after(async () => { await runPool(Math.min(made.length, READ_NOW), READ_NOW, async (i) => { await scanCase(made[i], "auto").catch(() => {}); }); });
  return NextResponse.json({ ids, plates: plan.map((v) => normPlate(v.plate)), made: made.length });
}
