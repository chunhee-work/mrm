/**
 * B01 + B02 acceptance tests: a zip with 1 PDF + 2 JPGs is opened into the same case files as loose uploads, and every photo of a
 * case (loose or from the zip) reaches the photo naming desk. Real Postgres (PGlite) with the real migrations; the blob store is a Map.
 * Run: npm test
 */
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import Module from "node:module";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { zipSync, strToU8 } from "fflate";
import * as schema from "../src/db/schema";

process.env.PHOTO_STORE_DIR = mkdtempSync(path.join(os.tmpdir(), "photos-"));
const root = path.resolve(__dirname, "..");
const pg = new PGlite();
const db = drizzle(pg, { schema });

const blobs = new Map<string, Buffer>();
const putLog: string[] = [];
let failPutAt = 0; // when set, the put with this number (putLog.length + 1) throws once
const blobStub = {
  get: async (url: string) => (blobs.has(url) ? { statusCode: 200, stream: new Response(blobs.get(url) as unknown as BodyInit).body, blob: { contentType: url.endsWith(".pdf") ? "application/pdf" : url.endsWith(".zip") ? "application/zip" : "image/jpeg" } } : null),
  put: async (p: string, body: Buffer) => { if (failPutAt && putLog.length + 1 === failPutAt) { failPutAt = 0; throw new Error("blob store down"); } putLog.push(p); const url = `https://blob.test/${p}`; blobs.set(url, Buffer.from(body)); return { url, pathname: p }; },
  del: async () => {}, head: async () => ({}), BlobNotFoundError: class extends Error {},
};
const stubs: Record<string, unknown> = { "server-only": {}, "@/db": { db, schema }, "@vercel/blob": blobStub };
const origLoad = (Module as any)._load;
(Module as any)._load = function (request: string, ...rest: unknown[]) {
  return request in stubs ? stubs[request] : origLoad.call(this, request, ...rest);
};

const jpeg = (rgb: [number, number, number]) => sharp({ create: { width: 1800, height: 1200, channels: 3, background: { r: rgb[0], g: rgb[1], b: rgb[2] } } }).jpeg().toBuffer();
const ORG = "o1";
let n = 0;
async function newCase() {
  const id = `c${++n}`;
  await db.insert(schema.cases).values({ id, orgId: ORG, plate: "", status: "uploaded" });
  return id;
}
const addFile = async (caseId: string, kind: string, name: string, bytes: Buffer) => {
  const url = `https://blob.test/${ORG}/batch/${caseId}/${name}`;
  blobs.set(url, bytes);
  await db.insert(schema.caseFiles).values({ caseId, kind, blobUrl: url, originalName: name, size: bytes.length });
};
const files = (id: string) => db.select().from(schema.caseFiles).where(eq(schema.caseFiles.caseId, id));
const desk = (id: string) => db.select().from(schema.casePhotos).where(eq(schema.casePhotos.caseId, id));

async function main() {
  const dir = path.join(root, "drizzle");
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort())
    for (const s of readFileSync(path.join(dir, f), "utf8").split("--> statement-breakpoint")) if (s.trim()) await pg.exec(s);
  await pg.exec("set session_replication_role = replica");
  const { expandBundles } = await import("../src/lib/expand-bundles");
  const { importCasePhotos } = await import("../src/lib/photos/import-files");

  const tests: [string, () => Promise<void>][] = [
    ["B01: a zip with 1 PDF + 2 JPGs becomes 1 pdf + 2 photo case files, like the same files uploaded loose", async () => {
      const id = await newCase();
      const zip = Buffer.from(zipSync({ "claim/rc.pdf": strToU8("%PDF-1.4 x"), "claim/photos/a.jpg": new Uint8Array(await jpeg([200, 10, 10])), "claim/photos/b.jpg": new Uint8Array(await jpeg([10, 200, 10])), "__MACOSX/._a.jpg": strToU8("x") }));
      await addFile(id, "bundle_zip", "bundle.zip", zip);
      assert.equal(await expandBundles(id, ORG), 3);
      const fs = (await files(id)).filter((f) => f.kind !== "bundle_zip");
      assert.deepEqual(fs.map((f) => [f.kind, f.originalName]).sort(), [["pdf", "rc.pdf"], ["photo", "a.jpg"], ["photo", "b.jpg"]]);
      assert.equal(await expandBundles(id, ORG), 0); // opening it twice adds nothing
      assert.equal((await files(id)).length, 4);
    }],
    ["a zip whose opening fails halfway leaves no rows, so the next read opens all of it", async () => {
      const id = await newCase();
      await addFile(id, "bundle_zip", "half.zip", Buffer.from(zipSync({ "a.pdf": strToU8("%PDF-1.4 a"), "b.pdf": strToU8("%PDF-1.4 b"), "c.pdf": strToU8("%PDF-1.4 c") })));
      failPutAt = putLog.length + 2; // the second file cannot be stored
      await assert.rejects(expandBundles(id, ORG), /blob store down/);
      assert.equal((await files(id)).length, 1); // only the zip itself: no partial set marked as opened
      assert.equal(await expandBundles(id, ORG), 3);
      assert.equal((await files(id)).length, 4);
    }],
    ["B01: a corrupt or empty zip fails with a clear reason", async () => {
      const id = await newCase(); await addFile(id, "bundle_zip", "bad.zip", Buffer.from("not a zip"));
      await assert.rejects(expandBundles(id, ORG), /bad\.zip: the zip cannot be opened/);
      const id2 = await newCase(); await addFile(id2, "bundle_zip", "e.zip", Buffer.from(zipSync({ "a.txt": strToU8("x") })));
      await assert.rejects(expandBundles(id2, ORG), /no PDF or photo/);
    }],
    ["B02: creating a case with 6 loose JPGs gives 6 desk photos, each with a ~900 px copy and the original", async () => {
      const id = await newCase();
      for (let i = 0; i < 6; i++) await addFile(id, "photo", `p${i}.jpg`, await jpeg([i * 40, 90, 200 - i * 30]));
      const r = await importCasePhotos(id, ORG);
      assert.equal(r.added, 6);
      const ph = await desk(id);
      assert.equal(ph.length, 6);
      assert.deepEqual(ph.map((p) => p.origN).sort(), [1, 2, 3, 4, 5, 6]);
      assert.ok(ph.every((p) => p.nameState === "pending" && p.blobPath.startsWith(`${ORG}/${id}/photos/`) && p.thumbPath.includes("-s-")));
      const thumb = readdirSync(process.env.PHOTO_STORE_DIR!).find((f) => f.includes(`${id}__photos`) && f.includes("-s-"))!;
      const meta = await sharp(readFileSync(path.join(process.env.PHOTO_STORE_DIR!, thumb))).metadata();
      assert.ok(Math.max(meta.width!, meta.height!) <= 900);
    }],
    ["B02: photos from inside a zip reach the desk too; running it again adds nothing; the same picture twice is one photo", async () => {
      const id = await newCase();
      const same = new Uint8Array(await jpeg([5, 5, 5]));
      await addFile(id, "bundle_zip", "z.zip", Buffer.from(zipSync({ "r.pdf": strToU8("%PDF-1.4"), "1.jpg": same, "2.jpg": same, "3.jpg": new Uint8Array(await jpeg([9, 99, 9])) })));
      await expandBundles(id, ORG);
      assert.equal((await importCasePhotos(id, ORG)).added, 2);
      assert.equal((await desk(id)).length, 2);
      assert.equal((await importCasePhotos(id, ORG)).added, 0);
    }],
    ["B02: HEIC and unreadable images are left out and reported; the rest still goes on", async () => {
      const id = await newCase();
      await addFile(id, "photo", "ok.jpg", await jpeg([1, 2, 3])); await addFile(id, "photo", "x.heic", Buffer.from("heic")); await addFile(id, "photo", "bad.jpg", Buffer.from("not an image"));
      const r = await importCasePhotos(id, ORG);
      assert.equal(r.added, 1); assert.deepEqual(r.skipped.sort(), ["bad.jpg", "x.heic"]);
    }],
    ["R2-B09/B14: photos come onto the desk in file-name order (zip-entry order is not used), many at once, none lost or doubled", async () => {
      const id = await newCase();
      const names = ["03_bonnet.jpg", "01_front.jpg", "10_roof.jpg", "02_lamp.jpg", "06_plate.jpg"];
      const zipFiles: Record<string, Uint8Array> = { "r.pdf": strToU8("%PDF-1.4") };
      for (const [i, nm] of names.entries()) zipFiles[nm] = new Uint8Array(await jpeg([i * 50, 20 * i, 255 - i * 40]));
      await addFile(id, "bundle_zip", "z.zip", Buffer.from(zipSync(zipFiles)));
      await expandBundles(id, ORG);
      assert.equal((await importCasePhotos(id, ORG)).added, 5);
      const ph = (await desk(id)).sort((a, b) => a.position - b.position);
      assert.deepEqual(ph.map((p) => p.srcName), ["01_front.jpg", "02_lamp.jpg", "03_bonnet.jpg", "06_plate.jpg", "10_roof.jpg"]);
      assert.deepEqual(ph.map((p) => p.origN), [1, 2, 3, 4, 5]);
    }],
  ];
  let failed = 0;
  for (const [name, fn] of tests) {
    try { await fn(); console.log("ok   -", name); } catch (e) { failed++; console.log("FAIL -", name, "\n      ", (e as Error).message); }
  }
  console.log(`\n${tests.length - failed}/${tests.length} passed`);
  process.exit(failed ? 1 : 0);
}
main();
