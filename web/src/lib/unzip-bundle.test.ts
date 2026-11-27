import { test } from "node:test";
import assert from "node:assert/strict";
import { zipSync, strToU8 } from "fflate";
import { unzipBundle, unzipVehicles, ZipRejected } from "./unzip-bundle";

const pdf = strToU8("%PDF-1.4 fake");
const jpg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);

test("B01 unzip: PDFs and photos come out, folders/hidden/other files are skipped", () => {
  const z = zipSync({
    "case/rc.pdf": pdf, "case/photos/front.JPG": jpg, "__MACOSX/case/._rc.pdf": pdf,
    "case/.DS_Store": strToU8("x"), "case/notes.txt": strToU8("hi"), "case/empty.pdf": new Uint8Array(0),
  });
  const r = unzipBundle(z);
  assert.deepEqual(r.map((e) => [e.name, e.kind]).sort(), [["front.JPG", "photo"], ["rc.pdf", "pdf"]]);
  assert.equal(r.find((e) => e.kind === "photo")!.type, "image/jpeg");
});

test("B01 unzip: corrupt zip is rejected with a clear code", () => {
  assert.throws(() => unzipBundle(strToU8("not a zip at all")), (e: ZipRejected) => e.code === "corrupt");
});

test("B01 unzip: a zip with nothing usable is rejected as empty", () => {
  assert.throws(() => unzipBundle(zipSync({ "a.txt": strToU8("x") })), (e: ZipRejected) => e.code === "empty");
});

test("B01 unzip: too many entries and oversize entries are rejected", () => {
  const many: Record<string, Uint8Array> = {};
  for (let i = 0; i < 5; i++) many[`p${i}.pdf`] = pdf;
  assert.throws(() => unzipBundle(zipSync(many), { maxEntries: 3, maxEntryBytes: 1e6, maxTotalBytes: 1e7, maxRatio: 1e6 }), (e: ZipRejected) => e.code === "too_many");
  assert.throws(() => unzipBundle(zipSync({ "a.pdf": pdf }), { maxEntries: 9, maxEntryBytes: 4, maxTotalBytes: 1e7, maxRatio: 1e6 }), (e: ZipRejected) => e.code === "too_big");
});

test("B01 unzip: a zip bomb (huge ratio) is rejected before it is expanded", () => {
  const bomb = zipSync({ "a.pdf": new Uint8Array(5_000_000) }, { level: 9 });
  assert.throws(() => unzipBundle(bomb, { maxEntries: 9, maxEntryBytes: 1e9, maxTotalBytes: 1e9, maxRatio: 50 }), (e: ZipRejected) => e.code === "bomb");
});

test("a zip of several vehicles (one folder each, each with its own PDF) is refused as multi; one vehicle in Docs/ + Photos/ is not", () => {
  const cars = zipSync({ "AAA1/a.pdf": pdf, "AAA1/1.jpg": jpg, "BBB2/b.pdf": pdf, "BBB2/1.jpg": jpg });
  assert.throws(() => unzipBundle(cars), (e: ZipRejected) => e.code === "multi");
  const wrapped = zipSync({ "ALL/AAA1/a.pdf": pdf, "ALL/BBB2/b.pdf": pdf });
  assert.throws(() => unzipBundle(wrapped), (e: ZipRejected) => e.code === "multi");
  const one = zipSync({ "Docs/rc.pdf": pdf, "Photos/1.jpg": jpg });
  assert.equal(unzipBundle(one).length, 2);
  const oneWrapped = zipSync({ "AAA1/Docs/rc.pdf": pdf, "AAA1/Photos/1.jpg": jpg });
  assert.equal(unzipBundle(oneWrapped).length, 2);
});

test("unzipVehicles: one entry list per plate folder (a wrapping folder is looked through); a folder without a PDF is dropped", () => {
  const z = zipSync({ "ALL/AAA1/a.pdf": pdf, "ALL/AAA1/1.jpg": jpg, "ALL/AAA1/2.JPG": jpg, "ALL/BBB2/b.pdf": pdf, "ALL/BBB2/x.txt": strToU8("x"), "ALL/CCC3/1.jpg": jpg, "__MACOSX/ALL/._a": pdf });
  const v = unzipVehicles(z);
  assert.deepEqual([...v.keys()].sort(), ["AAA1", "BBB2"]);
  assert.equal(v.get("AAA1")!.length, 3);
  assert.equal(v.get("BBB2")!.length, 1);
});

test("unzipVehicles: the entry limit counts per vehicle, and a one-vehicle zip is refused as empty", () => {
  const z = zipSync({ "A/a.pdf": pdf, "A/1.jpg": jpg, "A/2.jpg": jpg, "B/b.pdf": pdf });
  assert.throws(() => unzipVehicles(z, { maxEntries: 2, maxEntryBytes: 1e6, maxTotalBytes: 1e7, maxRatio: 1e6 }), (e: ZipRejected) => e.code === "too_many");
  assert.equal(unzipVehicles(z, { maxEntries: 3, maxEntryBytes: 1e6, maxTotalBytes: 1e7, maxRatio: 1e6 }).size, 2);
  assert.throws(() => unzipVehicles(zipSync({ "Docs/a.pdf": pdf, "Photos/1.jpg": jpg })), (e: ZipRejected) => e.code === "empty");
});
