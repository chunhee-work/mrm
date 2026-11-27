/**
 * Acceptance tests for POST /api/cases/split (one case per car folder of a zip): cases, files, credits, the repeat check, the
 * lock, the rollback and the zip's deletion. Real Postgres (PGlite) with the real migrations, foreign keys and cascades ON
 * (an organisation and a user row are made); the blob store is a Map; the sign-in, the front-page details and the workshop
 * choice are replaced. PGlite has no `db.batch`, so a car's rows are written one after the other here (production: one
 * transaction). Run: npm test
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import Module from "node:module";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { and, eq, sql } from "drizzle-orm";
import { zipSync, strToU8 } from "fflate";
import * as nextServer from "next/server";
import * as schema from "../src/db/schema";

const root = path.resolve(__dirname, "..");
const pg = new PGlite();
const db = drizzle(pg, { schema });

const ORG = "org1";
let slot: number | null = null; // the workshop row the split writes (2 or 3), or none (1)
const blobs = new Map<string, Buffer>();
let failPutAt = 0; // when set, the put with this number (counted from when it was set) throws
let puts = 0;
const blobStub = {
  get: async (url: string) => {
    const b = blobs.get(url);
    return b ? { statusCode: 200, stream: new Response(b as unknown as BodyInit).body, blob: { size: b.length, contentType: "application/zip" } } : null;
  },
  put: async (p: string, body: Buffer) => {
    puts++;
    if (failPutAt && puts === failPutAt) throw new Error("blob store down");
    const url = `https://store.public.blob.vercel-storage.com/${p}`;
    blobs.set(url, Buffer.from(body));
    return { url, pathname: p };
  },
  del: async (u: string | string[]) => { for (const x of [u].flat()) blobs.delete(x); },
};
const afters: (() => unknown)[] = []; // what a route asked to run after its response (the automatic read)
const stubs: Record<string, unknown> = {
  "server-only": {},
  "@/db": { db, schema },
  "@vercel/blob": blobStub,
  "next/server": { ...nextServer, after: (fn: () => unknown) => { afters.push(fn); } },
  "@/lib/scan-case": { scanCase: async () => ({ ok: true, missing: [], claimed: true }) },
  "@/lib/session": { getUserOrNull: async () => ({ user: { id: "u1" }, orgId: ORG }) },
  "@/lib/ext/worker-store": { profileBlocks: async () => false },
  "@/lib/ext/workshops": { slotToStore: async () => slot },
};
const origLoad = (Module as any)._load;
(Module as any)._load = function (request: string, ...rest: unknown[]) {
  return request in stubs ? stubs[request] : origLoad.call(this, request, ...rest);
};

const pdf = (s: string) => strToU8(`%PDF-1.4 ${s}`);
let up = 0;
/** Puts a zip where the page would have uploaded it and returns the request body the page sends. */
function upload(files: Record<string, Uint8Array>, extra: Record<string, unknown> = {}) {
  const buf = Buffer.from(zipSync(files));
  const url = `https://store.public.blob.vercel-storage.com/${ORG}/batch${++up}/cars.zip`;
  blobs.set(url, buf);
  return { url, name: "cars.zip", size: buf.length, ...extra };
}
const TWO = { "DCD4004/a.pdf": pdf("a"), "DCD4004/1.jpg": strToU8("jpg1"), "NCH5773/b.pdf": pdf("b") };
const bal = async () => Number(((await db.execute(sql`SELECT COALESCE(SUM(delta),0)::int AS b FROM credits_ledger WHERE org_id = ${ORG}`)) as any).rows[0].b);
const cases = () => db.select().from(schema.cases).where(eq(schema.cases.orgId, ORG));
const locks = () => db.select().from(schema.auditLog).where(and(eq(schema.auditLog.orgId, ORG), eq(schema.auditLog.action, "case.split.lock")));
const caseBlobs = () => [...blobs.keys()].filter((k) => !k.endsWith("/cars.zip"));

async function main() {
  const dir = path.join(root, "drizzle");
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort())
    for (const s of readFileSync(path.join(dir, f), "utf8").split("--> statement-breakpoint")) if (s.trim()) await pg.exec(s);
  // foreign keys and cascades stay on: the rollback relies on deleting a case removing its files, job, events and workshop row
  await db.insert(schema.organizations).values({ id: ORG, name: "Org" });
  await db.insert(schema.user).values({ id: "u1", name: "U", email: "u1@test.invalid" });
  process.env.CREDITS_ENFORCE = "on"; delete process.env.CREDITS_EXEMPT_ORGS;
  const { POST } = await import("../src/app/api/cases/split/route");
  const call = async (body: unknown) => { const r = await POST(new Request("http://x/api/cases/split", { method: "POST", body: JSON.stringify(body) })); return { status: r.status, j: (await r.json()) as any }; };
  const reset = async () => { await pg.exec("DELETE FROM cases; DELETE FROM credits_ledger; DELETE FROM audit_log;"); blobs.clear(); failPutAt = 0; puts = 0; slot = null; afters.length = 0; };
  const children = async () => Number(((await db.execute(sql`SELECT (SELECT count(*) FROM case_files) + (SELECT count(*) FROM jobs) + (SELECT count(*) FROM case_events) + (SELECT count(*) FROM merimen_case_workshop) AS n`)) as any).rows[0].n);
  const fund = (n: number) => db.insert(schema.creditsLedger).values({ orgId: ORG, delta: 1000 * n, reason: `purchase:${crypto.randomUUID()}` });
  // the credit calls of the routes imported from here on go through a wrapper that can fail on demand
  const realCredit = await import("../src/lib/payments/case-credit");
  const credit = { real: realCredit, debitThrows: false, refundThrows: false, spendFirst: false };
  stubs["@/lib/payments/case-credit"] = {
    ...realCredit,
    debitCase: async (o: string, c: string) => {
      if (credit.spendFirst) await db.insert(schema.creditsLedger).values({ orgId: ORG, delta: -1000, reason: `spent:${crypto.randomUUID()}` }); // another case took the last credit
      const r = await realCredit.debitCase(o, c);
      if (credit.debitThrows) throw new Error("connection lost");
      return r;
    },
    refundCase: async (o: string, c: string, why?: string) => { if (credit.refundThrows) throw new Error("connection lost"); return realCredit.refundCase(o, c, why); },
  };
  const { POST: createCase } = await import("../src/app/api/cases/route");
  const { POST: addFilesRoute } = await import("../src/app/api/cases/[id]/files/route");
  const create = async (body: unknown) => { const r = await createCase(new Request("http://x/api/cases", { method: "POST", body: JSON.stringify(body) })); return { status: r.status, j: (await r.json()) as any }; };
  const store = (p: string) => `https://store.public.blob.vercel-storage.com/${ORG}/${p}`;
  const newBody = (pdfName = "report..final.pdf") => ({ files: [{ kind: "pdf", url: store(`b1/${encodeURIComponent(pdfName)}`), name: pdfName, size: 10 }, { kind: "photo", url: store("b1/IMG..1.jpg"), name: "IMG..1.jpg", size: 5 }] });
  const addFile = (id: string, name: string) => ({ kind: "pdf", url: store(`${id}-add-1/${encodeURIComponent(name)}`), name, size: 10 });
  const addFiles = (id: string, files: unknown[]) => addFilesRoute(new Request("http://x", { method: "POST", body: JSON.stringify({ files }) }), { params: Promise.resolve({ id }) });

  const tests: [string, () => Promise<void>][] = [
    ["two car folders become two cases, 1 credit each, with their files; the zip is deleted and the lock released", async () => {
      await reset(); await fund(5);
      const body = upload(TWO);
      const { status, j } = await call(body);
      assert.equal(status, 200); assert.equal(j.made, 2); assert.deepEqual(j.plates, ["DCD4004", "NCH5773"]);
      const cs = await cases();
      assert.deepEqual(cs.map((c) => [c.plate, c.status]).sort(), [["DCD4004", "uploaded"], ["NCH5773", "uploaded"]]);
      const fs = await db.select().from(schema.caseFiles);
      assert.deepEqual(fs.map((f) => f.originalName).sort(), ["1.jpg", "a.pdf", "b.pdf"]);
      assert.equal(await bal(), 3000);
      assert.equal(blobs.has(body.url), false); assert.equal((await locks()).length, 0);
      assert.equal((await db.select().from(schema.jobs)).length, 2);
    }],
    ["workshop 2 chosen: each case gets its workshop row", async () => {
      await reset(); await fund(5); slot = 2;
      const { status, j } = await call(upload(TWO));
      assert.equal(status, 200);
      const ws = await db.select().from(schema.merimenCaseWorkshop);
      assert.deepEqual(ws.map((w) => [w.caseId, w.slot]).sort(), j.ids.map((id: string) => [id, 2]).sort());
    }],
    ["the same zip sent again (renamed) makes nothing and charges nothing; a deleted car is made again", async () => {
      await reset(); await fund(5);
      const first = await call(upload(TWO));
      const again = await call(upload(TWO, { name: "cars (1).zip" }));
      assert.equal(again.status, 200); assert.equal(again.j.made, 0); assert.deepEqual(again.j.ids, first.j.ids);
      assert.equal(await bal(), 3000); assert.equal((await cases()).length, 2);
      await db.update(schema.cases).set({ deletedAt: new Date() }).where(eq(schema.cases.id, first.j.ids[0]));
      const third = await call(upload(TWO));
      assert.equal(third.j.made, 1); assert.equal(await bal(), 2000);
    }],
    ["not enough credits for every car: 402 with the number needed, nothing made, nothing charged, zip deleted", async () => {
      await reset(); await fund(1);
      const body = upload(TWO);
      const { status, j } = await call(body);
      assert.equal(status, 402); assert.equal(j.needed, 2); assert.equal(j.kept, 0);
      assert.equal((await cases()).length, 0); assert.equal(await bal(), 1000); assert.equal(blobs.has(body.url), false);
    }],
    ["a storage failure on the second car rolls back the first: no case, no charge, no stored file, lock released", async () => {
      await reset(); await fund(5); slot = 2;
      failPutAt = 3; // DCD4004 stores 2 files, then NCH5773's first store fails
      const { status, j } = await call(upload(TWO));
      assert.equal(status, 500); assert.equal(j.kept, 0);
      assert.equal((await cases()).length, 0); assert.equal(await bal(), 5000);
      assert.equal(await children(), 0); // the deleted case took its file rows, job, event and workshop row with it
      assert.deepEqual(caseBlobs(), []); assert.equal((await locks()).length, 0);
    }],
    ["another call splitting the same zip: 409 busy, nothing made, this copy deleted", async () => {
      await reset(); await fund(5);
      const body = upload(TWO);
      await db.insert(schema.auditLog).values({ orgId: ORG, userId: "u2", action: "case.split.lock", detail: `zip|${body.size}|` });
      const { status, j } = await call(body);
      assert.equal(status, 409); assert.equal(j.error, "busy");
      assert.equal((await cases()).length, 0); assert.equal(blobs.has(body.url), false); assert.equal(await bal(), 5000);
    }],
    ["a zip the browser could not read that holds several cars: 409 cars with the plates, nothing made or charged", async () => {
      await reset(); await fund(5);
      const { status, j } = await call(upload(TWO, { fallback: true }));
      assert.equal(status, 409); assert.equal(j.error, "cars"); assert.deepEqual(j.cars, ["DCD4004", "NCH5773"]);
      assert.equal((await cases()).length, 0); assert.equal(await bal(), 5000);
    }],
    ["a one-car zip with fallback: 422 empty and the zip is kept for the one-case upload", async () => {
      await reset(); await fund(5);
      const body = upload({ "DCD4004/a.pdf": pdf("a") }, { fallback: true });
      const { status, j } = await call(body);
      assert.equal(status, 422); assert.equal(j.error, "empty"); assert.equal(blobs.has(body.url), true);
    }],
    ["a car that cannot be opened refuses the whole zip before any car is made or charged (even when it comes last)", async () => {
      await reset(); await fund(5);
      const big = strToU8("%PDF-1.4 " + "lorem ipsum dolor sit amet ".repeat(400));
      const buf = Buffer.from(zipSync({ "DCD4004/a.pdf": pdf("a"), "NCH5773/b.pdf": [big, { level: 6 }] }));
      // break the deflate stream of the last car: its list entry stays valid, only inflating it fails
      const at = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x03, 0x04]), buf.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02])));
      const data = at + 30 + buf.readUInt16LE(at + 26) + buf.readUInt16LE(at + 28);
      buf.fill(0xff, data, data + 40);
      const url = `https://store.public.blob.vercel-storage.com/${ORG}/batchX/cars.zip`;
      blobs.set(url, buf);
      const { status, j } = await call({ url, name: "cars.zip", size: buf.length });
      assert.equal(status, 422); assert.equal(j.error, "corrupt");
      assert.equal((await cases()).length, 0); assert.equal(await bal(), 5000); assert.equal(puts, 0); assert.equal(blobs.has(url), false);
    }],
    ["a file name too long for the blob store refuses the whole zip before any car is made or charged", async () => {
      await reset(); await fund(5);
      const body = upload({ "DCD4004/a.pdf": pdf("a"), [`NCH5773/${"n".repeat(940)}.jpg`]: strToU8("x"), "NCH5773/b.pdf": pdf("b") });
      const { status, j } = await call(body);
      assert.equal(status, 422); assert.equal(j.error, "name_long");
      assert.equal((await cases()).length, 0); assert.equal(await bal(), 5000); assert.equal(puts, 0); assert.equal(blobs.has(body.url), false);
    }],
    ["a body whose size is not the stored zip's real size is refused (400) and the zip is kept", async () => {
      await reset();
      const body = upload(TWO);
      const { status } = await call({ ...body, size: body.size + 1 });
      assert.equal(status, 400); assert.equal(blobs.has(body.url), true);
    }],
    ["the credit check before upload counts only the cars of the zip not made yet", async () => {
      await reset(); await fund(1);
      const { GET } = await import("../src/app/api/cases/credit/route");
      const ask = async (q: string) => (await GET(new Request(`http://x/api/cases/credit?${q}`))).status;
      const body = upload(TWO);
      assert.equal(await ask(`n=2&zip=cars.zip&size=${body.size}`), 402); // 2 cars, 1 credit
      await fund(1); await call(body); // both made, balance 0
      assert.equal(await ask(`n=2&zip=cars.zip&size=${body.size}`), 200); // nothing left to make: no credit needed
    }],
    ["Replace files on a case whose several-car zip was refunded takes a credit again; a case still paid for adds files for free", async () => {
      await reset(); await fund(3);
      const { ZIP_WHY } = await import("../src/lib/case-text");
      const { debitCase, refundCase } = await import("../src/lib/payments/case-credit");
      const { POST: addFiles } = await import("../src/app/api/cases/[id]/files/route");
      const send = (id: string) => addFiles(new Request("http://x", { method: "POST", body: JSON.stringify({ files: [{ kind: "pdf", url: `https://store.public.blob.vercel-storage.com/${ORG}/${id}-add-1/a.pdf`, name: "a.pdf", size: 10 }] }) }), { params: Promise.resolve({ id }) });
      const mk = async (id: string, error: string) => { await db.insert(schema.cases).values({ id, orgId: ORG, plate: "", status: "failed", error }); await debitCase(ORG, id); };
      await mk("r1", `cars.zip: ${ZIP_WHY.multi}`); await refundCase(ORG, "r1"); // the one-case read gave it back
      assert.equal(await bal(), 3000);
      assert.equal((await send("r1")).status, 200); assert.equal(await bal(), 2000); // the new read is paid for
      await mk("r2", "bad_file:a.pdf|corrupt"); // the user's own bad file: still paid for
      assert.equal(await bal(), 1000);
      assert.equal((await send("r2")).status, 200); assert.equal(await bal(), 1000);
    }],
    ["U6 new case: the case, its files, job and activity line are written, one credit is taken, the read is started", async () => {
      await reset(); await fund(2); slot = 2;
      const { status, j } = await create(newBody());
      assert.equal(status, 200);
      const [c] = await cases();
      assert.equal(c.id, j.id); assert.equal(c.status, "uploaded");
      assert.deepEqual((await db.select().from(schema.caseFiles)).map((f) => [f.kind, f.originalName]), [["pdf", "report..final.pdf"], ["photo", "IMG..1.jpg"]]); // U3: dots in a name
      assert.equal((await db.select().from(schema.jobs)).length, 1);
      assert.deepEqual((await db.select().from(schema.caseEvents)).map((e) => e.message), ["Received 2 file(s)"]);
      assert.deepEqual((await db.select().from(schema.merimenCaseWorkshop)).map((w) => [w.caseId, w.slot]), [[j.id, 2]]);
      assert.equal(await bal(), 1000); assert.equal(afters.length, 1);
    }],
    ["U6 new case whose rows cannot be written: 500, no case is left, no credit is taken, nothing is read", async () => {
      await reset(); await fund(2);
      const { status, j } = await create(newBody("bad\u0000name.pdf")); // the database refuses this name: the file rows fail
      assert.equal(status, 500); assert.equal(j.error, "failed");
      assert.equal((await cases()).length, 0); assert.equal(await children(), 0);
      assert.equal(await bal(), 2000); assert.equal(afters.length, 0);
    }],
    ["U6 new case when taking the credit fails halfway: the credit goes back and the case is removed (500)", async () => {
      await reset(); await fund(2);
      credit.debitThrows = true; // the credit is taken, then the call fails
      try {
        const { status } = await create(newBody());
        assert.equal(status, 500);
        assert.equal((await cases()).length, 0); assert.equal(await children(), 0);
        assert.equal(await bal(), 2000); assert.equal(afters.length, 0);
      } finally { credit.debitThrows = false; }
    }],
    ["U6 new case when the credit can be neither taken for sure nor given back: the case stays and is answered as made, never an error with a case in the list", async () => {
      await reset(); await fund(2);
      credit.debitThrows = true; credit.refundThrows = true;
      try {
        const { status, j } = await create(newBody());
        assert.equal(status, 200);
        assert.deepEqual((await cases()).map((c) => c.id), [j.id]);
        assert.equal(await bal(), 1000); assert.equal(afters.length, 1); // paid for once, and read
      } finally { credit.debitThrows = false; credit.refundThrows = false; }
    }],
    ["U6 new case without a credit: 402 and no case", async () => {
      await reset();
      const { status, j } = await create(newBody());
      assert.equal(status, 402); assert.equal(j.error, "no_credits");
      assert.equal((await cases()).length, 0); assert.equal(afters.length, 0);
      // the last credit goes between the first look and the debit: the case just made is removed again
      await fund(1); credit.spendFirst = true;
      try {
        const late = await create(newBody());
        assert.equal(late.status, 402); assert.equal((await cases()).length, 0); assert.equal(await children(), 0); assert.equal(await bal(), 0);
      } finally { credit.spendFirst = false; }
    }],
    ["U8 new case and added files: a file URL that is not on the file store is refused (400), nothing is made", async () => {
      await reset(); await fund(2);
      for (const url of ["http://169.254.169.254/org1/b/a.pdf", `https://x.example/${ORG}/b/a.pdf`, `https://store.public.blob.vercel-storage.com/other-org/b/a.pdf`]) {
        const { status, j } = await create({ files: [{ kind: "pdf", url, name: "a.pdf", size: 10 }] });
        assert.equal(status, 400, url); assert.equal(j.error, "prefix");
      }
      assert.equal((await cases()).length, 0); assert.equal(await bal(), 2000);
      await db.insert(schema.cases).values({ id: "w0", orgId: ORG, plate: "", status: "pending_doc", pendingDoc: "police report" });
      const r = await addFiles("w0", [{ kind: "pdf", url: `https://x.example/${ORG}/w0-add-1/a.pdf`, name: "a.pdf", size: 10 }]);
      assert.equal(r.status, 400);
      assert.equal((await cases())[0].status, "pending_doc"); assert.equal(await children(), 0);
    }],
    ["U12 Replace files: in one step the case is queued, the file that could not be opened leaves and the new one (same name) arrives", async () => {
      await reset();
      await db.insert(schema.cases).values({ id: "f1", orgId: ORG, plate: "", status: "failed", error: "bad_file:a.pdf|corrupt" });
      await db.insert(schema.caseFiles).values([{ caseId: "f1", kind: "pdf", blobUrl: "old-bad", originalName: "a.pdf" }, { caseId: "f1", kind: "pdf", blobUrl: "old-good", originalName: "b.pdf" }]);
      const r = await addFiles("f1", [addFile("f1", "a.pdf")]);
      assert.equal(r.status, 200);
      const [c] = await cases();
      assert.equal(c.status, "uploaded"); assert.equal(c.error, null);
      const fs = await db.select().from(schema.caseFiles);
      assert.deepEqual(fs.map((f) => [f.originalName, f.blobUrl.startsWith("https://")]).sort(), [["a.pdf", true], ["b.pdf", false]]);
      assert.deepEqual((await db.select().from(schema.caseEvents)).map((e) => e.message), ["Received 1 more file(s)"]);
      assert.equal((await db.select().from(schema.jobs)).length, 1);
    }],
    ["U12 added files that cannot be written: the case stays exactly as it was (never 'uploaded' without its files) and a credit taken for it goes back", async () => {
      await reset(); await fund(1);
      const { ZIP_WHY } = await import("../src/lib/case-text");
      const error = `cars.zip: ${ZIP_WHY.multi}`;
      await db.insert(schema.cases).values({ id: "f2", orgId: ORG, plate: "", status: "failed", error });
      await db.insert(schema.caseFiles).values({ caseId: "f2", kind: "bundle_zip", blobUrl: "zip", originalName: "cars.zip" });
      await credit.real.debitCase(ORG, "f2"); await credit.real.refundCase(ORG, "f2"); // the one-case read gave it back
      assert.equal(await bal(), 1000);
      await assert.rejects(addFiles("f2", [addFile("f2", "bad\u0000name.pdf")]));
      const [c] = await cases();
      assert.equal(c.status, "failed"); assert.equal(c.error, error);
      assert.deepEqual((await db.select().from(schema.caseFiles)).map((f) => f.originalName), ["cars.zip"]); // the refused zip was not taken out either
      assert.equal((await db.select().from(schema.jobs)).length, 0); assert.equal((await db.select().from(schema.caseEvents)).length, 0);
      assert.equal(await bal(), 1000);
    }],
    ["U12 two sends for the same waiting case at once: one is taken, the other is told 'not waiting', the files are added once", async () => {
      await reset();
      await db.insert(schema.cases).values({ id: "f3", orgId: ORG, plate: "", status: "pending_doc", pendingDoc: "police report" });
      const rs = await Promise.all([addFiles("f3", [addFile("f3", "a.pdf")]), addFiles("f3", [addFile("f3", "a.pdf")])]);
      assert.deepEqual(rs.map((r) => r.status).sort(), [200, 409]);
      assert.equal((await db.select().from(schema.caseFiles)).length, 1); assert.equal((await db.select().from(schema.jobs)).length, 1);
    }],
  ];
  let failed = 0;
  for (const [name, fn] of tests) {
    try { await fn(); console.log(`ok - ${name}`); } catch (e) { failed++; console.log(`not ok - ${name}`); console.error(e); }
  }
  delete process.env.CREDITS_ENFORCE;
  console.log(`# split: ${tests.length - failed}/${tests.length} passed`);
  process.exit(failed ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
