import { test } from "node:test";
import assert from "node:assert/strict";
import { zipSync, strToU8 } from "fflate";
import { unzipBundle, planVehicles, unzipVehicle, ZipRejected } from "./unzip-bundle";

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

test("a zip of several cars (plate-named folders, each with its own PDF) is refused as multi on the one-case path", () => {
  const cars = zipSync({ "AAA1/a.pdf": pdf, "AAA1/1.jpg": jpg, "BBB2/b.pdf": pdf, "BBB2/1.jpg": jpg });
  assert.throws(() => unzipBundle(cars), (e: ZipRejected) => e.code === "multi");
  const wrapped = zipSync({ "ALL/WA1234B/a.pdf": pdf, "ALL/TBD 8129/b.pdf": pdf });
  assert.throws(() => unzipBundle(wrapped), (e: ZipRejected) => e.code === "multi");
});

test("one car sorted into folders by what they hold stays one case (Docs/Photos, Policy/Claim/Police Report, dates)", () => {
  assert.equal(unzipBundle(zipSync({ "Docs/rc.pdf": pdf, "Photos/1.jpg": jpg })).length, 2);
  assert.equal(unzipBundle(zipSync({ "Policy/p.pdf": pdf, "Claim/c.pdf": pdf, "Police Report/r.pdf": pdf })).length, 3);
  assert.equal(unzipBundle(zipSync({ "2026-11-01/a.pdf": pdf, "2026-11-02/b.pdf": pdf })).length, 2);
  assert.equal(unzipBundle(zipSync({ "AAA1/Docs/rc.pdf": pdf, "AAA1/Photos/1.jpg": jpg })).length, 2);
});

test("planVehicles: one plan per plate folder from the file list; a plate folder without a PDF is not a car", () => {
  const z = zipSync({ "ALL/AAA1/a.pdf": pdf, "ALL/AAA1/1.jpg": jpg, "ALL/AAA1/2.JPG": jpg, "ALL/BBB2/b.pdf": pdf, "ALL/BBB2/x.txt": strToU8("x"), "ALL/CCC3/1.jpg": jpg, "__MACOSX/ALL/._a": pdf });
  const plan = planVehicles(z);
  assert.deepEqual(plan.map((v) => [v.plate, v.files]), [["AAA1", 3], ["BBB2", 1]]);
  assert.deepEqual(unzipVehicle(z, plan[0].prefix).map((e) => e.name).sort(), ["1.jpg", "2.JPG", "a.pdf"]);
  assert.deepEqual(unzipVehicle(z, plan[1].prefix).map((e) => e.name), ["b.pdf"]);
});

test("planVehicles: limits per car, too many cars, and a one-car zip are refused before anything is inflated", () => {
  const z = zipSync({ "AA1/a.pdf": pdf, "AA1/1.jpg": jpg, "AA1/2.jpg": jpg, "BB2/b.pdf": pdf });
  assert.throws(() => planVehicles(z, { maxEntries: 2, maxEntryBytes: 1e6, maxTotalBytes: 1e7, maxRatio: 1e6 }), (e: ZipRejected) => e.code === "too_many" && e.message === "too many files in the zip");
  assert.equal(planVehicles(z, { maxEntries: 3, maxEntryBytes: 1e6, maxTotalBytes: 1e7, maxRatio: 1e6 }).length, 2);
  const many: Record<string, Uint8Array> = {};
  for (let i = 0; i < 31; i++) many[`C${i}/a.pdf`] = pdf;
  assert.throws(() => planVehicles(zipSync(many)), (e: ZipRejected) => e.message === "the zip holds too many vehicles");
  assert.throws(() => planVehicles(zipSync({ "Docs/a.pdf": pdf, "Photos/1.jpg": jpg })), (e: ZipRejected) => e.code === "empty");
});

test("planVehicles: a car folder whose PDFs are all empty is dropped; a PDF too big to read is refused before anything is stored", () => {
  const pdf = strToU8("%PDF-1.4 x");
  const plan = planVehicles(zipSync({ "AAA1111/a.pdf": pdf, "BBB2222/a.pdf": pdf, "CCC3333/a.pdf": new Uint8Array(0), "CCC3333/1.jpg": strToU8("jpg") }));
  assert.deepEqual(plan.map((v) => v.plate), ["AAA1111", "BBB2222"]);
  assert.throws(() => planVehicles(zipSync({ "AAA1111/a.pdf": pdf, "BBB2222/b.pdf": pdf }), { maxEntries: 300, maxEntryBytes: 1e6, maxTotalBytes: 1e7, maxRatio: 1e6, maxPdfBytes: 5 }),
    (e: ZipRejected) => e.code === "pdf_big" && e.message === "a PDF in the zip is larger than 25 MB");
});

test("planVehicles: more than 30 cars has its own code, not the one for too many files", () => {
  const many: Record<string, Uint8Array> = {};
  for (let i = 0; i < 31; i++) many[`AB${1000 + i}/a.pdf`] = strToU8("%PDF");
  assert.throws(() => planVehicles(zipSync(many)), (e: ZipRejected) => e.code === "too_many_cars");
});

test("numbered folders (Doc1, Car 2, Day 1) and month folders (Nov 2026) of one car stay one case", () => {
  const pdf = strToU8("%PDF");
  for (const [a, b] of [["Doc1", "Doc2"], ["Car 1", "Car 2"], ["Day 1", "Day 2"], ["Nov 2026", "Dec 2026"], ["Set 1", "Set 2"]]) {
    const z = zipSync({ [`${a}/a.pdf`]: pdf, [`${b}/b.pdf`]: pdf });
    assert.equal(unzipBundle(z).length, 2, a);
    assert.throws(() => planVehicles(z), (e: ZipRejected) => e.code === "empty", a);
  }
});
