import { test } from "node:test";
import assert from "node:assert/strict";
import { zipSync, strToU8 } from "fflate";
import { zipNames, zipHasPdf, looksLikePhoto, vehicleFolders, vehicleLayout, PLATE_LIKE, isPlate, platesAnywhere, hasPdfName } from "./peek-files";

const zip = (files: Record<string, string>) => new Blob([Buffer.from(zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, strToU8(v)]))))]);

test("R2-B10 zip peek: names come from the central directory; a photos-only zip has no PDF", async () => {
  const withPdf = zip({ "claim.pdf": "%PDF-1", "photos/a.jpg": "x" });
  assert.deepEqual((await zipNames(withPdf))?.sort(), ["claim.pdf", "photos/a.jpg"]);
  assert.equal(await zipHasPdf(withPdf), true);
  assert.equal(await zipHasPdf(zip({ "a.jpg": "x", "b.jpg": "y" })), false);
  assert.equal(await zipHasPdf(zip({ "__MACOSX/._claim.pdf": "x", "a.jpg": "y" })), false);
  // empty entries are never case files, so they are not listed: an empty PDF is no PDF, and an empty plate folder elsewhere is no car
  assert.deepEqual(await zipNames(zip({ "WA1234B/a.pdf": "%PDF-1", "Police/NCH5773/b.pdf": "" })), ["WA1234B/a.pdf"]);
  assert.equal(await zipHasPdf(zip({ "claim.pdf": "", "a.jpg": "y" })), false);
});

test("R2-B10 zip peek: a file that is not a zip, or too small, cannot be told (null), never throws", async () => {
  assert.equal(await zipNames(new Blob(["hello, I am not a zip file at all, really"])), null);
  assert.equal(await zipHasPdf(new Blob(["x"])), null);
});

test("R2-B10 a text file renamed .jpg is not a photo; real jpeg/png/webp/heic headers are", () => {
  assert.equal(looksLikePhoto(new TextEncoder().encode("this is text")), false);
  assert.equal(looksLikePhoto(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0])), true);
  assert.equal(looksLikePhoto(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0])), true);
  assert.equal(looksLikePhoto(new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 ")), true);
  assert.equal(looksLikePhoto(new Uint8Array([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63])), true);
  assert.equal(looksLikePhoto(new Uint8Array(0)), false);
});

test("vehicleFolders: plate-named folders with a PDF; folders named by content or date are not cars", () => {
  assert.deepEqual(vehicleFolders(["DCD4004/a.pdf", "DCD4004/1.JPG", "TBD 8129/b.pdf", "Photos/1.jpg"]), ["DCD4004", "TBD 8129"]);
  assert.deepEqual(vehicleFolders(["SINAR/QAT110/a.pdf", "SINAR/WA1234B/b.pdf"]), ["QAT110", "WA1234B"]);
  assert.deepEqual(vehicleFolders(["Policy/a.pdf", "Claim/b.pdf"]), []);
  for (const p of ["DCD4004", "QAT110", "TBD 8129", "WA1234B", "V 1"]) assert.ok(PLATE_LIKE.test(p), p);
  for (const p of ["Policy", "Docs", "2026-11-01", "Photos 2", "SINAR"]) assert.ok(!PLATE_LIKE.test(p), p);
});

test("isPlate: real plates yes; numbered words and month-year folder names no", () => {
  for (const p of ["DCD4004", "QAT110", "TBD 8129", "WA1234B", "V 1", "NOV2026A", "PDF 1234A", "JAN 1234", "CAR 5678", "MAR 345", "SET 777"]) assert.ok(isPlate(p), p);
  for (const p of ["Doc1", "DOC 2", "Car 1", "Set3", "IMG 2", "IMG 001", "Doc 001", "Day 1", "PDF2", "Nov 2026", "Nov 26", "Nov 3", "JAN2025",
    "Mac 2026", "Mei 2026", "Okt 2026", "Dis 2025", "Policy", "2026-11-01"]) assert.ok(!isPlate(p), p);
});

test("vehicleFolders: a readme or a hidden folder beside the wrapping folder does not hide the cars", () => {
  const names = ["SINAR/AAA1111/a.pdf", "SINAR/BBB2222/b.pdf", "notes/readme.txt", ".x/c.pdf", "__MACOSX/SINAR/._a.pdf"];
  assert.deepEqual(vehicleFolders(names), ["AAA1111", "BBB2222"]);
});

test("vehicleLayout: every other folder or loose file a case would take is an extra (a split then refuses, nothing is dropped)", () => {
  assert.deepEqual(vehicleLayout(["AAA1111/a.pdf", "BBB2222/b.pdf", "SINAR-1/c.pdf"]), { cars: ["AAA1111/", "BBB2222/"], extras: ["SINAR-1/"] });
  assert.deepEqual(vehicleLayout(["S/AAA1111/a.pdf", "S/BBB2222/b.pdf", "S/Gambar/1.jpg", "S/cover.pdf"]).extras.sort(), ["S/Gambar/", "S/cover.pdf"]);
  assert.deepEqual(vehicleLayout(["AAA1111/a.pdf", "BBB2222/b.pdf", "CCC3333/1.jpg", "notes.txt"]).extras, ["CCC3333/"]);
  assert.deepEqual(vehicleLayout(["AAA1111/a.pdf", "BBB2222/b.pdf"]).extras, []);
});

test("vehicleLayout: cars inside a wrapping folder are found even with a loose file or another folder beside it (both are extras)", () => {
  assert.deepEqual(vehicleLayout(["SINAR/AAA1111/a.pdf", "SINAR/BBB2222/b.pdf", "cover.pdf"]), { cars: ["SINAR/AAA1111/", "SINAR/BBB2222/"], extras: ["cover.pdf"] });
  assert.deepEqual(vehicleLayout(["SINAR/AAA1111/a.pdf", "SINAR/BBB2222/b.pdf", "Photos/1.jpg"]).extras, ["Photos/1.jpg"]);
  assert.deepEqual(vehicleLayout(["Docs/a.pdf", "Photos/1.jpg", "cover.pdf"]), { cars: [], extras: ["Docs/", "Photos/", "cover.pdf"] });
});

test("platesAnywhere: only the outermost plate-named folder of a path counts (a plate-like sub-folder of one car is not a second car)", () => {
  assert.equal(platesAnywhere(["WA1234B/KP1/x.pdf", "WA1234B/Docs/y.pdf"]), 1);
  assert.equal(platesAnywhere(["DCD4004/a.pdf", "More/NCH5773/e.pdf"]), 2);
  assert.equal(platesAnywhere(["Docs/a.pdf", "__MACOSX/AAA1111/b.pdf", ".x/BBB2222/c.pdf"]), 0);
});

test("vehicleLayout: plate-like folders inside one car's plate folder are part of that car, never cars of their own", () => {
  assert.deepEqual(vehicleLayout(["WA1234B/claim.pdf", "WA1234B/KP1/a.pdf", "WA1234B/KP2/b.pdf"]).cars, ["WA1234B/"]);
  assert.deepEqual(vehicleLayout(["WA1234B/KP1/a.pdf", "WA1234B/KP2/b.pdf"]).cars, ["WA1234B/"]);
  assert.deepEqual(vehicleLayout(["S/AAA1111/a.pdf", "S/BBB2222/b.pdf"]).cars, ["S/AAA1111/", "S/BBB2222/"]);
  assert.equal(platesAnywhere(["WA1234B/a.pdf", "X/NCH5773/._a.pdf"]), 1);
});

test("zipNames: a central directory that does not start with an entry cannot be told (null), never an empty list", async () => {
  const good = new Uint8Array(await zip({ "a.pdf": "x" }).arrayBuffer());
  const bad = good.slice();
  const dv = new DataView(bad.buffer);
  const eocd = bad.length - 22;
  dv.setUint32(eocd + 16, 0, true); // point the list at the first local header
  assert.equal(await zipNames(new Blob([bad])), null);
});

test("platesAnywhere: short folder numbers (KP1, A1) never make a one-car zip 'layout'; a hidden folder hides its PDF", async () => {
  assert.equal(platesAnywhere(["Claim/a.pdf", "KP1/b.pdf", "Policy/KP2/c.pdf"]), 0);
  assert.equal(await zipHasPdf(zip({ ".backup/claim.pdf": "x", "a.jpg": "y" })), false);
});

test("zipNames: fewer entries than the end record says (list damaged part-way) cannot be told (null)", async () => {
  const good = new Uint8Array(await zip({ "a.pdf": "x", "b.pdf": "y" }).arrayBuffer());
  const dv = new DataView(good.buffer);
  const e = good.length - 22;
  dv.setUint16(e + 10, 3, true);
  assert.equal(await zipNames(new Blob([good])), null);
});

test("vehicleLayout: a batch folder whose name looks like a plate is looked through when it holds two or more real plates", () => {
  assert.deepEqual(vehicleLayout(["AIG2026/DCD4004/a.pdf", "AIG2026/NCH5773/b.pdf", "AIG2026/WA1234B/c.pdf"]).cars,
    ["AIG2026/DCD4004/", "AIG2026/NCH5773/", "AIG2026/WA1234B/"]);
  assert.deepEqual(vehicleLayout(["WA1234B/KP1/a.pdf", "WA1234B/KP2/b.pdf"]).cars, ["WA1234B/"]);
  assert.equal(hasPdfName([".backup/claim.pdf", "Docs/.old/a.pdf", "x/__MACOSX/b.pdf"]), true); // only a top __MACOSX/ is hidden, as on the server
  assert.equal(hasPdfName([".backup/claim.pdf", "Docs/.old/a.pdf"]), false);
});

test("vehicleLayout: a car folder holding its own files plus other plates' folders stays that one car (never looked through)", () => {
  assert.deepEqual(vehicleLayout(["WA1234B/claim.pdf", "WA1234B/NCH5773/r.pdf", "WA1234B/DCD4004/s.pdf"]).cars, ["WA1234B/"]);
});
