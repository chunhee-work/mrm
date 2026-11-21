import { test } from "node:test";
import assert from "node:assert/strict";
import { zipSync, strToU8 } from "fflate";
import { zipNames, zipHasPdf, looksLikePhoto } from "./peek-files";

const zip = (files: Record<string, string>) => new Blob([Buffer.from(zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, strToU8(v)]))))]);

test("R2-B10 zip peek: names come from the central directory; a photos-only zip has no PDF", async () => {
  const withPdf = zip({ "claim.pdf": "%PDF-1", "photos/a.jpg": "x" });
  assert.deepEqual((await zipNames(withPdf))?.sort(), ["claim.pdf", "photos/a.jpg"]);
  assert.equal(await zipHasPdf(withPdf), true);
  assert.equal(await zipHasPdf(zip({ "a.jpg": "x", "b.jpg": "y" })), false);
  assert.equal(await zipHasPdf(zip({ "__MACOSX/._claim.pdf": "x", "a.jpg": "y" })), false);
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
