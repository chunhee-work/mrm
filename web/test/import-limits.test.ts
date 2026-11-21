// Zip import limits (plan #48, G7): too many images or a too-big bundle is refused with a clear error; HEIC is counted, not silently lost.
import test from "node:test";
import assert from "node:assert/strict";
import { zipSync } from "fflate";
import { MAX_ZIP_ENTRIES, unzipImages } from "../src/components/photos/import-files";

const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);

test("a normal bundle is unpacked in natural order and HEIC files are counted", async () => {
  const z = zipSync({ "IMG_10.jpg": jpeg, "IMG_2.jpg": jpeg, "IMG_3.heic": jpeg, "__MACOSX/x.jpg": jpeg });
  const r = await unzipImages(z);
  assert.deepEqual(r.files.map((f) => f.name), ["IMG_2.jpg", "IMG_10.jpg"]);
  assert.equal(r.heic, 1);
});

test("a bundle with too many images is refused", async () => {
  const many: Record<string, Uint8Array> = {};
  for (let i = 0; i <= MAX_ZIP_ENTRIES; i++) many[`p${i}.jpg`] = jpeg;
  await assert.rejects(unzipImages(zipSync(many)), /too_big/);
});

test("a corrupt zip is refused, not half imported", async () => {
  await assert.rejects(unzipImages(new Uint8Array([1, 2, 3, 4, 5])));
});
