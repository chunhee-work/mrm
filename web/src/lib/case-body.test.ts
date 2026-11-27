import { test } from "node:test";
import assert from "node:assert/strict";
import { CaseBody, bodyProblem } from "./case-body";

delete process.env.BLOB_READ_WRITE_TOKEN; // no store is pinned here, whatever this machine has set: the hosts below are made up
const ok = (over = {}) => ({ files: [{ kind: "pdf", url: "https://x.blob.vercel-storage.com/org1/b1/a.pdf", name: "a.pdf", size: 10, ...over }] });

test("B05/B06 body: a normal pdf passes; empty or negative size, huge size and bad kind fail the schema", () => {
  assert.ok(CaseBody.safeParse(ok()).success);
  assert.ok(!CaseBody.safeParse(ok({ size: 0 })).success);
  assert.ok(!CaseBody.safeParse(ok({ size: 600 * 1024 * 1024 })).success);
  assert.ok(!CaseBody.safeParse(ok({ kind: "exe" })).success);
  assert.ok(!CaseBody.safeParse({ files: [] }).success);
});

test("B05 body: urls outside the organisation's prefix are refused (no pointing a case at another org's file)", () => {
  const b = CaseBody.parse(ok({ url: "https://x.blob.vercel-storage.com/org2/b1/a.pdf" }));
  assert.equal(bodyProblem(b, "org1"), "prefix");
  assert.equal(bodyProblem(CaseBody.parse(ok()), "org1"), null);
});

test("B05 body: file type must match its kind and the allow-list", () => {
  assert.equal(bodyProblem(CaseBody.parse(ok({ name: "a.exe" })), "org1"), "kind");
  assert.equal(bodyProblem(CaseBody.parse(ok({ kind: "photo", name: "a.pdf" })), "org1"), "kind");
});

test("B06 body: photos only (no PDF and no zip) is refused before a case is made", () => {
  assert.equal(bodyProblem(CaseBody.parse(ok({ kind: "photo", name: "a.jpg", url: "https://x.blob.vercel-storage.com/org1/b/a.jpg" })), "org1"), "no_docs");
});

test("B07 body: a PDF over the reader's limit is refused with its own reason", () => {
  assert.equal(bodyProblem(CaseBody.parse(ok({ size: 30 * 1024 * 1024 })), "org1"), "pdf_big");
  assert.equal(bodyProblem(CaseBody.parse(ok({ size: 24 * 1024 * 1024 })), "org1"), "pdf_big"); // it was taken here and then could never be read
  assert.equal(bodyProblem(CaseBody.parse(ok({ size: 23 * 1024 * 1024 })), "org1"), null);
});

test("U3 body: a file whose name has two dots in a row is accepted; a path that steps out of the folder is not", () => {
  const at = (path: string, name = "a.pdf") => bodyProblem(CaseBody.parse(ok({ url: `https://x.blob.vercel-storage.com/${path}`, name })), "org1");
  assert.equal(at("org1/b1/report..final.pdf", "report..final.pdf"), null);
  assert.equal(bodyProblem(CaseBody.parse({ files: [...ok().files, { kind: "photo", url: "https://x.blob.vercel-storage.com/org1/b1/IMG..1.jpg", name: "IMG..1.jpg", size: 5 }] }), "org1"), null);
  assert.equal(at("org1/%2e%2e/org2/a.pdf"), "prefix");
  assert.equal(at("org1/b1%2f..%2f..%2forg2/a.pdf"), "prefix");
  assert.equal(at("org1/b1%5c..%5ca.pdf"), "prefix");
});

test("U8 body: a file URL that is not https on the file store is refused, whatever its path says", () => {
  const url = (u: string) => bodyProblem(CaseBody.parse(ok({ url: u })), "org1");
  assert.equal(url("https://x.example/org1/b1/a.pdf"), "prefix");
  assert.equal(url("http://169.254.169.254/org1/b1/a.pdf"), "prefix");
  assert.equal(url("http://x.blob.vercel-storage.com/org1/b1/a.pdf"), "prefix");
  assert.equal(url("https://blob.vercel-storage.com.evil.example/org1/b1/a.pdf"), "prefix");
});
