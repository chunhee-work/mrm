import { test } from "node:test";
import assert from "node:assert/strict";
import { readUpTo, withStoredSizes } from "./stored-size";
import { CaseBody, bodyProblem, MAX_PDF_BYTES, MAX_TOTAL_BYTES } from "./case-body";

delete process.env.BLOB_READ_WRITE_TOKEN; // no store is pinned here: the hosts below are made up
const at = (p: string) => `https://x.blob.vercel-storage.com/org1/b1/${p}`;
const file = (name: string, size: number, kind = "pdf") => ({ kind, url: at(name), name, size });

test("S-U4: each file gets the size the store holds, whatever the request said; the order and the other fields stay", async () => {
  const real: Record<string, number> = { [at("a.pdf")]: 5000, [at("p.jpg")]: 70_000 };
  const out = await withStoredSizes([file("a.pdf", 1), file("p.jpg", 999_999_999, "photo")], async (u) => real[u]);
  assert.deepEqual(out, [file("a.pdf", 5000), file("p.jpg", 70_000, "photo")]);
});

test("S-U4: a file that is not in the store, or is empty there, refuses the whole set", async () => {
  assert.equal(await withStoredSizes([file("a.pdf", 10), file("gone.pdf", 10)], async (u) => (u.endsWith("gone.pdf") ? null : 10)), null);
  assert.equal(await withStoredSizes([file("a.pdf", 10)], async () => 0), null);
});

test("S-U4: a store that cannot be asked is an error, never 'the sizes are fine'", async () => {
  await assert.rejects(withStoredSizes([file("a.pdf", 10)], async () => { throw new Error("store down"); }), /store down/);
});

test("S-U4: the same file twice is asked about once, and at most 24 files are asked about at the same time", async () => {
  let asked = 0, open = 0, most = 0;
  const sizeOf = async () => { asked++; open++; most = Math.max(most, open); await new Promise((r) => setTimeout(r, 2)); open--; return 10; };
  const many = Array.from({ length: 100 }, (_, i) => file(`p${i}.jpg`, 1, "photo"));
  const out = await withStoredSizes([...many, many[0], many[1]], sizeOf);
  assert.equal(out?.length, 102);
  assert.equal(asked, 100);
  assert.ok(most > 1 && most <= 24, `asked ${most} at once`);
});

test("S-U4: a PDF that says 10 bytes and holds 24 MB is refused as a PDF too big; small claims that add up to too much are refused as too much", async () => {
  const lie = CaseBody.parse({ files: [file("a.pdf", 10)] });
  assert.equal(bodyProblem(lie, "org1"), null); // what the request says passes
  const real = await withStoredSizes(lie.files, async () => MAX_PDF_BYTES + 1);
  assert.equal(bodyProblem({ files: real! }, "org1"), "pdf_big");
  const zips = CaseBody.parse({ files: Array.from({ length: 5 }, (_, i) => file(`z${i}.zip`, 10, "bundle_zip")) });
  const heavy = await withStoredSizes(zips.files, async () => MAX_TOTAL_BYTES / 5 + 1);
  assert.equal(bodyProblem({ files: heavy! }, "org1"), "total");
  // an honest request is not changed by it
  const fine = await withStoredSizes(lie.files, async () => 10);
  assert.equal(bodyProblem({ files: fine! }, "org1"), null);
});

/** A stream of `chunks` pieces of `size` bytes that counts how many were asked for and whether it was cancelled. */
function source(chunks: number, size: number) {
  const seen = { pulled: 0, cancelled: false };
  const stream = new ReadableStream<Uint8Array>({
    pull(c) { if (seen.pulled >= chunks) return c.close(); seen.pulled++; c.enqueue(new Uint8Array(size).fill(7)); },
    cancel() { seen.cancelled = true; },
  }, { highWaterMark: 0 });
  return { stream, seen };
}

test("S-U4 readUpTo: a file within the limit comes back whole, also one exactly at it", async () => {
  const a = source(3, 100);
  const buf = await readUpTo(a.stream, 300);
  assert.equal(buf?.length, 300);
  assert.ok(buf!.every((b) => b === 7));
  assert.equal((await readUpTo(source(0, 1).stream, 10))?.length, 0);
});

test("S-U4 readUpTo: a file over the limit gives null and the download stops there (the rest is never fetched)", async () => {
  const a = source(1000, 100);
  assert.equal(await readUpTo(a.stream, 250), null);
  assert.equal(a.seen.cancelled, true);
  assert.ok(a.seen.pulled <= 4, `read ${a.seen.pulled} pieces of 1000`);
});
